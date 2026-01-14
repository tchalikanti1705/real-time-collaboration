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

# Copy backend requirements and install
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend source
COPY backend/ ./backend/

# Copy built frontend from stage 1
COPY --from=frontend-build /app/frontend/build /app/frontend/build

# Expose port (Railway sets PORT env var, default to 8001)
ENV PORT=8001
EXPOSE ${PORT}

# Start the FastAPI server (serves both API and static frontend)
CMD python -m uvicorn backend.server:app --host 0.0.0.0 --port ${PORT}
