#!/bin/bash
HOST_IP=$1
#socat UDP4-RECVFROM:5600,fork UDP4-SENDTO:${HOST_IP}:5600 &
python3 /usr/local/bin/mavproxy.py --daemon --master=udpin:127.0.0.1:14550 --out=tcpin:0.0.0.0:5760 2>&1 > /dev/null &
HEADLESS=1 make px4_sitl_default gazebo