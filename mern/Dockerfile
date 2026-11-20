# Build context is the REPO ROOT: the API spawns `python -m promo_finder run`, so the
# image needs the Python pipeline as well as the MERN app.
#   docker build -f mern/Dockerfile -t promo-finder-mern .

FROM node:20-bookworm-slim AS client
WORKDIR /app/mern/client
COPY mern/client/package*.json ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY mern/client ./
RUN npm run build

FROM node:20-bookworm-slim
# ca-certificates is NOT part of the slim image, and without it Python cannot verify any HTTPS
# endpoint: every model call fails with CERTIFICATE_VERIFY_FAILED (seen in production).
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 ca-certificates \
 && update-ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# the pipeline (stdlib only) and the original demo show — never the confidential pack
COPY promo_finder ./promo_finder
COPY examples ./examples
# the audit scripts that /api/selftest runs (code only, no data)
COPY tools ./tools
COPY mern/server ./mern/server
COPY --from=client /app/mern/client/dist ./mern/client/dist

RUN cd mern/server && (npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund)
RUN mkdir -p /app/outputs

# No PORT here: hosts inject their own (Render, Spaces); env.js defaults to 4000 for docker run.
ENV HOST=0.0.0.0 \
    NODE_ENV=production \
    PYTHON_BIN=python3 \
    PROMO_SHOW_ROOTS=examples \
    PROMO_OUTPUTS=outputs

WORKDIR /app/mern/server
EXPOSE 4000
CMD ["node", "src/index.js"]
