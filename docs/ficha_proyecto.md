# Ficha de proyecto — Radiografía del estado actual

> Rellena una copia de esta ficha por cada proyecto. Los campos que no sepas, déjalos en blanco o marca "?" — también es información útil.
>
> **Proyecto documentado:** Meltio URDF Viewer (`meltio-webui`). Ficha rellenada el 2026-07-27.

---

## 1. Identificación
- **Nombre del proyecto:** Meltio URDF Viewer *(repo/carpeta: `meltio-webui`; paquete de la app: `avisualizer`; fork interno partiendo del trabajo de Maksim Orlov).*
- **Propósito en una frase:** *(¿qué problema resuelve / para qué existe?)* HMI de operador **web** para la impresora metálica **Meltio M600-PRO**: renderiza la máquina en vivo (URDF + mallas) en 3D, la controla desde una interfaz táctil, embebe un **slicer** y reproduce el corte como **simulación de impresión en escena** sobre el movimiento real del gantry — todo en el navegador.
- **Tipo:** *(API / web / app móvil / batch-proceso / librería / servicio interno / otro)* Aplicación **web local** (dos servicios Python que se lanzan juntos) servida a un navegador Chromium; pensada como panel HMI en modo kiosko. Front-end SPA en **vanilla-JS + Three.js sin paso de build**.
- **Estado:** *(producción / legacy / en desarrollo / en pausa / a extinguir)* **En desarrollo temprano** *(repo iniciado 2026-07-11; refactor de arquitectura en curso en la rama `viewer/arq2-refactor` — extracción del "god-file" del front en módulos ES).* No es aún un producto desplegado.
- **Criticidad para el negocio:** *(alta / media / baja)* **Media** hoy *(prototipo/PoC del futuro HMI de la máquina; el enlace con la máquina real está desactivado por defecto). Alta si sustituye al software de control en el panel de la máquina.*

## 2. Tecnología
- **Lenguaje(s) principal(es):** **Python** (backends FastAPI de visor y slicer) y **JavaScript** (front-end del visor: vanilla-JS + Three.js). En el submódulo `_slicer_branch` hay además **TypeScript/React** (front de la plataforma) y núcleo de slicing en Python.
- **Framework(s):** **FastAPI + Uvicorn** (ambos backends); **Three.js 0.173** (render 3D, vendorizado, sin bundler); front-end sin framework ni build step. El slicer usa **trimesh / shapely / scipy / networkx / rtree / numpy** para geometría. Visor opcional de nube de puntos con **Open3D**.
- **Versiones relevantes:** *(runtime, framework — indica si están desactualizadas)* **Python 3.11** requerido (visor pide ≥3.10; slicer pide ≥3.11 y wheels nativas solo garantizadas en 3.11). FastAPI `>=0.115`, Uvicorn `>=0.30`. **Windows 10/11**. Requiere navegador Chromium (Edge/Chrome). No hay dependencias desactualizadas notables (repo reciente).
- **Base de datos / almacenamiento:** El **visor** es de estado ligero y **basado en ficheros**: credenciales/roles en `permissions.json` (hashes **PBKDF2-HMAC-SHA256**, gestionados con `tools/set_password.py`), catálogo de errores en `database/error_codes.json`, datasets/STLs locales en `projects/avisualizer/database/` (no versionado). El **slicer embebido** corre en memoria/ficheros. *(La plataforma completa en `_slicer_branch` sí define **PostgreSQL** vía SQLAlchemy/Alembic y **S3** vía boto3, pero eso NO es lo que consume el visor.)*
- **Dónde se despliega:** *(cloud, on-premise, servidor concreto, contenedores…)* **Local / on-premise** en el PC del operador. Se arranca con `Start-Viewer.bat` → `launch-viewer.ps1`, que levanta los dos servicios en `127.0.0.1` (visor `:8090`, slicer `:8765`) y abre `http://127.0.0.1:8090/urdf` en el navegador maximizado/kiosko. Sin contenedores para el visor. *(El monorepo `_slicer_branch` sí trae Dockerfiles y `docker-compose` prod/beta/gpu para desplegar la plataforma en cloud, no usados por el visor local.)*

## 3. Integraciones (lo más importante para el estudio)
- **De quién recibe datos / a quién llama:**
  - **Visor → Slicer:** el visor embebe y proxya el slicer local (variable `AVIS_SLICER_URL`, por defecto `http://127.0.0.1:8765`) para el flujo Files → *slice* → *Start print*.
  - **Visor → Máquina (opcional):** transporte de máquina en vivo **OFF por defecto**; se activa con `?machine=1`. Contrato HTTP esperado del controlador (aún **por implementar** en el backend de la máquina): `GET {base}/health`, `GET {base}/telemetry`, `POST {base}/api/machine/<comando>` (arm, start-print, stop, pause, resume, emergency-stop). Sin conexión real, la **simulación local** es la autoridad.
- **Cómo se comunica:** *(REST, GraphQL, cola de mensajes, BD compartida, ficheros, SFTP…)* **HTTP/REST** en `localhost` entre navegador ↔ visor ↔ slicer (endpoints `/api/*`: auth, permissions, error-codes, slicer status/profiles, slice proxy, STL, sensores). El front carga assets estáticos cache-busted (`?v=`). Ficheros **STL** de entrada y toolpath del slicer como salida.
- **Quién depende de este proyecto:** *(qué otros sistemas se romperían si este cae)* Ninguno en producción todavía (PoC). En el objetivo final, sería el HMI del operador de la M600-PRO: su caída dejaría al operador sin la interfaz unificada de control/visualización.
- **¿Comparte base de datos con otro proyecto?:** *(sí/no — con cuál)* **No.** El visor usa ficheros locales propios. La BD PostgreSQL/S3 vive solo en el monorepo `_slicer_branch` (plataforma cloud) y no está conectada al visor.

## 4. Personas y mantenimiento
- **Responsable / equipo:** Equipo de Software de Meltio. *(Autores git: Ricardo Chacón Chacón — mayoría de commits recientes — sobre base inicial de Maksim Orlov.)*
- **¿Se mantiene activamente?:** *(sí / mínimo / abandonado)* **Sí**, muy activo *(refactor de arquitectura `viewer/arq2-refactor` en curso; último commit 2026-07-27).*
- **Documentación disponible:** *(README, wiki, diagramas, ninguna)* **Amplia y reciente.** `README.md` raíz (autoritativo: describe la interfaz de operador, setup y arranque) + `docs/` (esta ficha, `ui-overview.svg`, `screenshot-viewer.png`). Cada submódulo trae sus docs: `urdf_viewer/docs/` (`ARCHITECTURE.md`, `PRINT_SIM.md`, `PROTOCOL.md`, preferencias del visor) y `_slicer_branch/docs/` (arquitectura de plataforma, modelos de máquina, protocolo, pixel-streaming, librería de perfiles). ⚠️ Algunos docs de `urdf_viewer/docs/` describen aún la identidad **antigua** de "visor de sensores/point-cloud" (ver §5); el README raíz manda.

## 5. Solapamientos y dudas *(opcional pero muy útil)*
- **¿Sospechas que duplica funcionalidad de otro proyecto?:** *(¿de cuál?)* **Sí, hay solapamiento notable.** El repo contiene **dos árboles `avisualizer`** casi paralelos: el activo (`urdf_viewer/projects/avisualizer`, el HMI URDF) y el del monorepo (`_slicer_branch/projects/avisualizer`, aún con identidad de visor de sensores/point-cloud). Además el **slicer** existe por partida doble en `_slicer_branch`: como proyecto standalone `projects/aslicer` **y** vendorizado dentro de `projects/platform` (`meltio_platform.slicer`) — este último es el que embebe el visor. La identidad del paquete (`pyproject`, docs) todavía reza "sensor point-cloud visualizer / Process Intelligence Team", herencia del proyecto del que se hizo fork.
- **¿Es candidato a fusionarse o a desaparecer?:** El árbol `_slicer_branch/projects/avisualizer` (visor de sensores heredado) es candidato a **retirarse o fusionarse** con el visor URDF. Conviene consolidar la identidad de paquete y decidir si `aslicer` standalone se mantiene o se abandona en favor del slicer vendorizado en `platform`.
- **Principales dolores actuales:** *(deuda técnica, cuellos de botella, riesgos)*
  - **Seguridad:** `permissions.js` solo **deshabilita botones en el cliente**, NO es frontera de seguridad; el enlace de máquina advierte explícitamente de no apuntar a un transporte que mueva la máquina real hasta que **el firmware/controlador imponga autorización por rol en servidor** para comandos con movimiento.
  - **Front-end god-file:** refactor en curso para trocear el JS monolítico del visor en módulos ES; riesgo de crashes de carga (refs huérfanas, TDZ) documentado en la memoria del proyecto.
  - **Entornos duplicados y pesados:** dos venvs (`.venv`, `venv311`) con wheels nativas grandes (`open3d`, `trimesh`, `scipy`, `shapely`, `rtree`); instalación lenta y sensible a la versión exacta de Python (3.11).
  - **Sin build/tests de front automatizados robustos:** el front no tiene bundler; hay tests JS (`tests/js/*.mjs`) y de API (`tests/web/*.py`) pero cobertura parcial.
  - **Doble identidad/estructura** (ver arriba): confunde y arrastra docs obsoletos.
  - **Enlace con la máquina real inexistente:** todo funciona hoy contra simulación; el backend de máquina está por construir.

## 6. Archivos adjuntos de este proyecto
*(marca los que has subido)*
- [x] Manifiesto de dependencias — visor: [`urdf_viewer/projects/avisualizer/pyproject.toml`](../urdf_viewer/projects/avisualizer/pyproject.toml), [`urdf_viewer/requirements.txt`](../urdf_viewer/requirements.txt); slicer/plataforma: [`_slicer_branch/projects/platform/pyproject.toml`](../_slicer_branch/projects/platform/pyproject.toml), [`_slicer_branch/requirements.txt`](../_slicer_branch/requirements.txt); front plataforma: [`_slicer_branch/projects/platform/frontend/package.json`](../_slicer_branch/projects/platform/frontend/package.json). Resumen consolidado en [`ficha_adjuntos/dependencias.md`](ficha_adjuntos/dependencias.md).
- [x] README — [`README.md`](../README.md) (raíz, autoritativo) + READMEs de submódulos.
- [x] Configuración de entornos — variables `AVIS_SLICER_URL`, `AVIS_SLICER_UI_URL`, `AVIS_MACHINE` / `?machine=1`; arranque en [`launch-viewer.ps1`](../launch-viewer.ps1), [`Start-Viewer.bat`](../Start-Viewer.bat) / [`Stop-Viewer.bat`](../Stop-Viewer.bat).
- [x] Definición de API — sin OpenAPI formal; rutas FastAPI del visor listadas en [`ficha_adjuntos/arquitectura-resumen.md`](ficha_adjuntos/arquitectura-resumen.md) y contrato del enlace de máquina en `urdf_viewer/.../sim/machineLink.js`.
- [ ] Esquema de base de datos (migraciones / DDL) — n/a para el visor (ficheros/JSON). *(Solo la plataforma cloud usa Alembic: `_slicer_branch/projects/platform/migrations/`.)*
- [x] Árbol de carpetas — [`ficha_adjuntos/arbol-carpetas.txt`](ficha_adjuntos/arbol-carpetas.txt) (`git ls-files`, resumido).
