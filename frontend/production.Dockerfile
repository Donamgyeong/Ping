FROM node:26-alpine AS builder

WORKDIR /app

COPY . .

RUN npm install -g yarn && yarn install --frozen-lockfile && yarn build

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["yarn", "start"]