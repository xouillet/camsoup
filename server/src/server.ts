import { createWorker } from "mediasoup";
import express from "express";
import { Consumer, Router, WebRtcTransport } from "mediasoup/lib/types";
import ioserver, { Socket } from "socket.io";

interface Client {
  id: string;
  consumerTransport?: WebRtcTransport;
  consumer?: Consumer;
}

let clients: { [id: string]: Client } = {};

const videoCodec = {
  mimeType: "video/VP8",
  clockRate: 90000,
  payloadType: 101,
  rtcpFeedback: [
    { type: "nack" },
    { type: "nack", parameter: "pli" },
    { type: "ccm", parameter: "fir" },
    { type: "goog-remb" },
    { type: "transport-cc" },
  ],
};

async function initMediasoup() {
  const worker = await createWorker({
    logLevel: "warn",
  });

  const router = await worker.createRouter({
    mediaCodecs: [{ kind: "video", ...videoCodec }],
  });

  return router;
}

async function mediasoupNewStream(router: Router) {
  const videoTransport = await router.createPlainTransport({
    listenIp: "127.0.0.1",
    rtcpMux: true,
    comedia: true,
  });

  console.log(
    `Listening on RTP ${videoTransport.tuple.localPort} and RTCP ${videoTransport.rtcpTuple?.localPort};`
  );

  const videoProducer = await videoTransport.produce({
    kind: "video",
    rtpParameters: {
      codecs: [videoCodec],
      encodings: [{ ssrc: 1989 }],
    },
  });

  return { transport: videoTransport, producer: videoProducer };
}

async function main() {
  const app = express();
  const server = require("http").Server(app);
  const port = 8080; // default port to listen

  const router = await initMediasoup();
  const webcam = await mediasoupNewStream(router);

  const socketServer = ioserver(server, {
    path: "/server",
    serveClient: false,
  });

  socketServer.on("connection", (socket) => {
    console.log("client connected");
    clients[socket.id] = { id: socket.id };

    socket.on("disconnect", () => {
      console.log("client disconnected");
      delete clients[socket.id];
    });

    socket.on("connect_error", (err) => {
      console.error("client connection error", err);
    });

    socket.on("getRouterRtpCapabilities", (data, callback) => {
      callback(router.rtpCapabilities);
    });

    socket.on("createConsumerTransport", async (data, callback) => {
      try {
        const transport = await router.createWebRtcTransport({
          listenIps: [
            {
              ip: "192.168.1.91",
            },
          ],
        });
        clients[socket.id].consumerTransport = transport;
        callback({
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        });
      } catch (err) {
        console.error(err);
        callback({ error: err.message });
      }
    });

    socket.on("connectConsumerTransport", async (data, callback) => {
      if (clients[socket.id].consumerTransport) {
        await clients[socket.id].consumerTransport!.connect({
          dtlsParameters: data.dtlsParameters,
        });
      }
      callback();
    });

    socket.on("consume", async (data, callback) => {
      const consumer = await clients[socket.id].consumerTransport!.consume({
        producerId: webcam.producer.id,
        rtpCapabilities: data.rtpCapabilities,
        paused: false,
      });
      clients[socket.id].consumer = consumer;
      callback({
        producerId: webcam.producer.id,
        id: consumer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
        producerPaused: consumer.producerPaused,
      });
    });

    socket.on("resume", async (data, callback) => {
      await clients[socket.id].consumer!.resume();
      callback();
    });
  });

  app.use(express.static("./dist/"));

  // start the Express server
  server.listen(port, async () => {
    console.log(`server started at http://localhost:${port}`);
  });
}

main();
