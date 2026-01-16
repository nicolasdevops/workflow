FROM node:18-bookworm

# Create node user
RUN groupadd -g 1000 node && useradd -u 1000 -g node -m node || true

USER root

# Install system dependencies for N8N, Playwright and PostgreSQL
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    postgresql-client \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libwayland-client0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install N8N globally
RUN npm install -g n8n

# Switch to node user
USER node

# Create N8N directory
RUN mkdir -p /home/node/.n8n

# Install Playwright and Firefox browser
RUN npx playwright install firefox --with-deps

ENV N8N_BASIC_AUTH_ACTIVE=true
ENV N8N_BASIC_AUTH_USER=admin
ENV N8N_HOST=0.0.0.0
ENV N8N_PORT=5678
ENV N8N_PROTOCOL=https
ENV EXECUTIONS_PROCESS=main
ENV N8N_PUSH_BACKEND=websocket
ENV PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache/ms-playwright

WORKDIR /home/node

EXPOSE 5678

CMD ["n8n", "start"]
