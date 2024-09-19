#!/bin/bash

# Update system and install necessary packages
sudo apt-get update
sudo apt-get -y install docker.io nginx ufw

# Enable and start the firewall
echo "y" | sudo ufw enable
sudo ufw allow 22
sudo ufw allow 8090
sudo ufw allow 8556
sudo ufw allow 5173
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
    echo -e "User added to \docker\ group but the session must be reloaded to access the Docker daemon. Please log out, log back in, and rerun the script. Exiting..."
    exit 0
fi

# Define service files and commands
SERVICE_DIR="/etc/systemd/system"
WEBRTC_SERVICE="$SERVICE_DIR/webrtc-streamer.service"

# Create WebRTC streamer service
sudo tee $WEBRTC_SERVICE > /dev/null << EOF
[Unit]
Description=WebRTC Video Streamer
After=network.target

[Service]
WorkingDirectory=/home/$(whoami)
ExecStart=/usr/local/bin/webrtc-streamer -v /dev/video0 -C 720x480 -F 30 -P 8556
Restart=always
User=$(whoami)

[Install]
WantedBy=multi-user.target
EOF

# Check and enable all uarts with dtoverlay=uartx
for uart in 0 1 2 3; do
    if ! grep -q "dtoverlay=uart${uart}" /boot/firmware/config.txt; then
        echo "dtoverlay=uart${uart}" | sudo tee -a /boot/firmware/config.txt
    fi
done

# Install WebRTC streamer
wget https://github.com/mpromonet/webrtc-streamer/releases/download/v0.6.2/webrtc-streamer-v0.6.2-Linux-armv7l.tar.gz
tar -xzf webrtc-streamer-v0.6.2-Linux-armv7l.tar.gz
sudo mv webrtc-streamer /usr/local/bin/
rm webrtc-streamer-v0.6.2-Linux-armv7l.tar.gz

# Reload systemd to apply changes
sudo systemctl daemon-reload

# Enable and start services
sudo systemctl enable webrtc-streamer.service
sudo systemctl start webrtc-streamer.service

sudo systemctl status webrtc-streamer.service --no-pager

echo "WebRTC streamer service has been created and started."