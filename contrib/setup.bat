@echo off
setlocal enabledelayedexpansion

:: Change to user's home directory
cd %USERPROFILE%

:: Remove canarygc directory if it exists
if exist canarygc (
    rmdir /s /q canarygc
)

:: Clone the repository
git clone https://github.com/judahpaul16/canarygc.git
cd canarygc

docker compose down
docker system prune -af
docker compose up

endlocal