# Evaluación de calidad de software

> Fecha: **2026-08-06** · Proyecto: Meltio WebUI (HMI operador M600-PRO — `avisualizer` + `meltio-platform`) · Modo: **profunda** (detección tecnológica + 4 revisores especializados + verificación adversarial en 3 lotes) · Evaluación anterior: **2026-07-24** (global 56/100)

> **Ámbito y método.** 14 hallazgos únicos pasaron por verificación adversarial: **9 confirmados, 5 ajustados, 0 refutados en bloque** (2 de los ajustados tienen su núcleo refutado). La verificación produjo además 9 hallazgos nuevos, todos comprobados antes de aceptarse. Las severidades y notas de este informe son las **posteriores** a la verificación, no las propuestas por los revisores.

---

## 1. Resumen ejecutivo

Entre la evaluación anterior y hoy el proyecto ejecutó un plan de 10 pasos en 14 PRs (#11–24): contrato v2, partición `hmi/` / `viewer/` con gates en CI, extracción de 11 módulos del god-file (19.890 → 13.092 líneas, **−34%**), fase C (hoist a raíz + `apps/dev-host/`), `gate.sh` de 6 puertas, canal `release`, `AGENTS.md` y endurecimiento de LFS. Es trabajo real y medible: la arquitectura de hoy tiene una dirección de dependencias limpia (0 imports cruzados `hmi`↔`viewer`), un puerto a máquina de libro de texto, autorización server-side con auditoría, y un proceso (main protegido, 3 checks, 6 puertas) que efectivamente sostiene la partición.

Y sin embargo **la nota global sube un solo punto (56 → 57)**. La razón hay que decirla sin rodeos:

**Durante el periodo evaluado se introdujo un defecto 🔴 nuevo.** El entry point comiteado (`apps/dev-host/src/avisualizer/web/static/urdf.html:1449`) apunta a `/static/dist/urdf_viewer-IFAMWKMS.js`, un bundle de esbuild que **`.gitignore:13` excluye del repositorio** (`git ls-files "*static/dist*"` → 0 ficheros). Un clon fresco arranca con el HMI muerto: el `<script type="module">` da 404 y no queda nada. Ningún lanzador ejecuta `npm`, y `README.md:26` y `CONTRIBUTING.md:12` siguen afirmando que no hay build step. Nadie lo ha notado porque el bundle existe en el working tree de esta máquina (295 KB).

Peor que el defecto es **por qué llegó a `main`**: el único test que lo habría cazado (`tests/smoke/test_smoke.py:49-60`, que sigue el marcador `data-app-entry` y exige que el bundle sirva 200 con >100 KB) **no lo ejecuta ningún job de CI**. `ci.yml:27` corre `pytest apps/dev-host/tests` y `ci.yml:42` `pytest _slicer_branch/projects/platform/tests`; `tests/smoke/` vive en la raíz del repo y `gate.sh:9` lo excluye explícitamente por diseño. Una suite entera de 8 journeys de operador sobre servidores reales es 100% manual. El proceso de gates que este periodo construyó es bueno, pero tiene un agujero con forma exacta del bug que dejó pasar.

**¿Es mantenible?** Ahora sí, con reservas. El god-file bajó un tercio, hay 11 módulos con fronteras vigiladas, el bus factor pasó de 1 a 2 y la deuda declarada es cero (0 TODOs, 0 `console.log` en 30k LOC). Contra eso: `CONTRIBUTING.md` no se tocó en la fase C — arrastra 9 rutas rotas y afirma que *"There is **no active CI** at the repo root… these local commands are the contract"* (`CONTRIBUTING.md:39`), falso desde que existe `ci.yml` con main protegido. Un contribuidor nuevo que siga "Validate before every PR" al pie de la letra no ejecuta absolutamente nada.

**¿Es escalable?** Sí para su caso de uso y, ahora, también en coste de evolución: la partición, el contrato host-owned y el puerto de máquina son las tres piezas correctas. El límite es que el artefacto publicado en `release` **no es autocontenido**: los módulos `hmi/` exigen 214 ids del DOM (materials 87, settings 38, utilities 33, calendar 31, notifications 29, fileLibrary 8) que solo existen en un `urdf.html` que no se publica, y no hay **ni un `@typedef`** en todo `hmi/`. El consumidor C# recibirá un árbol que carga limpiamente y no hace nada, en silencio.

**¿Es seguro en su modelo de despliegue?** Menos que hace dos semanas, y no por regresión sino porque ahora hay algo que atacar. La evaluación anterior puntuó 70 sobre un sistema cuyo gating era 100% cosmético pero cuyo frontend ni siquiera arrancaba. Hoy existe autorización server-side real, con auditoría JSONL y test — y tres agujeros 🟠 confirmados empíricamente, el peor de los cuales es que **`PUT /api/permissions/config` no exige autenticación**: `PUT {}` sin credenciales devuelve 200 y deja el fichero literalmente en `{}`, tras lo cual ningún login funciona y la recuperación exige reescribir `permissions.json` a mano. La única razón de que esto no sea 🔴 es que el premio es un mock read-only. Pasa a 🔴 en cuanto `_FORWARDABLE` crezca más allá de `{ESTOP, STOP}` o `AVIS_MACHINE_READONLY=0`.

**¿Muestra indicios de generación por IA con consecuencias?** Sí, pero de una clase distinta a la anterior. Ya no hay imports fantasma ni documentación que promete funciones inexistentes. Lo que queda es el patrón **"la pieza se escribió, el cableado no"**: `machine.command` es la constante de permiso que el backend exige (`app.py:866`) y **no aparece en ningún `.js` ni `.json` del repositorio** — en una instalación limpia el camino de comandos está muerto por diseño; `print.control` está declarado en el catálogo (`hmi/permissions.js:31`) y no lo aplica nadie; `/api/me` existe (`app.py:929-951`) y el frontend nunca lo llama; `emergencyStop()` está implementado y no tiene llamadores; `openAdvancedModePinModal` con un PIN embebido `"7391"` tampoco. Cada pieza está bien hecha por separado y no está conectada a la de al lado. Añádase que `install.ps1`, en la raíz del repo, es el instalador de un producto de terceros no relacionado (`codebase-memory-mcp`) colocado donde parece parte del setup del HMI.

| Dimensión | Puntuación | Estado | Δ vs. 2026-07-24 |
|---|---|---|---|
| Arquitectura | 46/100 | 🔴 | +4 |
| Calidad de código | 62/100 | 🟡 | −2 |
| Seguridad | 58/100 | 🔴 | −12 |
| Rendimiento *(no pondera)* | 84/100 | 🟢 | +6 |
| Mantenibilidad | 54/100 | 🔴 | +6 |
| Escalabilidad | 68/100 | 🟡 | +10 |
| Testing | 56/100 | 🔴 | +14 |
| **Global (ponderada)** | **57/100** | 🔴 | **+1** |

*(Umbrales de estado: 🟢 ≥75, 🟡 60-74, 🔴 <60. Rendimiento se evalúa pero no pondera en la global, rúbrica §5. Aritmética completa y auditable en el Apéndice A.)*

La lectura correcta del +1 no es "no se avanzó". Es que **el avance estructural se consumió íntegro** en: (a) un 🔴 nuevo de proceso, y (b) tres 🟠 de seguridad que la evaluación anterior no podía ver porque no había superficie que evaluar. Las dimensiones que miden trabajo interno (Testing +14, Escalabilidad +10, Mantenibilidad +6) suben con claridad; las que miden el resultado publicado (Arquitectura, Seguridad) no.

---

## 2. Contexto tecnológico

**Stack.** Python 3.11 + FastAPI ×2 apps: viewer `avisualizer` (:8090, `apps/dev-host/`) y slicer `meltio-platform` (:8765, `_slicer_branch/projects/platform/`). Frontend vanilla JS en ES modules sin framework, Three.js vendorizado vía importmap, esbuild **solo para release**. Despliegue: kiosk Windows 11, loopback estricto, panel táctil 1080×1920, operador físico, sin TLS.

**Seguridad de base.** PBKDF2 (100k iteraciones, salt de 16 B, `compare_digest`) sobre `database/permissions.json` (gitignored). El enlace a máquina real está apagado por defecto (`?machine=1`); el adaptador real es **read-only por defecto** (`AVIS_MACHINE_READONLY=1`) con allowlist `_FORWARDABLE={ESTOP, STOP}`; **ningún lanzador define `AVIS_MACHINE_URL`**, así que hoy siempre se ejecuta contra el mock in-process. Este último hecho es la razón de que ningún hallazgo de seguridad alcance 🔴.

**Proceso.** CI con 3 checks (viewer pytest, slicer pytest, frontend js checks con 4 gates + eslint + build). `release.yml` publica `hmi/` + `viewer/` + `contract.json` a la rama `release` si `gate.sh` (6 puertas) pasa. `contract.json` v2 es el contrato UI↔host, host-owned.

**Módulos y tamaños.**

| Zona | LOC | Notas |
|---|---|---|
| `apps/dev-host/` | ~30.400 | `app.py` 972 + services; **`urdf_viewer.js` 13.092 (god-file)**, `urdf_viewer.css` 9.185, `app.js` point-cloud 1.363, `urdf.html` 1.451 |
| `hmi/` (raíz) | 7.616 | materials 1.590, notifications 1.434, calendar 820, fileLibrary 799, settings 644, permissions 498, utilities 427, prePrintCheck 273, `ports/` 336, `state/` 521, i18n, error_codes |
| `viewer/` (raíz) | 3.051 | `sim/`, `toolpath/`, `effects/`, `overlays/` |
| Slicer | ~13.000 | `core/` 4.516 py (pipeline de 10 etapas), `web/static/app.js` 5.144 |
| `meltio_platform/web` | ~5.100 | **dormante** (shell cloud) |
| `urdf_viewer/` (raíz) | ~36.700 | **legacy** (docs/scripts + tooling de skills que nada ejecuta) |
| `static/vendor/` | 116.416 | Three.js r164 vendorizado, **dos copias** |

**Métricas.** Código propio activo ~48.389 LOC. Tests: 21 ficheros, ~144 tests (pytest 117 — slicer 77 con pipeline real, viewer 32, smoke 8; `node:test` 27). **Ratio test/código 0,06** (0,17 contra lo realmente testeable). Frontend DOM/Three ~29k LOC con **cero unit tests**. TODOs efectivos: 0. Git: 26 días de vida, 53 commits, todos vía PR a main protegido, 2 autores (Ricardo 41, Maksim 12), bus factor 2, mediana de commit 513 líneas. Duplicación dominante: re-render imperativo disperso.

**Hotspots** (churn con `--follow`): `urdf_viewer.js` (19 commits), `urdf.html` (19), `urdf_viewer.css` (8), `app.py` (5), `hmi/permissions.js` (5), `printSimulation.js` (4), `prePrintCheck` + `machineLink` (3+3), `materials`/`notifications` (2 c/u), slicer `app.js` (2).

**Límites de confianza declarados.** El god-file y el CSS no se leyeron enteros (muestreo por zonas). Los árboles dormantes solo se analizaron estáticamente. El legacy `urdf_viewer/` quedó excluido. 26 días de historial no permiten hablar de tendencia a largo plazo.

---

## 3. Arquitectura — 46/100 🔴

### ARQ-1 🔴 CONFIRMADO — El entry point comiteado apunta a un bundle que no está en el repositorio

Un clon fresco produce un HMI muerto.

- `apps/dev-host/src/avisualizer/web/static/urdf.html:1449` → `<script type="module" data-app-entry src="/static/dist/urdf_viewer-IFAMWKMS.js">`.
- `.gitignore:13` → `dist/`, bajo la cabecera **"Python caches / build artifacts"**. Es una regla pensada para artefactos de `setuptools` que se traga el bundle JS. Ésta es la causa raíz.
- `git ls-files "*static/dist*"` → **0 ficheros**. Verificado.
- Los lanzadores se leyeron enteros: **cero invocaciones de `npm`**.
- `README.md:26` describe el frontend como *"vanilla-JS + Three.js app (no build step)"*; `CONTRIBUTING.md:12` repite *"**no JS build step** (ES modules served as-is)"*.

**Por qué no se detectó**: el bundle existe hoy en el working tree (295 KB), así que la máquina de desarrollo no reproduce el fallo, y el test que lo detectaría no corre en CI (ver TST-1). **Atenuante verificado**: el build es determinista (mismo hash al re-ejecutar) y la recuperación es `npm ci && npm run build`.

**Fix**: negar la exclusión (`!apps/dev-host/**/static/dist/`) o comitear el bundle, o bien construirlo en el arranque del lanzador; y mover `tests/smoke/` a CI para que el fallo sea imposible de repetir. Corregir los tres documentos que afirman lo contrario.

### ARQ-2 🟠 CONFIRMADO — Tres vocabularios de autorización desconectados; el camino de comandos está muerto en instalación limpia

`contract.json` declara un permiso por comando y nadie lo aplica. El backend exige la constante `MACHINE_COMMAND_PERMISSION` (`app.py:866`), cuyo valor `machine.command` **no aparece en ningún `.js` ni `.json` del repositorio** — solo en `app.py` y en semillas de test. Consecuencia verificada, y peor que la reclamada por el revisor: `permissions.json` no está en el repo; quien lo cree desde la UI de administración solo puede marcar claves del `PERMISSION_CATALOG`; por tanto ningún rol tendrá jamás `machine.command` y **todo comando devolverá 403 en silencio**. Mitigación comprobada: guardar la matriz no borra la clave (el `Set` add/delete preserva las desconocidas), así que una edición manual del JSON sobrevive.

**Fix**: añadir `machine.command` al `PERMISSION_CATALOG` y sembrarlo en el rol Support/God del `permissions.json` por defecto; o mejor, derivar el catálogo de `contract.json` para que exista un solo vocabulario.

### ARQ-3 🟠 CONFIRMADO — El artefacto de release no es autocontenido

Los módulos publicados en la rama `release` se sueldan al DOM por `getElementById` contra un `urdf.html` que **no se publica**. Conteo real: materials 87, settings 38, **utilities 33** (que el revisor omitió), calendar 31, notifications 29, fileLibrary 8 = **214 ids del DOM exigidos**, ninguno declarado en el artefacto. Las dependencias inyectadas tampoco están tipadas: `initMaterialsUi` recibe exactamente 30 claves de callback, `initFileLibrary` 16, y hay **0 `@typedef` en todo `hmi/`**.

**Corrección a favor del código**: el árbol publicado **sí** es autocontenido en imports (0 imports fuera de `hmi/`+`viewer/` salvo el bare specifier `three`), así que el artefacto carga sin errores — simplemente no hace nada. Y como todos los `getElementById` están guardados con `if (el)`, el fallo es **silencioso**, lo que empeora el diagnóstico para el consumidor C#.

**Fix**: publicar un `contract-dom.json` (o un fragmento HTML de referencia) con los 214 ids y sus roles, y un `@typedef` por cada objeto de dependencias.

### ARQ-5 🟠 AJUSTADO — Documentación de contribución rota (la mitad de la reclamación era falsa; la otra mitad es peor)

- **`CLAUDE.md`: REFUTADO.** Sí se actualizó en la fase C. 15 de sus 16 rutas resuelven y ninguna de las tres rutas rotas que reclamó el revisor aparece en el fichero. Residuo real: `CLAUDE.md:119` con una ruta pre-fase-C en prosa, y `CLAUDE.md:68` afirmando *"no configured linter/formatter"*, que es falso desde que hay eslint en CI.
- **`CONTRIBUTING.md`: CONFIRMADO y peor de lo reclamado.** No se tocó en la fase C: **9 rutas rotas**, afirma *"no JS build step"* (`:12`, `:48`) y, sobre todo, `CONTRIBUTING.md:39`: *"There is **no active CI** at the repo root (the `*/.github/` workflows live in subfolders and do not run here), so **these local commands are the contract**"*. Falso desde que existe `ci.yml` con main protegido. El apartado se titula "Validate before every PR (definition of green)" y las rutas que da (`urdf_viewer/projects/avisualizer/tools/check_imports.mjs`, `:49`) ya no existen — quien las siga literalmente **no ejecuta nada**.
- `README.md:26-27` arrastra el mismo "no build step" y la ruta pre-fase-C `urdf_viewer/…/web/static/`.

**Fix**: reescribir `CONTRIBUTING.md` apuntando a `ci.yml` y `gate.sh` como contrato, no a comandos locales.

### Hallazgos menores de arquitectura

| ID | Sev. | Hallazgo | Evidencia | Fix |
|---|---|---|---|---|
| ARQ-4 | 🟡 (ajustado desde 🟠) | Costura god-file↔`hmi/` ancha y bidireccional. **Núcleo refutado**: la afirmación "las escrituras son solo convención sin gate" es falsa — los `export let` importados son read-only por especificación (reproducido: `TypeError: Assignment to constant variable`) y no hay mutaciones externas del objeto mutable. Conteo corregido: materials exporta 56 símbolos pero el god-file **importa 23**. Queda coste de mantenimiento y una mina de boot (9 usos anteriores a la asignación, todos diferidos hoy), sin escenario de fallo actual y con el patrón documentado en `AGENTS.md`. | `hmi/materials.js` | Estrechar la superficie exportada a lo consumido |
| ARQ-6 | 🟡 | `contract.json` v2 es aspiracional: envolvente y vocabulario canónico declarados sin implementación; `check_contract.mjs` solo valida nombres literales | `contract.json` | Implementar la envolvente o marcarla como reservada |
| ARQ-7 | 🟡 | `prePrintCheck`: ~20 hex propios violando el STYLEGUIDE + rama muerta (`runStartPrintAction` devuelve `true` incondicionalmente → la restauración de cámara al cancelar el checklist es inalcanzable) | `hmi/prePrintCheck.js` | Tokens CSS; devolver el resultado real |
| ARQ-8 | 🟡 | Bus de acoplamiento por `window.*`: 13 globals, ~55 usos, invisible para los gates de frontera | varios | Declarar los globals en un módulo único |
| ARQ-9 | 🟡 | Re-render imperativo por fan-out, sin invalidación central | `hmi/*` | Un `invalidate(dominio)` por módulo |
| ARQ-10 | 🟢 | `create_app()` de 585 líneas con todo en closures — el mismo patrón que engendró el god-file del frontend | `app.py` | Extraer routers |
| ARQ-11 | 🟢 | Gates de frontera incompletos **por diseño**: no impiden `hmi`↔`viewer`, no ven los globals, y el regex es burlable | `tools/` | Documentado; aceptable |
| ARQ-12 | 🟢 | i18n esqueleto con adopción desigual: 41 claves; materials usa `t()` ×23, settings/prePrintCheck/permissions ×0 | `hmi/i18n.js` | Completar o retirar |

---

## 4. Calidad de código — 62/100 🟡

La higiene de este código es inusualmente buena y conviene decirlo antes que los defectos: **0 TODOs y 0 `console.log` en 30.000 LOC**, `escapeHtml` en todos los sinks de `innerHTML` sin excepción, listeners guardados sistemáticamente, y comentarios que explican *porqués* en lugar de parafrasear el código. Los defectos que siguen no son de descuido; son de cableado y de duplicación.

### COD-5 🟠 CONFIRMADO — El gate de pre-impresión es default-pass en los 7 checks, y el fondo es peor de lo reclamado

**7 de 7 auto-checks son default-pass; ninguno exige `=== true`.**

El escenario literal del revisor está **refutado**: "snapshot vacío pinta todo verde" no ocurre, porque el default `getSignals: () => ({})` es código muerto — el host siempre inyecta `notificationsUi.getSignalsSnapshot()`.

Pero el mecanismo real es más grave. Ese snapshot hace `{...mockNotificationSignals, ...(globalSignals || {})}` y `hmi/ports/machineLink.js:78` reemplaza el objeto global **en bloque**. Con una máquina real conectada, **cualquier clave que la telemetría no reporte cae al valor nominal del mock**: `doorsClosed: true`, `laserHeadReady: true`, `emergencyStopActive: false`… Un snapshot parcial, o con nombres de clave distintos a los del mock, produce un checklist en verde que no ha comprobado nada. No está documentado como deliberado — la cabecera del módulo afirma lo contrario (*"The machine is the source of truth"*). Y con el enlace habilitado se desactiva además el fallback que corregía `doorsClosed` desde la escena.

**Fix**: exigir `=== true` en cada predicado y tratar la clave ausente como fallo con motivo "señal no reportada"; no fusionar el snapshot real con los valores nominales del mock.

### COD-1 / SEG-1 🟠 CONFIRMADO — `PUT /api/permissions/config` sin autenticación

Reproducido empíricamente con `TestClient`:

1. `PUT {}` sin credenciales → **200**, y el fichero queda literalmente `{}`. El login posterior devuelve 401 para todo el mundo. El wipe es real porque `app.py:591` (`if merged_users or "users" in data:`) no se ejecuta con un cuerpo vacío.
2. `PUT` añadiendo `machine.command` al rol `operator` → login como operador → `POST /api/machine/command ARM` → **200**.

No hay middleware autenticador: **0 ocurrencias de `Depends(` en `app.py`**. La recuperación tras el wipe es manual: `tools/set_password.py:59-62` exige usuarios preexistentes y la UI de usuarios es de solo lectura, así que hay que reescribir `permissions.json` a mano.

**Modelo de amenaza**: el vector cross-site está cerrado (el preflight falla, CORS solo permite `GET`). El vector real es cualquier proceso local o las devtools del kiosko. **No sube a 🔴 porque el premio es un mock read-only; pasa a 🔴 en cuanto `_FORWARDABLE` crezca o `AVIS_MACHINE_READONLY=0`.**

### COD-2 / SEG-2 🟠 CONFIRMADO — Sesiones sin caducidad ni revocación server-side

`_sessions[token]` no guarda timestamp; `_operator_from_request` es literalmente `return _sessions.get(token)`. `SESSION_TTL_SECONDS` aparece únicamente en el `max_age` de la cookie (`app.py:52` y `app.py:562`) y en ningún otro sitio. Un grep de `auth/logout` en todo el repositorio da solo `app.py:567` y un test: **el sign-out del cliente nunca revoca la sesión del servidor**.

**Refutada** la sub-afirmación de crecimiento sin cota: ~100 B por login en un kiosko es irrelevante.

**Refuerzo nuevo encontrado en verificación**: `print.control` (`hmi/permissions.js:31`) no se aplica en ningún sitio. Tras el auto-sign-out por inactividad, los botones Start/Pause/Stop **siguen operativos** y el comando se audita a nombre del operador anterior — por el camino normal de uso, sin devtools.

**Fix**: guardar `(operator, created_at)` y validar TTL en `_operator_from_request`; que `POST /api/auth/logout` haga `_sessions.pop(token)`.

### COD-3 🟠 CONFIRMADO (conteos corregidos) — Render triple-superficie por copy-paste en `hmi/materials.js`

81 `getElementById` (no 84) y **24 bloques idénticos** en `updateSpoolSelectionCards`, función que termina en `:295`. Correcciones a la reclamación original: el texto Used/Left/Required se construye **2 veces**, no 3 — pero el literal `"Not enough material (X left, Y required)"` sí está duplicado verbatim en `:852` y `:856`; Assign/Unload duplican 2× y no 3×. Las asimetrías entre superficies son reales pero incidentales (ids que faltan, no comportamiento divergente).

**Coste confirmado**: 6-7 ediciones sincronizadas para añadir un campo, sin ningún test de DOM que detecte una desincronización.

### COD-4 🟠 CONFIRMADO — La costura a hardware no tiene un solo test

`hmi/state/machineState.js` son 131 líneas sin imports, sin DOM y sin Three, con cabecera explícita *"so it can be unit-tested without Three.js or a live connection"*, y `hmi/ports/machineLink.js` expone `_machine: machine, // exposed for tests` literalmente. `tests/js/` contiene 3 ficheros y **ninguno importa `machineState.js`**. Se buscó cobertura indirecta: los tests existentes cubren el lado servidor (auth/audit, adaptador Python, forma del snapshot HTTP), pero nadie ejercita `canTransition`, `BASE_TRANSITIONS` ni la adopción del estado reportado.

Sin ajuste tras verificación. **Es el hallazgo más barato de cerrar de todo el informe: ~40 líneas de test.**

### Hallazgos menores de código

| ID | Sev. | Hallazgo | Evidencia | Fix |
|---|---|---|---|---|
| COD-6 | 🟡 | Diálogo de seguridad con paleta hardcodeada ignorando los tokens del STYLEGUIDE | `hmi/prePrintCheck.js` | Tokens `--bg`/`--panel`/`--accent` |
| COD-7 | 🟡 | i18n adoptado a medias (= ARQ-12) | `hmi/i18n.js` | Completar o retirar |
| COD-8 | 🟡 | Backend sin logging: los fallos son silenciosos e indiagnosticables (3 `except: pass` razonados) | `app.py` | Un `logging.getLogger(__name__)` y `.warning()` en los tres |
| COD-9 | 🟡 | God-file de 13.092 líneas: coste residual dominante | `urdf_viewer.js` | Continuar la extracción por dominio |
| COD-10 | 🟡 | Aserciones tautológicas: `typeof === "object"` sobre la lógica de umbrales del gate de material | `tests/js/materialsState.test.mjs` | Afirmar el valor del umbral |
| — | ℹ️ | `machineLink.js:171` envía `ts: undefined`, que desaparece en `JSON.stringify` | `hmi/ports/machineLink.js:171` | Omitir la clave o darle valor |
| — | ℹ️ | `let deps = {}` permite invocación pre-init (fragilidad latente, sin fallo hoy) | `hmi/*` | Inicializar a `null` y fallar ruidosamente |

---

## 5. Seguridad — 58/100 🔴

**Modelo de amenaza**: kiosk Windows en loopback estricto, operador físico, sin TLS, sin exposición a internet, y con el enlace a máquina apagado por defecto y read-only cuando se enciende. La probabilidad se evalúa contra ese modelo, no contra el peor caso teórico (rúbrica §1). Por eso **ningún hallazgo alcanza 🔴 hoy**, y por eso varios están marcados con su condición de escalada.

Lo verificado como correcto merece constar primero, porque es sustancial: autorización server-side real con auditoría JSONL y test que la cubre; adaptador read-only por defecto con allowlist mínima; `postMessage` que verifica el **emisor** (`event.source === contentWindow`) y un bridge de sensores que exige mismo origen y rechaza `"null"`; PBKDF2 correcto que además calcula el hash para usuarios inexistentes (sin oráculo de temporización); escapado sistemático en todos los sinks; CORS estrecho (solo `GET`, sin credenciales); cero secretos en el repo y en el historial; cero path traversal (`Path.name` / slug); loopback verificado.

- **SEG-1 🟠 CONFIRMADO** — `PUT /api/permissions/config` sin autenticación. Detalle completo y reproducción en **COD-1** (§4). Escala a 🔴 con `_FORWARDABLE` ampliado o `READONLY=0`.
- **SEG-2 🟠 CONFIRMADO** — Sesiones sin caducidad ni revocación. Detalle en **COD-2** (§4).
- **SEG-3 🟠 CONFIRMADO en su tesis, ajustado en 2 de sus 3 sub-afirmaciones** — *La autorización colapsa el contrato en un solo bit.*
  - **(a) Un permiso para todo: confirmado en ejecución.** Con solo `machine.command`, ARM y ESTOP pasan igual. El propio test del repositorio consagra esta granularidad.
  - **(b) Args sin validar: cierto literalmente, pero hoy irrelevante.** El mock ignora los args de movimiento y el adaptador real nunca los transmite (`machine_controlservice.py:391`). **No debe venderse como "los args llegan a la máquina"** — no llegan.
  - **(c) `emergencyStop` devuelve 401 contra lo declarado en el contrato: confirmado de hecho, pero no hay botón de E-stop en la UI** (`MeltioMachine.emergencyStop()` no tiene llamadores). Es un incumplimiento de contrato latente, no una función de seguridad rota.
  - **Fix**: un permiso por familia de comando (`machine.jog`, `machine.estop`, `machine.print`), validado contra `contract.json`.

### Hallazgos menores de seguridad

| ID | Sev. | Hallazgo | Evidencia / matiz de la verificación |
|---|---|---|---|
| SEG-4 | 🟡 (ajustado desde 🟠) | Parada automática por error falla en silencio (catch vacío), inconsistente con `confirmStopPrint`. **El mecanismo descrito por el revisor es incorrecto**: tras el auto-sign-out no hay 401, precisamente porque la cookie sigue válida (SEG-2). La ruta está además casi muerta y el operador **no** queda a ciegas (la simulación ya se pausó, se abrió el aviso y se levantó una notificación de prioridad 95). Queda una inconsistencia real de manejo de errores. |
| SEG-5 | 🟡 (ajustado desde 🟠) | Checklist de pre-impresión 100% cliente con override por booleano de `sessionStorage`. **Refutado "sin registro server-side"**: hay identidad server-side, autorización por rol y audit log; falsificar `sessionStorage` **no** consigue que el servidor acepte un comando. **Sobrevive**: el flag `overridden` se pierde — `commandMachinePrintStart` envía solo `jobId`/`program`/`estimatedSeconds`/`layerCount`, así que un START_PRINT con interlock en rojo es **byte-idéntico** a uno limpio en la auditoría. Sube a 🟠 cuando START_PRINT sea forwardable. |
| SEG-6 | 🟡 | PIN de servicio `"7391"` embebido en el JS de cliente. Código muerto: `openAdvancedModePinModal` no tiene llamadores. |
| SEG-7 | 🟡 | `machineLink.stop` (ciclo de vida) queda sombreado por el comando `STOP`: el spread posterior lo sobrescribe. |
| SEG-8 | 🟡 | El slicer no tiene autenticación: `POST`/`DELETE /api/profiles` anónimos permiten mutar perfiles de máquina. |
| SEG-9 | 🟡 | Three.js r164 vendorizado **por duplicado sin manifiesto**; sin `pip-audit`/`npm audit` en CI; rangos abiertos sin lockfile. |
| SEG-10 | 🟢/🟡 | `GET /api/permissions/config` anónimo expone el padrón completo de usuarios (el stripping de `salt`/`passwordHash` **sí** es correcto). El login no tiene rate limiting. |

**Precondición no negociable**: los tres 🟠 deben cerrarse **antes** de ampliar `_FORWARDABLE` o poner `AVIS_MACHINE_READONLY=0`. Hoy la seguridad del sistema descansa en que el adaptador no reenvía nada; ése es un buen fail-safe, pero es el *único* que hay.

---

## 6. Rendimiento — 84/100 🟢

La única reclamación 🟠 se midió y **bajó a 🟡**. No queda ningún hallazgo importante en esta dimensión.

El perfil verificado es sólido: **render on-demand real** (cero draw calls en reposo) tanto en el viewer como en el slicer; calidad adaptativa con histéresis; decisiones documentadas contra el modelo real de 7,5 M triángulos; memo-guards correctos donde importan; toolpath con buffers tipados y `setDrawRange` (el coste por avance de progreso es ≈0) y `dispose()` completo; raycasts de anotaciones apagados (presupuesto 0); estructuras acotadas (notificaciones 300, toasts 3, usage-log 200, partículas 600); timers disciplinados; backend sano (endpoints síncronos al threadpool, caché `.npz`, respuesta binaria packed, `FileResponse` en streaming).

| ID | Sev. | Hallazgo | Medición / matiz |
|---|---|---|---|
| REN-1 | 🟡 (ajustado desde 🟠, **medido**) | `getStats()` O(n) + `Intl` a 60 fps durante impresiones | Estructura confirmada (no cachea; el memo-guard solo corta en reposo; son 5 `getElementById`/frame, no 6). **Medición propia, 60 iteraciones**: el barrido de posiciones tarda 0,04–0,2 ms **incluso a 100k segmentos** (despreciable: bucle apretado sobre `Float32Array`). El coste real es la agregación térmica con `Map`, **que solo existe si el operador corrió la simulación térmica en el slicer** (si no, `segs.length === 0` y el bloque se salta). Caso común ≈0,12 ms/frame (0,7% del presupuesto); caso térmico grande ≈2,7 ms. `toLocaleTimeString` 0,063 ms vs 0,0034 cacheado (**18×**). Desperdicio puro y trivial de corregir, pero no 🟠 en el camino habitual. |
| REN-2 | 🟡 | Thumbnails: descargas STL sin límite de concurrencia + re-render O(N²) de la lista | Acotar a 3-4 en vuelo; render incremental |
| REN-3 | 🟡 | `_PARSED_DATA_CACHE` del backend: las versiones antiguas del dataset nunca se desalojan | **Persiste desde la evaluación anterior** (allí era 🟠 REN-2); expulsión por `(ruta, atributo)` |
| REN-4 | 🟡 | El point-cloud viewer (`/`) renderiza incondicionalmente a 60 fps sin gating | Aplicarle el mismo render on-demand del viewer principal |
| REN-5 | 🟡 | Updaters del RAF sin memo-guard: `feederWheelFloat` escribe DOM cada frame, `computeObjectLocalBounds` por frame, `matchMedia` por frame | Memo-guards, como los que ya existen en otras rutas |
| REN-6 | 🟡 | Slicer: ordenación de infill greedy O(n²) en Python puro | Aceptable a los tamaños actuales; medir antes de tocar |
| — | ℹ️ | El pulso del spool-highlight se congela por falta de `requestRender` | Corrección de comportamiento, no de coste |

---

## 7. Mantenibilidad — 54/100 🔴

Ninguno de los cuatro revisores puntuó esta dimensión; se deriva de estructura de módulos, documentación, bus factor, gates, cobertura y deuda declarada.

**A favor** (todo del periodo evaluado): god-file −34% con 11 módulos extraídos, ninguno mayor de 1.590 líneas; fronteras vigiladas por 4 gates + eslint + build en CI, con main protegido y 53/53 commits vía PR; `gate.sh` de 6 puertas antes de publicar en `release`; `AGENTS.md` documentando los patrones; bus factor 1 → 2; **deuda declarada cero** (0 TODOs); `CLAUDE.md` y `ARCHITECTURE.md` actualizados en la fase C (15/16 rutas resuelven).

**En contra**: ARQ-1 hace que un clon fresco no arranque, que es el peor resultado posible para la mantenibilidad de un repositorio; `CONTRIBUTING.md` no solo tiene 9 rutas rotas sino que **desinforma activamente** sobre la existencia de CI (`:39`); el frontend DOM/Three de ~29k LOC sigue sin un solo unit test, así que los 24 bloques copy-paste de `materials.js` no tienen red; los 214 ids del DOM y los 30 callbacks de `initMaterialsUi` son contratos implícitos sin un `@typedef`; el bus `window.*` (13 globals, ~55 usos) es invisible para los gates; y `install.ps1` en la raíz es el instalador de `codebase-memory-mcp`, un producto de terceros sin relación con el HMI, colocado donde cualquiera lo tomará por parte del setup.

---

## 8. Escalabilidad — 68/100 🟡

Es la dimensión que más mejora (+10). Las tres piezas correctas para crecer están puestas: **dirección de dependencias limpia** (0 imports `hmi`↔`viewer`, `viewer/sim` y `toolpath/` puros), **contrato host-owned** (`contract.json` v2 con gate en CI), y **un puerto a máquina de libro de texto** (`hmi/ports/machineLink.js`: fail-safe, sin auto-retry — deliberadamente, y documentado). El runtime tiene holgura de sobra para su caso de uso (1 operador, estructuras acotadas, render on-demand).

Los dos límites son de acoplamiento, no de capacidad: el artefacto no autocontenido (ARQ-3) bloquea al consumidor C# externo, y la fragmentación del vocabulario de autorización (ARQ-2) bloquea el siguiente paso natural del producto, que es conectar hardware real. `_PARSED_DATA_CACHE` (REN-3) sigue sin cota tras la evaluación anterior, pero degradado a 🟡.

---

## 9. Testing — 56/100 🔴

También sube con fuerza (+14) y por buenas razones. **Los tests que existen son de comportamiento real, no de fachada** — lo contrario de lo que encontró la evaluación anterior:

- `tests/smoke/` levanta ambos servidores de verdad, rebana un cubo y afirma que salen múltiples capas.
- `test_slicer_core_contracts.py` verifica geometría calculada a mano contra el pipeline real (77 tests sobre el motor que la evaluación anterior describía como cero cobertura).
- `test_machine_command_auth` prueba 401 / 403 / 200 **y** que se escribe una línea de auditoría.

Contra eso, dos 🟠 y una métrica dura.

### TST-1 🟠 NUEVO — La suite de smoke no se ejecuta en CI

`ci.yml:27` corre `pytest apps/dev-host/tests` y `ci.yml:42` `pytest _slicer_branch/projects/platform/tests`. `tests/smoke/` está en la **raíz del repositorio** y no lo cubre ningún job; `gate.sh:9` lo excluye explícitamente por diseño. Son 8 journeys de operador contra servidores reales — incluida la única prueba del bundle (`test_smoke.py:49-60`) y la del proxy de slicing — al 100% manuales.

**Es la causa directa de que ARQ-1 llegara a `main`.** Fix: un cuarto job en `ci.yml` que corra `pytest tests/smoke` con ambos servidores levantados.

### COD-4 🟠 CONFIRMADO — La máquina de estados de hardware, sin cobertura

Detalle en §4. Es el hallazgo más barato de cerrar del informe.

### Métricas

Ratio test/código **0,06** (0,17 contra lo realmente testeable). **~29.000 LOC de frontend DOM/Three con cero unit tests.** 21 ficheros, ~144 tests. Y COD-10: las aserciones de `tests/js/materialsState.test.mjs` son tautológicas (`typeof === "object"`) justo sobre la lógica de umbrales del gate de material — un test que pasa siempre sobre la lógica que decide si hay metal suficiente para imprimir.

---

## 10. Hallazgos nuevos surgidos de la verificación

Todos comprobados por el orquestador antes de aceptarse.

| Sev. | Hallazgo | Evidencia | Consecuencia |
|---|---|---|---|
| 🟠 | **`tests/smoke/` no se ejecuta en CI** | `ci.yml:27,42` vs. `tests/smoke/`; `gate.sh:9` | Causa de que ARQ-1 llegara a main. Ver TST-1 |
| 🟡 | **`print.control` es un permiso muerto** | `hmi/permissions.js:31`; 0 usos fuera del catálogo; ningún `data-requires-permission` lo referencia | Arrancar/parar impresión no está gated ni en cliente ni por nivel en servidor |
| 🟡 | **Divergencia del "god implícito" cliente/servidor** | `hmi/permissions.js:92` concede todo al rol con `admin.users`; `app.py:866` no tiene ese bypass | El administrador ve los controles habilitados y recibe 403 al usarlos |
| 🟡 | **Colisión semántica de `inertedSystemActive`** | prePrintCheck (`!== false` = listo) vs. `notifications:942` (`Boolean()` = alarma) vs. default `false` vs. mock backend `True` | En la demo standalone el check "Inert atmosphere ready" queda **rojo permanente** y Start-print solo pasa por Override |
| 🟡 | **La matriz de admin muta los permisos en vivo antes de guardar** | `hmi/permissions.js:428` | Combinado con SEG-1 (PUT sin auth), habilita auto-escalado de dos clics |
| 🟡 | **`_public_permissions_doc` hace copia superficial** | `app.py:460-471`: solo sanea `users` | Cualquier secreto futuro en otra clave se serviría al navegador |
| 🟡 | **`GET /api/permissions/config` anónimo** | `app.py` | Expone el padrón completo de usuarios; el login tampoco tiene rate limiting |
| 🟡 | **`install.ps1` en la raíz es de un producto de terceros** | `install.ps1:1` — *"One-line installer for codebase-memory-mcp (Windows)"* | Parece parte del setup del HMI; un operador o contribuidor lo ejecutará |
| 🟡 | **`.gitignore:13` bajo la cabecera equivocada** | `dist/` listado entre "Python caches / build artifacts" | Causa raíz de ARQ-1 |

---

## 11. Lo que está bien

Esta sección existe para calibrar. Las fortalezas siguientes fueron **verificadas**, no asumidas, y varias son mejores que la media de la industria.

**Arquitectura**
- `hmi/ports/machineLink.js` es un puerto de libro de texto: fail-safe, y sin auto-retry **deliberadamente** (un reintento automático hacia una máquina que corta metal es una mala idea, y el código lo dice).
- Dirección de dependencias limpia y verificada: 0 imports `hmi`↔`viewer`; `viewer/sim` y `viewer/toolpath` son puros.
- El flujo de start-print es defensivo en cada eslabón.
- El proceso sostiene la partición: 53/53 commits vía PR, main protegido, gates que fallan de verdad.

**Código**
- 0 TODOs y 0 `console.log` en 30.000 LOC. `escapeHtml` en **todos** los sinks de `innerHTML`. Listeners guardados sin excepciones.
- Comentarios que explican el *porqué*, no el *qué*. Los tres `except: pass` del backend están razonados en comentario.
- El slicer gestiona sesiones **mejor que el viewer**: TTL, tope de 128 y lock.

**Seguridad** (todo verificado)
- Autorización server-side real con audit log JSONL y un test que cubre 401/403/200.
- Adaptador de máquina read-only por defecto con allowlist mínima — **la razón de que ningún hallazgo sea 🔴**.
- `postMessage` verifica el **emisor** (`event.source === contentWindow`), no solo el origen; el bridge de sensores exige mismo origen y rechaza el literal `"null"`.
- PBKDF2 correcto, con hash calculado también para usuarios inexistentes.
- CORS estrecho (solo `GET`, sin credenciales). Cero secretos en repo e historial. Cero path traversal. Loopback verificado.

**Rendimiento**
- Render on-demand real: cero draw calls en reposo, en ambas apps.
- Buffers tipados + `setDrawRange` en el toolpath: el coste por avance de progreso es ≈0. `dispose()` completo.
- Estructuras acotadas por todas partes; decisiones documentadas contra el modelo real de 7,5 M triángulos.

**Testing**
- Los tests existentes ejercen el código real: el smoke levanta servidores y rebana un cubo; los contratos del slicer comparan contra geometría calculada a mano.

---

## 12. Plan de remediación priorizado

**🚧 = bloqueante antes de conectar hardware real** (es decir, antes de ampliar `_FORWARDABLE` o poner `AVIS_MACHINE_READONLY=0`).

| # | Hallazgo | Acción | Esfuerzo | Criterio de "hecho" (verificable) |
|---|---|---|---|---|
| 1 | **ARQ-1** 🔴 | Negar la exclusión de `static/dist/` en `.gitignore` (o construir el bundle en el arranque del lanzador) y corregir `README:26`, `CONTRIBUTING:12,48` | 1 h | `git clone` en un directorio limpio + `Start-Viewer.bat` → `/urdf` carga y la escena se renderiza, **sin ejecutar `npm` a mano** |
| 2 | **TST-1** 🟠 | Cuarto job en `ci.yml`: `pytest tests/smoke` con ambos servidores | 2 h | Un PR que rompa el `data-app-entry` falla en CI. Verificable revirtiendo el fix #1 en una rama |
| 3 🚧 | **COD-1/SEG-1** 🟠 | Exigir sesión + permiso `admin.users` en `PUT /api/permissions/config` | 2 h | Test: `PUT` sin cookie → 401; con rol operator → 403; con rol God → 200. Y `PUT {}` no vacía el fichero |
| 4 🚧 | **COD-5** 🟠 | Los 7 predicados del pre-print check exigen `=== true`; clave ausente = fallo con motivo "señal no reportada"; dejar de fusionar el snapshot real con los nominales del mock | 4 h | Test: snapshot `{}` → los 7 checks en rojo. Snapshot parcial → solo las claves presentes pasan |
| 5 🚧 | **COD-2/SEG-2** 🟠 | Timestamp en `_sessions`, validación de TTL en `_operator_from_request`, `logout` que hace `pop`; aplicar `print.control` en los botones Start/Pause/Stop | 3 h | Test: sesión con timestamp vencido → 401. Tras `POST /api/auth/logout`, el mismo token → 401 |
| 6 🚧 | **ARQ-2 / SEG-3** 🟠 | Un permiso por familia (`machine.jog`, `machine.estop`, `machine.print`) derivado de `contract.json`; sembrarlos en el `permissions.json` por defecto | 6 h | Instalación limpia: un rol Support puede hacer JOG y **no** puede hacer ESTOP si no lo tiene marcado. `check_contract.mjs` valida la correspondencia |
| 7 | **COD-4** 🟠 | Unit tests de `machineState.js`: `canTransition`, `BASE_TRANSITIONS`, adopción del estado reportado | 1 h | `node --test` cubre las 3 funciones; mutar una arista de `BASE_TRANSITIONS` rompe un test |
| 8 | **ARQ-5** 🟠 | Reescribir `CONTRIBUTING.md` apuntando a `ci.yml`/`gate.sh`; corregir `CLAUDE.md:68,119` | 2 h | Las 9 rutas resuelven (`node tools/check_imports.mjs` sobre las rutas citadas); ninguna frase afirma "no CI" ni "no build step" |
| 9 | **ARQ-3** 🟠 | Publicar en `release` un `contract-dom.json` con los 214 ids + `@typedef` de los objetos de dependencias | 6 h | El artefacto publicado incluye el manifiesto; `gate.sh` verifica que cada `getElementById` de `hmi/` esté declarado en él |
| 10 | **COD-3** 🟠 | Extraer un renderer único de tarjeta de spool en `materials.js` | 4 h | Los 24 bloques quedan en 1; añadir un campo nuevo exige 1 edición, no 6 |
| 11 | Varios 🟡 | Lote de higiene: `install.ps1` fuera de la raíz; unificar `inertedSystemActive`; bypass god en `app.py` o quitarlo del cliente; `_public_permissions_doc` con allowlist de claves; `machineLink.stop` sin sombrear; tokens CSS en `prePrintCheck`; rama muerta de `runStartPrintAction`; PIN muerto `7391` y `openAdvancedModePinModal` | 6 h | `git grep 7391` → 0; el check de atmósfera inerte pasa en la demo standalone; `eslint` limpio |
| 12 | REN-1/2/5, COD-8, SEG-9 | Cachear `toLocaleTimeString` (18×), acotar concurrencia de thumbnails, memo-guards del RAF, `logging` en el backend, `pip-audit`+`npm audit` en CI, deduplicar Three.js | 6 h | Perfil sin escrituras de DOM redundantes por frame; CI falla ante una CVE alta; una sola copia de Three.js |

**Los cinco elementos marcados 🚧 (#3, #4, #5, #6) más #1 son la lista de precondiciones para tocar hardware.** El sistema hoy es seguro porque el adaptador no reenvía nada; ése es el único fail-safe real que existe, y desaparece en cuanto alguien cambie una variable de entorno.

---

## 13. Comparación con la evaluación anterior (2026-07-24)

### Hallazgos resueltos

| Anterior | Sev. | Estado hoy |
|---|---|---|
| **ARQ-1** — imports fantasma `sim/machineLink.js` / `sim/prePrintCheck.js`, el viewer no arrancaba | 🔴 | **Resuelto.** Los módulos existen (`hmi/ports/machineLink.js`, `hmi/prePrintCheck.js`) y hay un gate `check_imports.mjs` en CI |
| **ARQ-2** — god-file de 19.203 líneas, refactor diferido | 🔴 | **Resuelto en gran medida.** 19.890 → **13.092 líneas (−34%)**, 11 módulos extraídos con fronteras vigiladas. Degradado a 🟡 (COD-9) |
| **ARQ-3** — snapshots muertos `aslicer`/`avisualizer` | 🟠 | **Resuelto.** Eliminados; el cloud está documentado como dormante |
| **ARQ-4 / SEG-2** — `/api/auth/login` inexistente, PBKDF2 solo en la documentación | 🟠/🟡 | **Resuelto.** Login real con PBKDF2 (100k iter, `compare_digest`) |
| **COD-1** — motor de slicing sin ningún test real | 🟠 | **Resuelto.** 77 tests con el pipeline real y geometría calculada a mano |
| **COD-4** — 0% de cobertura JS sobre los módulos `sim/` puros | 🟠 | **Resuelto.** Suite `node:test` con 27 tests |
| **COD-3, COD-5, COD-6, COD-7** — código muerto testeado, nombre engañoso, handlers `message` inconsistentes, capas contiguas | 🟡 | **Resueltos** |
| **SEG-4/ARQ-7** — `CORS allow_origins=["*"]` | 🟡 | **Resuelto.** CORS estrecho, solo `GET`, sin credenciales |
| **SEG-6** — `POST /api/load` sin límite de tamaño | 🟡 | **Resuelto** |
| **REN-1** — `/api/load` síncrono en el event loop | 🟡 | **Resuelto.** Endpoints síncronos al threadpool |

**Balance: los dos 🔴 y los cuatro 🟠 de la evaluación anterior están cerrados o degradados.** Es un cierre de deuda notable para 26 días de vida del repositorio.

### Hallazgos persistentes

| Anterior | Hoy | Nota |
|---|---|---|
| SEG-1 — gating de motion 100% client-side sin contraparte server-side | **Parcialmente resuelto y parcialmente persistente** | Ya existe autorización server-side real con auditoría (mejora sustancial), pero es un solo bit para todos los comandos (SEG-3) y el checklist de pre-impresión sigue siendo 100% cliente (SEG-5) |
| REN-2 — `_PARSED_DATA_CACHE` sin cota ni evicción | **Persiste**, degradado a 🟡 (REN-3) | No se abordó; el impacto se reevaluó a la baja |
| SEG-7 — credenciales por defecto en el cloud dormante | **Persiste**, fuera de ámbito | Sigue dormante |

### Hallazgos nuevos

**1 🔴** (ARQ-1, bundle no comiteado — **introducido en el propio periodo evaluado, en la fase C / PR #21**) y **9 🟠**: COD-1/SEG-1 (PUT sin auth), COD-2/SEG-2 (sesiones sin TTL), SEG-3 (autorización de un solo bit), ARQ-2 (vocabularios desconectados), ARQ-3 (artefacto no autocontenido), ARQ-5 (CONTRIBUTING roto), COD-3 (copy-paste en materials), COD-4 (costura a hardware sin test), COD-5 (gate de pre-impresión default-pass), TST-1 (smoke fuera de CI). Más los 9 🟡 de la §10.

**Observación importante sobre la comparabilidad**: buena parte de los 🟠 nuevos de seguridad no son regresiones. La evaluación anterior no podía verlos porque *no había qué ver*: sin `/api/auth/login`, sin sesiones, sin autorización server-side y con un frontend que no arrancaba, no existía superficie que auditar. Construir el sistema de autenticación creó a la vez la funcionalidad y sus defectos. Lo que sí es una regresión limpia y atribuible al periodo es **ARQ-1**.

### Delta por dimensión

| Dimensión | 24-jul | 06-ago | Δ | Causa |
|---|---|---|---|---|
| Arquitectura | 42 | **46** | **+4** | Se cerraron dos 🔴 (imports fantasma, god-file −34%) y llegaron cuatro 🟠 estructurales más un 🔴 nuevo (bundle no comiteado). El avance real queda casi anulado por el defecto que el propio periodo introdujo |
| Calidad de código | 64 | **62** | **−2** | Prácticamente plano. La modularización y la higiene (0 TODOs, 0 `console.log`, `escapeHtml` universal) compensan pero no superan cinco 🟠 nuevos que antes no eran visibles porque el frontend no arrancaba |
| Seguridad | 70 | **58** | **−12** | No es una regresión de código: es el precio de tener por fin superficie real. Se ganó autorización server-side con auditoría y se descubrieron tres 🟠 confirmados empíricamente, el peor un `PUT` sin autenticación que vacía el almacén de credenciales |
| Rendimiento | 78 | **84** | **+6** | Ningún 🟠 sobrevivió a la verificación: REN-1 se midió y resultó ser 0,12 ms/frame en el camino común. Se confirmó render on-demand real en ambas apps |
| Mantenibilidad | 48 | **54** | **+6** | God-file −34%, bus factor 1→2, main protegido con 3 checks y `gate.sh` de 6 puertas, `AGENTS.md`. Frenado por ARQ-1 (clon fresco muerto) y por un `CONTRIBUTING.md` que desinforma sobre la existencia de CI |
| Escalabilidad | 58 | **68** | **+10** | Mayor subida: partición con gates, contrato host-owned, puerto de máquina limpio, y la fuga de memoria de la evaluación anterior reevaluada a 🟡 |
| Testing | 42 | **56** | **+14** | El motor de slicing pasó de 0 tests a 77 sobre el pipeline real; hay suite JS (27) y test de auth+auditoría. Frenado por el descubrimiento de que la suite de smoke no corre en CI |
| **Global** | **56** | **57** | **+1** | 14 PRs de trabajo estructural real, consumidos íntegramente por un 🔴 de proceso y por los defectos de un sistema de seguridad recién construido |

No se recalibró la rúbrica entre evaluaciones (§6 de la rúbrica): las bandas, los rangos de descuento, los pesos y la regla de capado son idénticos. Todo cambio de nota procede del código.

---

## Apéndice A. Aritmética de puntuaciones

**Rúbrica aplicada** (`evaluacion-severidad`, sin modificaciones respecto de la evaluación anterior):

- Bandas: Excelente 90-100 · Buena 75-89 · Aceptable 60-74 · Deficiente 40-59 · Crítica 0-39.
- Descuentos: 🔴 confirmado −8 a −15 (**capa la dimensión a ≤59**) · 🟠 confirmado −3 a −6 · 🟡 no restan individualmente, acumulación >10 resta hasta −5 · refutados no puntúan.
- Pesos globales: Seguridad 25% · Arquitectura 20% · Código 20% · Mantenibilidad 15% · Escalabilidad 10% · Testing 10%. **Rendimiento no pondera.**
- Capado global: si Seguridad < 40 **o** (Arquitectura **y** Código ambas < 50), la global no puede superar 55.

**Política de dimensión primaria/secundaria** (declarada aquí para que el cálculo sea reproducible): cada hallazgo aplica su descuento **completo** en su dimensión primaria y, cuando el coste en otra dimensión es real y distinto, **la mitad redondeada hacia abajo** en una única dimensión secundaria. Ningún hallazgo se descuenta en tres dimensiones.

### Arquitectura

| Concepto | Valor |
|---|---|
| Base cualitativa: **Aceptable, techo de banda** — dirección de dependencias limpia y verificada, puerto `machineLink` correcto, partición sostenida por gates. No llega a Buena porque el god-file de 13.092 líneas sigue siendo el centro de gravedad y la costura `hmi`↔god-file es ancha | **74** |
| ARQ-1 🔴 (primaria) — alcance total: un clon fresco no arranca | −12 |
| ARQ-2 🟠 (primaria) — camino de comandos muerto en instalación limpia | −5 |
| ARQ-3 🟠 (primaria) — artefacto de release inservible para el consumidor | −5 |
| ARQ-5 🟠 (secundaria; primaria en Mantenibilidad, −4) | −2 |
| SEG-3 🟠 (secundaria; primaria en Seguridad, −4) | −2 |
| Acumulación 🟡: ARQ-4, ARQ-6, ARQ-7, ARQ-8, ARQ-9, ARQ-10, ARQ-11, ARQ-12, `print.control`, divergencia god, `inertedSystemActive`, `install.ps1` = **12 > 10** | −2 |
| **Total** | 74 − 28 = **46** |
| Capado 🔴 (≤59) | Aplica; 46 ya está por debajo |

### Calidad de código

| Concepto | Valor |
|---|---|
| Base cualitativa: **Buena, banda media-baja** — la higiene se verificó y es superior a la media (0 TODOs y 0 `console.log` en 30k LOC, `escapeHtml` en todos los sinks, listeners guardados, comentarios de *porqué*, tests de comportamiento real, slicer con TTL+lock). La base refleja el código tal como se lee; los defectos concretos se restan abajo para no contarlos dos veces | **84** |
| COD-5 🟠 (primaria) — 7/7 predicados default-pass en un gate de seguridad, y el fondo verificado es peor que lo reclamado: límite alto del rango | −6 |
| COD-3 🟠 (primaria) — 24 bloques duplicados, 6-7 ediciones sincronizadas por campo | −5 |
| COD-1/SEG-1 🟠 (secundaria; primaria en Seguridad, −6) — omisión de `Depends()` como defecto de código | −3 |
| COD-2/SEG-2 🟠 (secundaria; primaria en Seguridad, −5) — TTL declarado y no implementado | −2 |
| COD-4 🟠 (secundaria; primaria en Testing, −6) | −3 |
| Acumulación 🟡: COD-6, COD-7, COD-8, COD-9, COD-10, `print.control`, divergencia god, `inertedSystemActive`, matriz en vivo, copia superficial, `install.ps1` = **11 > 10** | −3 |
| **Total** | 84 − 22 = **62** |
| Capado | No aplica (sin 🔴 en la dimensión) |

*Nota de discrepancia con el revisor*: el revisor de código propuso 74. Ese número implicaría una base ≈95 (banda Excelente), incompatible con un god-file de 13k líneas y 24 bloques copy-paste. Además, la verificación **agravó** COD-5 y **no degradó ninguno** de los cinco 🟠 de esta dimensión, así que la nota no podía subir respecto de su propuesta.

### Seguridad

| Concepto | Valor |
|---|---|
| Base cualitativa: **Buena, banda baja** — autorización server-side real con auditoría JSONL y test, adaptador read-only por defecto con allowlist mínima, `postMessage` con verificación de emisor, PBKDF2 correcto sin oráculo de temporización, escapado universal, CORS estrecho, 0 secretos, 0 path traversal, loopback verificado | **78** |
| SEG-1/COD-1 🟠 (primaria) — `PUT` sin auth, reproducido: wipe del almacén + auto-escalado. Límite alto del rango | −6 |
| SEG-2/COD-2 🟠 (primaria) — sesiones sin TTL ni revocación, con `print.control` sin aplicar como agravante | −5 |
| SEG-3 🟠 (primaria) — un permiso para todos los comandos. Límite medio: 2 de sus 3 sub-afirmaciones se atenuaron en verificación | −4 |
| COD-5 🟠 (secundaria; primaria en Código, −6) — gate de seguridad default-pass | −3 |
| Acumulación 🟡: SEG-4, SEG-5, SEG-6, SEG-7, SEG-8, SEG-9, SEG-10, `print.control`, divergencia god, matriz en vivo, copia superficial, `GET` anónimo = **12 > 10** | −2 |
| **Total** | 78 − 20 = **58** |
| Capado | No aplica (ningún 🔴; el adaptador read-only impide que los 🟠 escalen hoy) |

### Rendimiento *(no pondera en la global)*

| Concepto | Valor |
|---|---|
| Base cualitativa: **Buena** — render on-demand real (0 draws en reposo) en ambas apps, calidad adaptativa con histéresis, buffers tipados + `setDrawRange`, `dispose()` completo, estructuras acotadas, backend sano. No llega a Excelente por el desperdicio medido en el bucle de RAF | **84** |
| 🟠 confirmados | **0** (REN-1 se midió y bajó a 🟡) |
| Acumulación 🟡: REN-1..REN-6 = **6 ≤ 10** → la rúbrica no permite descuento | −0 |
| **Total** | **84** |

### Mantenibilidad

| Concepto | Valor |
|---|---|
| Base cualitativa: **Aceptable, techo de banda** — infraestructura de proceso construida en el periodo (CI con 3 checks, main protegido, 53/53 commits vía PR, 4 gates + eslint + build, `gate.sh` de 6 puertas, canal `release`, `AGENTS.md`), god-file −34% con 11 módulos, bus factor 1→2, deuda declarada cero, `CLAUDE.md`/`ARCHITECTURE.md` al día | **74** |
| ARQ-1 🔴 (secundaria; primaria en Arquitectura, −12) — un clon fresco no arranca: el peor resultado posible para mantenibilidad | −6 |
| ARQ-5 🟠 (primaria) — `CONTRIBUTING.md` con 9 rutas rotas y desinformación activa sobre la existencia de CI | −4 |
| TST-1 🟠 (secundaria; primaria en Testing, −8) — el gate que faltaba | −4 |
| ARQ-2 🟠 (secundaria) | −2 |
| COD-3 🟠 (secundaria) — 6-7 ediciones sincronizadas sin red de tests | −2 |
| Acumulación 🟡: ARQ-8, ARQ-9, ARQ-10, ARQ-12, COD-7, COD-8, COD-9, COD-10, `install.ps1`, `.gitignore:13`, 214 ids sin `@typedef` = **11 > 10** | −2 |
| **Total** | 74 − 20 = **54** |
| Capado 🔴 | ARQ-1 es 🔴 y afecta a esta dimensión → cap ≤59; 54 ya está por debajo |

### Escalabilidad

| Concepto | Valor |
|---|---|
| Base cualitativa: **Aceptable, techo de banda** — las tres piezas para crecer están puestas y verificadas (dependencias limpias, contrato host-owned con gate, puerto de máquina), y el runtime tiene holgura de sobra para el caso de uso | **72** |
| ARQ-3 🟠 (secundaria; primaria en Arquitectura, −5) — el artefacto no autocontenido bloquea al consumidor C# externo | −2 |
| ARQ-2 🟠 (secundaria) — la fragmentación del vocabulario de autorización bloquea el siguiente paso del producto (hardware real) | −2 |
| Acumulación 🟡: ARQ-6, ARQ-8, ARQ-9, REN-2, REN-3, REN-6 = **6 ≤ 10** | −0 |
| **Total** | 72 − 4 = **68** |
| Capado | No aplica |

### Testing

| Concepto | Valor |
|---|---|
| Base cualitativa: **Aceptable** — los tests que existen ejercen código real (smoke con servidores levantados rebanando un cubo; contratos del slicer contra geometría calculada a mano; auth con 401/403/200 + verificación de la línea de auditoría). La base ya incorpora el ratio 0,06 y el 0% de cobertura DOM/Three sobre ~29k LOC, que es la razón de no puntuar más alto | **70** |
| TST-1 🟠 (primaria) — 8 journeys de operador fuera de CI, y es la causa directa de que un 🔴 llegara a main. Límite alto del rango | −8 |
| COD-4 🟠 (primaria) — la máquina de estados de hardware, explícitamente diseñada para ser testeable, sin un solo test | −6 |
| Acumulación 🟡: COD-10 y poco más en esta dimensión = **≤10** | −0 |
| **Total** | 70 − 14 = **56** |
| Capado | No aplica |

### Global ponderada

```
Seguridad     58 × 0,25 = 14,50
Arquitectura  46 × 0,20 =  9,20
Código        62 × 0,20 = 12,40
Mantenibilid. 54 × 0,15 =  8,10
Escalabilidad 68 × 0,10 =  6,80
Testing       56 × 0,10 =  5,60
                        --------
                          56,60  →  57/100
```

**Comprobación del capado global**: Seguridad = 58 ≥ 40 (no aplica). Arquitectura = 46 < 50, pero Código = 62 ≥ 50, así que la condición conjunta no se cumple. **No se aplica capado global.** La nota queda en **57/100**, banda Deficiente al borde de Aceptable — a un punto de la evaluación anterior.

---

## Apéndice B. Hallazgos refutados o degradados en la verificación

Se listan para dejar constancia de que la verificación adversarial hizo su trabajo en ambas direcciones. Nada de esto puntúa ni aparece como hallazgo en el cuerpo del informe.

| Reclamación del revisor | Veredicto |
|---|---|
| ARQ-5: `CLAUDE.md` tiene rutas rotas de la fase C | **Refutada.** Sí se actualizó; 15 de 16 rutas resuelven y ninguna de las tres rutas reclamadas aparece en el fichero |
| ARQ-4: "todas las escrituras a los `export let` son solo convención, sin gate" | **Refutada.** Los `export let` importados son read-only por especificación del lenguaje (reproducido: `TypeError: Assignment to constant variable`) y no hay mutaciones externas del objeto mutable |
| ARQ-4: la costura expone 56 símbolos | **Corregida.** `materials.js` exporta 56, pero el god-file **importa 23** |
| ARQ-3: el artefacto de release no es autocontenido en imports | **Corregida a favor del código.** Sí lo es (0 imports fuera de `hmi/`+`viewer/` salvo el bare `three`); el fallo es que carga y no hace nada, en silencio |
| COD-2: las sesiones crecen sin cota | **Refutada.** ~100 B por login en un kiosko es irrelevante |
| SEG-3(b): los args sin validar llegan a la máquina | **Refutada.** El mock los ignora y el adaptador real nunca los transmite (`machine_controlservice.py:391`) |
| SEG-3(c): `emergencyStop` es una función de seguridad rota | **Degradada.** El 401 es real, pero no hay botón de E-stop en la UI ni llamadores de `MeltioMachine.emergencyStop()`: es incumplimiento de contrato latente |
| SEG-4: tras el auto-sign-out un 401 impide la parada automática | **Mecanismo refutado.** No hay 401, precisamente porque la cookie sigue válida (SEG-2). Y el operador no queda a ciegas: simulación pausada + aviso + notificación de prioridad 95. Degradado a 🟡 |
| SEG-5: el override no deja registro server-side | **Refutada.** Hay identidad server-side, autorización por rol y audit log; falsificar `sessionStorage` no hace que el servidor acepte un comando. Sobrevive solo que el flag `overridden` no viaja en el payload. Degradado a 🟡 |
| COD-5: "un snapshot vacío pinta el checklist en verde" | **Escenario literal refutado** (el default `getSignals: () => ({})` es código muerto), **pero el fondo resultó peor**: el merge con los valores nominales del mock produce el mismo efecto con una máquina real que reporte un snapshot parcial |
| REN-1: `getStats()` a 60 fps es un coste 🟠 | **Degradada tras medición.** 0,04–0,2 ms incluso a 100k segmentos; caso común ≈0,12 ms/frame (0,7% del presupuesto). Solo el caso con simulación térmica grande llega a ≈2,7 ms |
| COD-3: 84 `getElementById`, 3 superficies duplicadas | **Conteos corregidos.** 81 `getElementById`, 24 bloques idénticos, el texto se construye 2 veces (no 3), Assign/Unload duplican 2× (no 3×) |
