#!/bin/bash

# Update and install dependencies
apt-get update
apt-get -y install git cmake libjpeg8-dev
apt-get -y install gcc g++
apt-get -y install pkg-config
apt-get -y install libraspberrypi0 libraspberrypi-dev libraspberrypi-doc libraspberrypi-bin

# Enable the camera if not enabled
if ! vcgencmd get_camera | grep -q 'supported=1 detected=1'; then
    echo "Enabling the camera..."
    sudo raspi-config nonint do_camera 0
    echo "Camera enabled. Please reboot for the changes to take effect."
    exit 1
fi

# Clone and build mjpg-streamer
git clone https://github.com/jacksonliam/mjpg-streamer.git
cd mjpg-streamer/mjpg-streamer-experimental
make
make install
echo "export LD_LIBRARY_PATH='/mjpg-streamer/mjpg-streamer-experimental'" >> ~/.bashrc
source ~/.bashrc

# Set up simple stream website
mkdir -p /var/www
cp ./www/stream_simple.html /var/www/index.html

# Run the streamer on port 8080
mjpg_streamer -o "output_http.so -w /var/www -p 8080" -i "input_raspicam.so"
