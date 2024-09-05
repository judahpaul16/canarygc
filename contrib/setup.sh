#!/bin/bash

# Update system and install necessary packages
sudo apt-get update
sudo apt-get -y install docker.io

DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
mkdir -p $DOCKER_CONFIG/cli-plugins
curl -SL https://github.com/docker/compose/releases/download/v2.3.3/docker-compose-linux-aarch64 -o $DOCKER_CONFIG/cli-plugins/docker-compose
chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose

# May need to logout and login to apply docker group changes
sudo usermod -aG docker $(whoami)

# Define service files and commands
SERVICE_DIR="/etc/systemd/system"
LIBCAMERA_SERVICE="$SERVICE_DIR/libcamera-vid.service"
FFMPEG_SERVICE="$SERVICE_DIR/ffmpeg.service"
HTTP_SERVER_SERVICE="$SERVICE_DIR/http-server.service"

# Create libcamera-vid service
sudo tee $LIBCAMERA_SERVICE > /dev/null << EOF
[Unit]
Description=Libcamera Video Stream
After=network.target

[Service]
WorkingDirectory=/home/$(whoami)
ExecStart=/usr/bin/libcamera-vid -t 0 --inline --listen -o tcp://0.0.0.0:8556
Restart=always
User=$(whoami)

[Install]
WantedBy=multi-user.target
EOF

# Create ffmpeg service
sudo tee $FFMPEG_SERVICE > /dev/null << EOF
[Unit]
Description=FFmpeg HLS Streaming
After=network.target

[Service]
WorkingDirectory=/home/$(whoami)
ExecStart=/usr/bin/ffmpeg -i tcp://0.0.0.0:8556 -c:v libx264 -f hls -hls_time 10 -hls_list_size 10 -hls_flags delete_segments stream.m3u8
Restart=always
User=$(whoami)

[Install]
WantedBy=multi-user.target
EOF

# Create http-server service
sudo tee $HTTP_SERVER_SERVICE > /dev/null << EOF
[Unit]
Description=Python HTTP Server
After=network.target

[Service]
WorkingDirectory=/home/$(whoami)
ExecStart=/usr/bin/python3 -m http.server 8554
Restart=always
User=$(whoami)

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd to apply changes
sudo systemctl daemon-reload

# Enable and start services
sudo systemctl enable libcamera-vid.service
sudo systemctl enable ffmpeg.service
sudo systemctl enable http-server.service

sudo systemctl start libcamera-vid.service
sudo systemctl start ffmpeg.service
sudo systemctl start http-server.service

sudo systemctl status libcamera-vid.service --no-pager
sudo systemctl status ffmpeg.service --no-pager
sudo systemctl status http-server.service --no-pager

echo "Services have been created and started."