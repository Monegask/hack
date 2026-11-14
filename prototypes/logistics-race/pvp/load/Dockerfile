FROM node:24-bookworm-slim
WORKDIR /bench
COPY prototypes/logistics-race/pvp/package*.json prototypes/logistics-race/pvp/
RUN cd prototypes/logistics-race/pvp && npm ci
COPY prototypes/logistics-race/dist prototypes/logistics-race/dist
COPY prototypes/logistics-race/pvp prototypes/logistics-race/pvp
ENTRYPOINT ["node", "prototypes/logistics-race/pvp/load/run.mjs"]
