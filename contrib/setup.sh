#!/bin/bash

# Update system and install necessary packages
sudo apt-get update
sudo apt-get -y install docker.io nginx ufw wget

# Enable and start the firewall
echo "y" | sudo ufw enable
sudo ufw allow 22
sudo ufw allow 8090
sudo ufw allow 8889
sudo ufw allow 5173
sudo ufw allow in on wwan0
sudo ufw allow out on wwan0
echo "y" | sudo ufw reload

sudo chown -R $(whoami):www-data /home/$(whoami)

DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
# check if docker compose is installed

if ! [ "$(command -v docker compose)" ]; then
    mkdir -p $DOCKER_CONFIG/cli-plugins
    curl -SL https://github.com/docker/compose/releases/download/v2.3.3/docker-compose-linux-aarch64 -o $DOCKER_CONFIG/cli-plugins/docker-compose
    chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose
fi

# May need to logout and login to apply docker group changes
if ! docker ps >/dev/null 2>&1; then
    echo "Docker installed. Adding $(whoami) to the 'docker' group..."
    sudo usermod -aG docker $(whoami)
    echo -e "User added to 'docker' group but the session must be reloaded to access the Docker daemon. Please log out, log back in, and rerun the script. Exiting..."
    exit 0
fi

# Check and enable all uarts with dtoverlay=uartx
for uart in 0 1 2 3; do
    if ! grep -q "dtoverlay=uart${uart}" /boot/firmware/config.txt; then
        echo "dtoverlay=uart${uart}" | sudo tee -a /boot/firmware/config.txt
    fi
done

# Install MediaMTX
if [ ! -d ~/mediamtx ]; then
    mkdir -p ~/mediamtx && cd ~/mediamtx
    wget https://github.com/bluenviron/mediamtx/releases/download/v1.7.0/mediamtx_v1.7.0_linux_arm64v8.tar.gz
    tar -xvzf mediamtx_v1.7.0_linux_arm64v8.tar.gz
    rm mediamtx_v1.7.0_linux_arm64v8.tar.gz

    # Configure MediaMTX
    if ! grep -q 'cam1:' ~/mediamtx/mediamtx.yml; then
        cat << EOF >> ~/mediamtx/mediamtx.yml
  cam1:
    runOnInit: bash -c 'libcamera-vid -t 0 --width 1280 --height 720 --inline --listen -o - | ffmpeg -fflags +genpts -i /dev/stdin -c:v libx264 -preset ultrafast -tune zerolatency -profile:v baseline -x264-params "nal-hrd=cbr:force-cfr=1" -b:v 2M -maxrate 2M -bufsize 4M -g 60 -keyint_min 60 -sc_threshold 0 -f rtsp -rtsp_transport tcp rtsp://localhost:8554/cam1'
    runOnInitRestart: yes
EOF
    fi
fi

# Create WebRTC service
sudo tee /etc/systemd/system/webrtc-streamer.service > /dev/null << EOF
[Unit]
Description=MediaMTX WebRTC Streaming Server
After=network.target

[Service]
WorkingDirectory=/home/$(whoami)
ExecStart=/home/$(whoami)/mediamtx/mediamtx /home/$(whoami)/mediamtx/mediamtx.yml
Restart=always
User=$(whoami)

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd to apply changes
sudo systemctl daemon-reload

# Enable and start MediaMTX service
sudo systemctl enable webrtc-streamer.service
sudo systemctl restart webrtc-streamer.service
sleep 5
sudo systemctl status webrtc-streamer.service --no-pager

echo "WebRTC service has been created."