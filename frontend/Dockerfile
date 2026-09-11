FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build \
    && chown -R node:node /app/.next

USER node

EXPOSE 3000

CMD ["npm", "run", "start"]
