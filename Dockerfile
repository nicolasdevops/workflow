FROM node:20-bookworm

# Install dependencies for Playwright and system tools
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    && npx playwright install-deps firefox \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci

# Install Playwright browsers (Firefox only as per config)
RUN npx playwright install firefox

# Copy application source
COPY . .

# Exjwose the port (Railway will inject PORT env var, defaulting to 3000 if not set)
# We document 8080, but the app listens on process.env.PORT
EXPOSE 8080

# Start the application
CMD ["node", "server.js"]
