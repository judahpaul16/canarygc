FROM ubuntu:22.04

ARG DEBIAN_FRONTEND=noninteractive
ARG COPTER_TAG=Copter-4.5.7

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates g++ python3 python3-dev python3-pip pkg-config procps \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch ${COPTER_TAG} --recurse-submodules --shallow-submodules \
    https://github.com/ArduPilot/ardupilot.git /ardupilot

WORKDIR /ardupilot

# empy stays below 4: the waf code generators use its pre-4 API.
RUN pip3 install --no-cache-dir empy==3.3.4 pexpect future pymavlink

RUN ./waf configure --board sitl && ./waf copter rover plane sub

# TCP 5760 is what the sim exposes by default
EXPOSE 5760/tcp

# Variables for simulator
ARG INSTANCE
ARG LAT
ARG LON
ARG ALT
ARG DIR
ARG MODEL
ARG SPEEDUP
ARG VEHICLE

ENV INSTANCE $INSTANCE
ENV LAT $LAT
ENV LON $LON
ENV ALT $ALT
ENV DIR $DIR
ENV MODEL $MODEL
ENV SPEEDUP $SPEEDUP
ENV VEHICLE $VEHICLE

# Finally the command
ENTRYPOINT /ardupilot/Tools/autotest/sim_vehicle.py --vehicle ${VEHICLE} -I${INSTANCE} --custom-location=${LAT},${LON},${ALT},${DIR} -w --frame ${MODEL} --no-rebuild --no-mavproxy --speedup ${SPEEDUP}
