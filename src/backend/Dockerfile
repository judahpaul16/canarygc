FROM debian:latest

RUN apt-get update && apt-get install -y wget unzip

ENV POCKETBASE_VERSION=0.22.14

RUN wget https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}/pocketbase_${POCKETBASE_VERSION}_linux_amd64.zip && \
    unzip pocketbase_${POCKETBASE_VERSION}_linux_amd64.zip -d /usr/local/bin/ && \
    rm pocketbase_${POCKETBASE_VERSION}_linux_amd64.zip

EXPOSE 8090

VOLUME /pb_data

CMD ["pocketbase", "serve", "--http=0.0.0.0:8090", "--dir", "/pb_data"]