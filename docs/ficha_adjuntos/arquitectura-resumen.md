# Resumen de arquitectura — Meltio URDF Viewer

Documento de apoyo a la [ficha de proyecto](../ficha_proyecto.md). Describe la topología
real que se ejecuta al arrancar el HMI y los contratos de comunicación.

## Topología: dos servicios locales

El HMI son **dos servicios Python que se lanzan juntos** en `127.0.0.1` y un
front-end de navegador que habla con ambos por HTTP.

```
                          navegador Chromium (HMI kiosko 1080×1920)
                          front-end vanilla-JS + Three.js (sin build)
                                     │  HTTP /api/*, assets estáticos
                                     ▼
   ┌──────────────────────────────────────────┐        proxy /slice, /slicer
   │  VISOR  (avisualizer)                      │  ───────────────────────────┐
   │  urdf_viewer/projects/avisualizer          │                             │
   │  FastAPI + Uvicorn · puerto 8090           │                             ▼
   │  · auth (PBKDF2) + permissions.json        │        ┌───────────────────────────────┐
   │  · error-codes, STL, sensores              │        │  SLICER  (meltio_platform.slicer)│
   │  · URDF + mallas M600-PRO                   │        │  _slicer_branch/projects/platform │
   │  · simulación de impresión en escena       │        │  FastAPI + Uvicorn · puerto 8765 │
   └──────────────────────────────────────────┘        │  trimesh/shapely/scipy/networkx   │
                     │  (opcional, ?machine=1)          └───────────────────────────────┘
                     ▼
   ┌──────────────────────────────────────────┐
   │  MÁQUINA real M600-PRO  (POR IMPLEMENTAR)  │
   │  contrato HTTP: /health, /telemetry,       │
   │  /api/machine/<comando>                    │
   └──────────────────────────────────────────┘
```

- **Enlace visor→slicer:** por la variable `AVIS_SLICER_URL` (por defecto
  `http://127.0.0.1:8765`). El visor **proxya** el slicing y sirve la UI del slicer
  embebida y a pantalla completa compartiendo paleta.
- **Enlace visor→máquina:** **opcional y desactivado por defecto**. Se activa con
  `?machine=1` o inyectando `window.AVIS_MACHINE = { enabled: true }`. Mientras no
  haya conexión real, la **simulación local** manda y todo comando se rechaza con
  degradación elegante.

## Front-end (navegador)

SPA **vanilla-JS + Three.js 0.173** servida como estática desde
`urdf_viewer/.../web/static/`, **sin paso de build**. Three.js va vendorizado en
`web/static/vendor/`. Estructura por dominios (tras el refactor `arq2`):

- `core/viewerScene.js` — escena, cámaras, iluminación IBL, presets de movimiento.
- `sim/` — `machineLink.js` (transporte máquina), `printSimulation.js`,
  `simState.js`, `slicerClient.js`, `toolpathModel.js`/`toolpathTubes.js`,
  `prePrintCheck.js`.
- `notifications/` — centro de notificaciones e historial sobre el catálogo de
  errores; `calendar/`; `cloud/` (biblioteca STL); `controllers/` (viewCube,
  feederPreview, annotations); `permissions.js` (gating **solo de UI**).

## Backend del visor — rutas FastAPI

(De `urdf_viewer/projects/avisualizer/src/avisualizer/web/app.py`.)

| Método | Ruta | Propósito |
|--------|------|-----------|
| GET | `/`, `/urdf` | Shell HTML del HMI |
| GET/PUT | `/api/permissions/config` | Lee/actualiza matriz de roles (PUT endurecido: tope de tamaño, esquema, anti-lockout) |
| POST | `/api/auth/login` | Valida `{username,password}` contra store PBKDF2 |
| GET | `/api/error-codes` | Catálogo de códigos de error/notificaciones |
| GET | `/api/slicer/status`, `/api/slicer/profiles` | Estado y perfiles del slicer embebido |
| GET | `/slicer` | UI del slicer embebida/proxy |
| POST | `/api/slice/proxy` | Proxy del slicing hacia el servicio 8765 |
| GET | `/api/urdf/models` | Modelos URDF/mallas disponibles |
| GET | `/api/stl/files`, `/api/stl/file`, `/api/datasets/stl` | Explorar/servir STLs |
| GET | `/api/sensors`, `/api/sensors/binary`, `/api/attribute-series` | Nube de puntos/series (herencia del visor de sensores) |
| GET | `/health` | Liveness |

## Autenticación y permisos

- **Login:** `/api/auth/login` verifica contra credenciales **PBKDF2-HMAC-SHA256**
  guardadas en `database/permissions.json` (el material de contraseña va separado
  de la matriz de roles/usuarios; se gestiona con `tools/set_password.py`).
- **Niveles:** Operator, Operator+, Support, God. Los controles con movimiento
  (panel Move, comandos de máquina) se **restringen por nivel** y la sesión se
  cierra sola por inactividad.
- ⚠️ **`permissions.js` NO es una frontera de seguridad**: solo deshabilita
  botones en el cliente. La autorización real de comandos con movimiento debe
  imponerla el **controlador/firmware en servidor** (ver aviso en `machineLink.js`).

## Arranque

`Start-Viewer.bat` → `launch-viewer.ps1`: levanta ambos servicios si no están
arriba, espera a que respondan y abre el visor maximizado con cache-bust.
Arranque manual documentado en el [README raíz](../../README.md). Para kiosko real:
navegador en `--kiosk` / F11.

## Nota sobre `_slicer_branch`

`_slicer_branch` es un **monorepo de plataforma más amplio** ("meltio-platform")
con su propio front React/Vite, PostgreSQL (SQLAlchemy + Alembic), S3 (boto3),
Docker/compose (prod/beta/gpu), render-service con Playwright y pixel-streaming.
**De todo eso, el HMI solo usa el motor de slicing** (`meltio_platform.slicer`)
corriendo localmente en el puerto 8765. El resto del monorepo no participa en la
ejecución del visor local.
