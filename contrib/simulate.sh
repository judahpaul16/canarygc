#! /bin/bash

docker compose down
docker system prune -af
docker compose up
