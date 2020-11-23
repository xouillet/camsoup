import "milligram";
import { Device } from "mediasoup-client";
import ioclient from "socket.io-client";

function socketRequest(
  socket: SocketIOClient.Socket,
  params: { type: string; data: any }
): Promise<any> {
  return new Promise((resolve) => {
    socket.emit(params.type, params.data, resolve);
  });
}
const SERVER = "/";

async function start(): Promise<void> {
  console.log("Starting...");
  const opts = {
    path: "/server",
    transports: ["websocket"],
  };
  const socket = ioclient(SERVER, opts);
  const stream = new MediaStream();

  console.log("Socket io ok, trying to connect...");

  const data = await socketRequest(socket, {
    type: "createConsumerTransport",
    data: { forceTcp: false },
  });
  console.log(`Ok got ${data} with createConsumerTransport`);

  const device = new Device();
  const routerRtpCapabilities = await socketRequest(socket, {
    type: "getRouterRtpCapabilities",
    data: {},
  });
  console.log(`Ok got ${routerRtpCapabilities} with routerRtpCapabilities`);
  await device.load({ routerRtpCapabilities });

  const transport = device.createRecvTransport(data);
  transport.on("connect", ({ dtlsParameters }, callback, errback) => {
    console.log(`Anddd we're almost connected`);
    socketRequest(socket, {
      type: "connectConsumerTransport",
      data: {
        transportId: transport.id,
        dtlsParameters,
      },
    })
      .then(callback)
      .catch(errback);
  });

  transport.on("connectionstatechange", async (state) => {
    switch (state) {
      case "connecting":
        document.getElementById("status")!.innerHTML = "subscribing...";
        break;

      case "connected":
        document.getElementById("status")!.innerHTML = "connected...";
        (document.getElementById(
          "video"
        ) as HTMLMediaElement).srcObject = stream;
        await socketRequest(socket, { type: "resume", data: {} });
        break;
      case "failed":
        transport.close();
        document.getElementById("status")!.innerHTML = "Katastrophe !!";
        break;

      default:
        break;
    }
  });

  console.log("Let's consume !");
  const { rtpCapabilities } = device;
  const rtpData = await socketRequest(socket, {
    type: "consume",
    data: { rtpCapabilities },
  });
  console.log("Got consume form server");

  const consumer = await transport.consume(rtpData);

  stream.addTrack(consumer.track);
  console.log("Ok");
}

async function v4lAction(action: string): Promise<void> {
  await fetch(SERVER + "/v4l", {
    body: JSON.stringify({ action }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

start();
(window as any).v4lAction = v4lAction;
