# Build from the repo root: docker build -f api/Dockerfile .  (needs devui/ next to api/)
FROM node:24-bookworm-slim
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY api/ ./
COPY devui/ /app/devui/
COPY app/ /app/app/
COPY contracts/ /app/contracts/
# development keeps the /dev UI (the Android app loads it); secrets come from the env file
ENV NODE_ENV=development PORT=3000
EXPOSE 3000
CMD ["npx", "tsx", "src/server.ts"]
