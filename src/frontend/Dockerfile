FROM node:21-alpine AS build

LABEL org.opencontainers.image.source https://github.com/MAV-Manager/mmgcs_public

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

FROM node:21-alpine

WORKDIR /app

COPY --from=build /app/build ./build
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules

EXPOSE 3000

CMD ["node", "build"]