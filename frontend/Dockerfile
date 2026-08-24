FROM node:26-alpine

WORKDIR /app

COPY yarn.lock package.json ./

RUN npm install -g yarn && yarn install --frozen-lockfile

EXPOSE 3000