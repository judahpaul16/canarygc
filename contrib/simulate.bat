@echo off
setlocal enabledelayedexpansion

docker compose down
docker system prune -af
docker compose up

endlocal