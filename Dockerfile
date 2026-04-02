FROM node:20-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
  build-essential \
  ca-certificates \
  curl \
  python3 \
  && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash appuser

USER appuser
WORKDIR /app

RUN curl https://install.meteor.com/?release=3.4 | sh

ENV PATH="/home/appuser/.meteor:${PATH}"
ENV NODE_ENV=development
ENV PORT=3000
ENV ROOT_URL=http://localhost:3000

COPY --chown=appuser:appuser package.json package-lock.json ./
COPY --chown=appuser:appuser scripts ./scripts
RUN npm ci

COPY --chown=appuser:appuser . .

EXPOSE 3000

CMD ["meteor", "run", "--port", "3000"]
