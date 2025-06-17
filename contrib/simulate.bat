@echo off
setlocal enabledelayedexpansion

docker compose down
docker system prune -f
docker compose up

endlocal