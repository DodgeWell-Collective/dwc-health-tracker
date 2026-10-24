# Node server with a SQLite file. Data lives in /app/data; mount it so it survives updates.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:node && npm prune --omit=dev

FROM node:24-slim
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/app/data/health.sqlite
EXPOSE 3000
VOLUME /app/data
CMD ["npm", "start"]
