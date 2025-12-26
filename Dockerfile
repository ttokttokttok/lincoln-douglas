# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/
COPY shared/package*.json ./shared/

# Install all dependencies (including devDependencies for build)
RUN npm install

# Copy source code
COPY . .

# Build shared first, then client and server
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy root package.json for workspace structure
COPY package*.json ./
COPY server/package*.json ./server/
COPY shared/package*.json ./shared/

# Copy built files
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/client/dist ./client/dist

# Install production dependencies with workspaces
RUN npm install --omit=dev

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Start server
CMD ["node", "server/dist/index.js"]
