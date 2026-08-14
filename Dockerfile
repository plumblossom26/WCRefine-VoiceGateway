FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 8787
CMD ["node", "src/server.mjs"]

