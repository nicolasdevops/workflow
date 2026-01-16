FROM node:18-bookworm

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

# Install N8N and Playwright globally as root
RUN npm install -g n8n playwright

# Install Playwright browsers (as root so it can install dependencies)
RUN npx playwright install --with-deps firefox

# Create N8N directory with proper permissions
RUN mkdir -p /home/node/.n8n && \
    chown -R node:node /home/node/.n8n && \
    mkdir -p /home/node/.cache/ms-playwright && \
    chown -R node:node /home/node/.cache

# Switch to node user for runtime
USER node

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
