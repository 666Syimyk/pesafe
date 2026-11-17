FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
COPY package.json server.js index.html style.css app.js core.js storage.js sensors.js recorder.js runtime-config.js sw.js manifest.webmanifest ./
COPY icons ./icons
COPY retention.js recordings.js privacy.js sounds.js ./
COPY calls.js ./
COPY countdown-audio.js ./
RUN mkdir -p /app/.data && chown -R node:node /app
USER node
EXPOSE 8080
VOLUME ["/app/.data"]
CMD ["node", "server.js"]
