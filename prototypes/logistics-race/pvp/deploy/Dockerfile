FROM node:24-bookworm-slim
WORKDIR /app/prototypes/logistics-race/pvp
COPY prototypes/logistics-race/pvp/package.json prototypes/logistics-race/pvp/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node prototypes/logistics-race/pvp/server ./server
COPY --chown=node:node prototypes/logistics-race/pvp/public ./public
COPY --chown=node:node prototypes/logistics-race/dist/engine.js prototypes/logistics-race/dist/race-world.js ../dist/
COPY --chown=node:node contracts/near-pvp-escrow/artifacts/near_pvp_escrow.wasm /app/contracts/near-pvp-escrow/artifacts/near_pvp_escrow.wasm
RUN mkdir /data && chown node:node /data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4190 DATA_DIR=/data NEAR_NETWORK=testnet
EXPOSE 4190
CMD ["node", "server/main.mjs"]
