# Meltio platform service — FastAPI backend + built React/Vite SPA. The slicing
# engine is vendored into the package (meltio_platform.slicer), so the image is
# self-contained and builds from the projects/platform context.

# --- Stage 1: build the frontend ---
FROM node:22-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- Stage 2: the app ---
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PLATFORM_WEB_DIR=/app/web-dist \
    PLATFORM_PROFILES_DIR=/app/profiles

# Deployment version shown in the account menu (set by CI to the channel + short
# commit SHA). Empty by default so the backend falls back to the package version.
ARG PLATFORM_VERSION=
ENV PLATFORM_VERSION=${PLATFORM_VERSION}

WORKDIR /app

# Copy the project (src incl. vendored slicer, migrations, entrypoint).
COPY . .
COPY --from=frontend /frontend/dist /app/web-dist

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip && pip install -e .

RUN chmod +x entrypoint.sh

EXPOSE 8090

# Apply DB migrations, then launch the ASGI app (bound to 0.0.0.0).
CMD ["./entrypoint.sh"]
