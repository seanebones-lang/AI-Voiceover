FROM node:20-alpine AS runner
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production --ignore-scripts
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]