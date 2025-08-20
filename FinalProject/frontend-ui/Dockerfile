# Frontend Dockerfile
# CLIKCA (Click + Assistant) - RAG 기반 업무 보조 AI 비서

# Dependencies stage - production dependencies only
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Build dependencies stage - all dependencies for build
FROM node:20-alpine AS build-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Build stage
FROM build-deps AS build
WORKDIR /app
COPY . .
# Ensure all dependencies are available for build
RUN npm run build

# Development stage
FROM node:20-alpine AS development
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Development command with hot reload
ENV NODE_ENV=development
ENV VITE_DEV_SERVER_HOST=0.0.0.0
ENV VITE_DEV_SERVER_PORT=3000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]

# Production stage with Nginx
FROM nginx:alpine AS production
WORKDIR /usr/share/nginx/html

# Copy built files
COPY --from=build /app/dist ./

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Use existing nginx user (nginx:alpine already has nginx user)
# No need to create new user, just set proper permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d

# Switch to non-root user
USER nginx

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

# Runtime stage (default)
FROM production AS runtime
