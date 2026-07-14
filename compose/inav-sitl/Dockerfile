# INAV firmware compiled for the host CPU (SITL), so the Firmware tab can detect
# and talk to an INAV flight controller over MSP without hardware. UART2 carries
# MSP on TCP 5761, bound on all interfaces. Trixie provides the GCC 13+ the INAV
# build wants.
FROM debian:trixie AS build
ARG INAV_VERSION=9.1.0
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential cmake ruby git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch "${INAV_VERSION}" \
        https://github.com/iNavFlight/inav.git /src
WORKDIR /src/build_SITL
RUN cmake -DSITL=ON .. \
    && make -j"$(nproc)" \
    && cp "$(find . -type f -name 'inav_*_SITL' | head -1)" /inav_SITL

FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends libatomic1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /sitl
COPY --from=build /inav_SITL ./inav_SITL
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh
EXPOSE 5761
ENTRYPOINT ["./entrypoint.sh"]
CMD []
