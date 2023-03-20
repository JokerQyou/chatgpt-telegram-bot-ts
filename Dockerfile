# Builder stage
FROM node:lts-alpine AS builder
WORKDIR /app

COPY . .
RUN yarn install && \
    yarn run build

# Runner stage
FROM node:lts-alpine
WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install
COPY --from=builder /app/dist ./dist

CMD yarn run start
