FROM node:20-slim

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg fonts-dejavu-core && rm -rf /var/lib/apt/lists/*

# Install any missing fonts if you use drawtext
RUN apt-get update && apt-get install -y fonts-dejavu-core && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package*.json ./
RUN npm ci

# Add action code
COPY . .

# Default command (GitHub passes inputs as env vars)
CMD ["node", "dist/index.js"]
