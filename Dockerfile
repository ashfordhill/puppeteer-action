FROM node:20-slim

# Install ffmpeg and DejaVu fonts (for drawtext)
RUN apt-get update \
    && apt-get install -y ffmpeg fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Create and set working directory for the action code
WORKDIR /action

# Install dependencies
COPY package*.json ./
RUN npm ci

# Add all action code
COPY . .

# Default command (explicit absolute path)
CMD ["node", "/action/index.js"]