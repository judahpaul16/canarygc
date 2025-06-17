#! /bin/bash

docker compose down
docker system prune -f
docker compose up
