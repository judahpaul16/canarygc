#!/bin/bash
cd ~
sudo rm -rf mmgcs
git clone https://github.com/MAV-Manager/mmgcs_public.git mmgcs
cd mmgcs

if [ "$1" == "simulation" ]; then
    docker compose down && docker system prune -f && docker compose up -d
else
    docker compose -f docker-compose.prod.yml down
    docker system prune -f
    if libcamera-hello --list-cameras | grep -q "No cameras available!"; then
        echo "No cameras found."
        docker compose -f docker-compose.prod.yml up frontend backend -d
    else
        docker compose -f docker-compose.prod.yml up frontend backend webrtc -d
    fi
fi