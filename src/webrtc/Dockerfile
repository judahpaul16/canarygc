FROM debian:latest

# Install dependencies
RUN apt-get update && apt-get install -y wget ffmpeg

# Set working directory
WORKDIR /

# Install MediaMTX
RUN wget https://github.com/bluenviron/mediamtx/releases/download/v1.7.0/mediamtx_v1.7.0_linux_arm64v8.tar.gz && \
    tar -xvzf mediamtx_v1.7.0_linux_arm64v8.tar.gz && \
    rm mediamtx_v1.7.0_linux_arm64v8.tar.gz

# Configure MediaMTX
RUN { \
    echo "  cam1:"; \
    echo "    runOnInit: bash -c 'libcamera-vid -t 0 --width 1280 --height 720 --inline --listen -o - | ffmpeg -fflags +genpts -i /dev/stdin -c:v libx264 -preset ultrafast -tune zerolatency -profile:v baseline -x264-params 'nal-hrd=cbr:force-cfr=1' -b:v 2M -maxrate 2M -bufsize 4M -g 60 -keyint_min 60 -sc_threshold 0 -f rtsp -rtsp_transport tcp rtsp://localhost:8554/cam1'"; \
    echo "    runOnInitRestart: yes"; \
} >> /mediamtx.yml

# Start MediaMTX
CMD ["/mediamtx", "/mediamtx.yml"]