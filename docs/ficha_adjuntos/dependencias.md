# Manifiesto de dependencias (resumen consolidado)

Documento de apoyo a la [ficha de proyecto](../ficha_proyecto.md). Extracto de los
manifiestos reales del repositorio.

## Visor — `avisualizer` (el producto)

**Runtime:** Python ≥ 3.10 (en la práctica **3.11**, por las wheels nativas).
Fuente: `urdf_viewer/projects/avisualizer/pyproject.toml`, `urdf_viewer/requirements.txt`.

| Paquete | Versión | Rol |
|---------|---------|-----|
| `fastapi` | `>=0.115,<1.0` | Backend HTTP/API |
| `uvicorn` | `>=0.30,<1.0` | Servidor ASGI |
| `numpy` | `>=1.26,<3.0` | Cálculo/geometría |
| `open3d` | `>=0.19,<1.0` | *(extra `pointcloud`)* nube de puntos de sensores |
| `pytest`, `httpx` | 8.4.0 / 0.27.2 | Tests de API |

**Front-end:** sin dependencias npm de runtime — **Three.js 0.173 vendorizado**
en `web/static/vendor/`, sin bundler ni paso de build. `package.json` del
proyecto es mínimo (`{"private": true, "type": "module"}`). Tests JS con el
runner nativo de Node (`tests/js/*.mjs`).

## Slicer embebido — `meltio-platform` (solo el motor de slicing)

**Runtime:** Python **3.11**. Fuente: `_slicer_branch/projects/platform/pyproject.toml`.

| Paquete | Versión | Rol |
|---------|---------|-----|
| `fastapi` / `uvicorn` | `>=0.115` / `>=0.30` | Servicio del slicer (puerto 8765) |
| `python-multipart` | `>=0.0.13` | Subida de STL |
| `numpy` | `>=1.26,<3.0` | Base numérica |
| `trimesh` | `>=4.4,<5.0` | Carga/booleanas de malla |
| `shapely` | `>=2.0,<3.0` | Geometría 2D de capas |
| `networkx` | `>=3.0,<4.0` | Grafos de toolpath |
| `scipy` | `>=1.11,<2.0` | Numérico avanzado |
| `rtree` | `>=1.1,<2.0` | Índices espaciales |

> Dependencias **solo de la plataforma cloud** (NO usadas por el HMI local):
> `sqlalchemy`, `alembic`, `psycopg[binary]` (PostgreSQL), `boto3` (S3),
> `pydantic-settings`. Front de plataforma: React 18 + Vite 5 + TypeScript 5
> (`_slicer_branch/projects/platform/frontend/package.json`). Render-service:
> `playwright==1.48.0`.

## Entornos y variables

- **Dos venvs** (nombres exactos exigidos por el launcher): `.venv` (visor) y
  `venv311` (slicer).
- Variables: `AVIS_SLICER_URL` (por defecto `http://127.0.0.1:8765`),
  `AVIS_SLICER_UI_URL`, `PYTHONPATH` a cada `src/`, y `AVIS_MACHINE` / `?machine=1`
  para habilitar el enlace de máquina.

## Observaciones

- La instalación inicial descarga wheels nativas grandes (`open3d`, `trimesh`,
  `scipy`, `shapely`, `rtree`) → varios minutos y ~1 GB de disco entre los dos venvs.
- Sensible a la versión de Python: **usar 3.11** para tener wheels prebuiltas.
