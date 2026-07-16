FROM node:26-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

CMD ["npm", "run", "dev"]

EXPOSE 3000