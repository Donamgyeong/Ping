FROM node:26-alpine

WORKDIR /app

COPY ./ ./

RUN npm install -g yarn
RUN yarn install --frozen-lockfile
RUN yarn build

EXPOSE 3000