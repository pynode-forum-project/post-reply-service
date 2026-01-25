FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY src/ ./src/

RUN mkdir -p logs

EXPOSE 5002

CMD ["npm", "start"]
