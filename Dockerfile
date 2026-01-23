FROM node:18-alpine

WORKDIR /usr/src/app

# Install dependencies first for better caching
COPY package*.json ./
RUN npm install --production

# Copy source
COPY . .

EXPOSE 5002

ENV NODE_ENV=production

CMD ["node", "server.js"]
