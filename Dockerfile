# Multi-stage build for CoEdit - Real-time Collaborative Editor

# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

# Copy package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy frontend source
COPY frontend/ ./

# Build the frontend
RUN npm run build

# Stage 2: Python backend with built frontend
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    nginx \
    supervisor \
    gettext-base \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create nginx templates directory
RUN mkdir -p /etc/nginx/templates

# Copy backend requirements and install
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend source
COPY backend/ ./backend/

# Copy built frontend from stage 1
COPY --from=frontend-build /app/frontend/build /app/frontend/build

# Create nginx configuration template (PORT will be substituted at runtime)
RUN echo 'server { \n\
    listen ${PORT}; \n\
    server_name localhost; \n\
    \n\
    # Serve React frontend \n\
    location / { \n\
        root /app/frontend/build; \n\
        index index.html; \n\
        try_files $uri $uri/ /index.html; \n\
    } \n\
    \n\
    # Proxy API requests to backend \n\
    location /api { \n\
        proxy_pass http://127.0.0.1:8001; \n\
        proxy_http_version 1.1; \n\
        proxy_set_header Upgrade $http_upgrade; \n\
        proxy_set_header Connection "upgrade"; \n\
        proxy_set_header Host $host; \n\
        proxy_set_header X-Real-IP $remote_addr; \n\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \n\
        proxy_read_timeout 86400; \n\
    } \n\
}' > /etc/nginx/templates/default.conf.template

# Create supervisor configuration
RUN echo '[supervisord] \n\
nodaemon=true \n\
user=root \n\
\n\
[program:nginx] \n\
command=/bin/bash -c "envsubst '"'"'$$PORT'"'"' < /etc/nginx/templates/default.conf.template > /etc/nginx/sites-available/default && /usr/sbin/nginx -g '"'"'daemon off;'"'"'" \n\
autostart=true \n\
autorestart=true \n\
stdout_logfile=/dev/stdout \n\
stdout_logfile_maxbytes=0 \n\
stderr_logfile=/dev/stderr \n\
stderr_logfile_maxbytes=0 \n\
\n\
[program:backend] \n\
command=python -m uvicorn server:app --host 0.0.0.0 --port 8001 \n\
directory=/app/backend \n\
autostart=true \n\
autorestart=true \n\
stdout_logfile=/dev/stdout \n\
stdout_logfile_maxbytes=0 \n\
stderr_logfile=/dev/stderr \n\
stderr_logfile_maxbytes=0 \n\
' > /etc/supervisor/conf.d/supervisord.conf

# Expose port (Railway will set PORT env var)
EXPOSE ${PORT:-80}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-80}/api/health || exit 1

# Start supervisor (manages nginx + backend)
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
