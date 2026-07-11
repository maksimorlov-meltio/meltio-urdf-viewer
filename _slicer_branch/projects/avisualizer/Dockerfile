# Visualizer service (Meltio Orbit / avisualizer) — FastAPI + Three.js viewer.
#
# Python is pinned to 3.11 because open3d (used server-side for voxel
# aggregation) has no wheels for 3.13/3.14. Editable install keeps the
# package's data roots (assets/, database/) resolvable under /app at runtime;
# both are also overridable via MELTIO_ORBIT_ASSETS_ROOT / _DATABASE_ROOT.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Native libraries that open3d loads at import/runtime (headless use).
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libgomp1 libx11-6 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

# Promote the bundled seed dataset to the runtime database dir (DATABASE_ROOT),
# so small-torture-test is the built-in default. Explicit copy (no .dockerignore
# negation) keeps this identical across local and CI BuildKit.
RUN mkdir -p /app/database && cp -a /app/seed_data/. /app/database/ && rm -rf /app/seed_data

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip && pip install -e .[pointcloud]

EXPOSE 8080

CMD ["uvicorn", "avisualizer.web.app:create_app", "--factory", \
     "--host", "0.0.0.0", "--port", "8080"]
