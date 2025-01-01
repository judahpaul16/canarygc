@echo off
setlocal enabledelayedexpansion

:: Change to user's home directory
cd %USERPROFILE%

:: Remove mmgcs directory if it exists
if exist mmgcs (
    rmdir /s /q mmgcs
)

:: Clone the repository
git clone https://github.com/MAV-Manager/mmgcs_public.git mmgcs
cd mmgcs

docker compose down
docker system prune -af
docker compose up

endlocal