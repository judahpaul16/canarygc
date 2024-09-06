#!/bin/bash

# Update system and install necessary packages
sudo apt-get update
sudo apt-get -y install docker.io python3

DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
mkdir -p $DOCKER_CONFIG/cli-plugins
curl -SL https://github.com/docker/compose/releases/download/v2.3.3/docker-compose-linux-aarch64 -o $DOCKER_CONFIG/cli-plugins/docker-compose
chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose

# May need to logout and login to apply docker group changes
if ! docker ps >/dev/null 2>&1; then
    echo "Docker installed. Adding $(whoami) to the 'docker' group..."
    sudo usermod -aG docker $(whoami)
    echo -e "${RED}User added to \`docker\` group but the session must be reloaded to access the Docker daemon. Please log out, log back in, and rerun the script. Exiting...${NC}"
    exit 0
fi

# Define service files and commands
SERVICE_DIR="/etc/systemd/system"
LIBCAMERA_SERVICE="$SERVICE_DIR/libcamera-vid.service"
FFMPEG_SERVICE="$SERVICE_DIR/ffmpeg.service"
HTTP_SERVER_SERVICE="$SERVICE_DIR/http-server.service"

# Create a directory for the CORS HTTP server script
SCRIPT_DIR="/home/$(whoami)/scripts"
mkdir -p $SCRIPT_DIR

# Create the CORS HTTP server script
cat << 'EOF' > $SCRIPT_DIR/cors_http_server.py
from http.server import SimpleHTTPRequestHandler, HTTPServer

class CORSHTTPRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

def run(server_class=HTTPServer, handler_class=CORSHTTPRequestHandler, port=8554):
    server_address = ('', port)
    httpd = server_class(server_address, handler_class)
    print(f'Starting httpd on port {port}...')
    httpd.serve_forever()

if __name__ == "__main__":
    run()
EOF

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
Description=Python HTTP Server with CORS
After=network.target

[Service]
WorkingDirectory=$SCRIPT_DIR
ExecStart=/usr/bin/python3 cors_http_server.py
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
