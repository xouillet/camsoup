#! /bin/bash
# Send video0 cam to camsoup

if [ -z "$1" ]; then
    echo "Usage: $0 rtp_port"
    exit 1
fi

ffmpeg -re -v info -stream_loop -1 -f v4l2 -input_format mjpeg -framerate 30 -i /dev/video0 \
       -map 0:v:0 -pix_fmt yuv420p -c:v libvpx -b:v 1000k -deadline realtime \
        -cpu-used 4 -f tee -s 1280x720 \
        [select=v:f=rtp:ssrc=1989:payload_type=101]rtp://127.0.0.1:$1
