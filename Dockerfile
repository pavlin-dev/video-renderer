# Multi-stage build for smaller final image
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    chromium \
    ffmpeg \
    wget \
    dumb-init

# Tell Playwright to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Install Playwright browsers for production (without system deps, using Alpine packages)
RUN npx playwright install chromium

# Copy built application from builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Copy other necessary files
COPY next.config.js ./

# Create temp directory for videos and fix Playwright cache permissions
RUN mkdir -p temp && \
    mkdir -p /home/node/.cache && \
    cp -r /root/.cache/ms-playwright /home/node/.cache/ && \
    chown -R node:node temp /home/node/.cache

# Set environment variables
ENV BASE_URL=http://localhost:3000

# Switch to non-root user for security
USER node

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["npm", "start"]