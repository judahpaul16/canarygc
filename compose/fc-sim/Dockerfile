# Flight-dynamics feeder for the MSP SITLs: one quad model with a
# RealFlight-protocol server for INAV and an FDM streamer for Betaflight.
# ADAPTER picks which one runs.
FROM node:24-slim
WORKDIR /sim
COPY physics.mjs inav-rf.mjs bf-fdm.mjs ./
ENV ADAPTER=inav-rf
CMD ["sh", "-c", "node ${ADAPTER}.mjs"]
