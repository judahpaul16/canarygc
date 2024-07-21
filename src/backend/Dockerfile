FROM debian:latest

RUN apt-get update && apt-get install -y wget unzip

ENV POCKETBASE_VERSION=0.22.14

RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then \
        wget https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}/pocketbase_${POCKETBASE_VERSION}_linux_amd64.zip; \
    elif [ "$ARCH" = "arm64" ]; then \
        wget https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}/pocketbase_${POCKETBASE_VERSION}_linux_arm64.zip; \
    fi && \
    unzip pocketbase_${POCKETBASE_VERSION}_linux_*.zip -d /usr/local/bin/ && \
    rm pocketbase_${POCKETBASE_VERSION}_linux_*.zip

EXPOSE 8090

VOLUME /pb_data

CMD ["pocketbase", "serve", "--http=0.0.0.0:8090", "--dir", "/pb_data"]
