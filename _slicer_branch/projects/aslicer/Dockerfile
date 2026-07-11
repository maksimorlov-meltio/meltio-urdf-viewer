# Slicer service (aslicer) — FastAPI backend + Three.js viewer.
#
# Python is pinned to 3.11 to match the rest of the stack. The package is
# installed in editable mode so its relative data folders (stl/, assets/,
# profiles/) resolve under /app at runtime — a regular install would move the
# package into site-packages and break those paths.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Copy the whole project (src + stl/assets/profiles). .dockerignore trims junk.
COPY . .

# A pip cache mount keeps downloaded wheels across rebuilds so day-to-day
# builds are fast even when the source layer changes.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip && pip install -e .

EXPOSE 8765

# Bind to 0.0.0.0 so the container is reachable; app is an ASGI factory.
CMD ["uvicorn", "aslicer.web.app:create_app", "--factory", \
     "--host", "0.0.0.0", "--port", "8765"]
