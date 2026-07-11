FROM python:3.12-slim

RUN pip install --no-cache-dir MAVProxy future

# Reads PX4 SITL's GCS MAVLink over UDP and serves it as the TCP endpoint the
# app connects to, matching the ArduPilot SITL's serial-over-TCP slot.
ENTRYPOINT ["mavproxy.py"]
