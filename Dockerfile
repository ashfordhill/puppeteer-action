FROM node:20

RUN apt-get update && apt-get install -y \
    chromium \
    ffmpeg \
    fonts-dejavu-core \
    iproute2 \
    && rm -rf /var/lib/apt/lists/*

# Prevent Puppeteer from downloading its own Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
# Point Puppeteer at the system browser
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Create and set working directory for the action code
WORKDIR /action

# Install dependencies
COPY package*.json ./
RUN npm ci --legacy-peer-deps

RUN npx puppeteer browsers install chrome

# Add all action code
COPY . .

# Default command (explicit absolute path)
CMD ["node", "/action/index.js"]
