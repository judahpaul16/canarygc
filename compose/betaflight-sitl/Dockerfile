# Betaflight firmware compiled for the host CPU (SITL), so the Firmware tab can
# detect and talk to a Betaflight flight controller over MSP without hardware.
# UART1 carries MSP on TCP 5761, bound on all interfaces.
FROM debian:bookworm AS build
ARG BF_VERSION=2025.12.5
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch "${BF_VERSION}" \
        https://github.com/betaflight/betaflight.git /src
WORKDIR /src
# SITL compiles with the host gcc (SITL.mk clears ARM_SDK_PREFIX); the empty
# marker directory satisfies the Makefile's global ARM-toolchain gate so the
# unused 150 MB cross-toolchain never has to be downloaded. `make configs`
# hydrates the board-config submodule the build gate requires.
RUN mkdir -p tools/arm-gnu-toolchain-13.3.rel1-x86_64-arm-none-eabi \
    && make configs \
    && make TARGET=SITL

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libatomic1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /sitl
COPY --from=build /src/obj/main/betaflight_SITL.elf ./betaflight_SITL.elf
EXPOSE 5761
CMD ["./betaflight_SITL.elf"]
