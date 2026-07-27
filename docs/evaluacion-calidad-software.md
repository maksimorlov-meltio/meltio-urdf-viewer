# Evaluación de calidad de software

> Fecha: 2026-07-24 · Proyecto: Meltio WebUI (HMI operador M600-PRO — `avisualizer` + `meltio-platform`) · Modo: profunda (detección + 4 revisores + verificación adversarial) · Evaluación anterior: ninguna

> ⚠️ **Este informe es la LÍNEA BASE previa a las correcciones.** Describe el
> estado del código en la fecha indicada. Una PR de remediación posterior aborda
> los hallazgos siguientes, por lo que su descripción aquí ya **no** refleja el
> código actual:
> - **ARQ-1** (🔴) — resuelto: se crearon `sim/machineLink.js` y
>   `sim/prePrintCheck.js` y un gate `tools/check_imports.mjs`; el viewer arranca.
> - **ARQ-2** (🔴 god-file) — **NO** abordado (refactor diferido); sí se inició la
>   red de tests JS (`tests/js/`) que lo hará seguro.
> - **ARQ-3** (🟠) — resuelto: eliminados los snapshots muertos `aslicer`/
>   `avisualizer` y documentado el cloud dormante.
> - **ARQ-4 / SEG-2** (🟠/🟡) — resuelto: `POST /api/auth/login` real (PBKDF2).
> - **COD-1 / COD-4 / COD-7** — resuelto: tests de contrato del motor de slicing
>   y de los módulos `sim/` puros.
> - **SEG-1** (🟠) — mitigado y documentado como precondición (guard de rol en
>   firmware) antes de conectar `?machine=1`; sin backend de máquina no se cierra aquí.
> - **SEG-4/ARQ-7, SEG-6, REN-1, REN-2, COD-3, COD-5** — resueltos (CORS acotado,
>   límite de subida + `/api/load` no bloqueante, caché acotada, código muerto).
> - **Diferidos**: ARQ-2 (refactor), REN-3/REN-4, SEG-7 (cloud dormante).

## 1. Resumen ejecutivo

El proyecto es un HMI de kiosk local (Windows, loopback, sin exposición a internet) compuesto por dos aplicaciones FastAPI + Three.js independientes acopladas en tiempo de ejecución. La evaluación encuentra una historia de dos velocidades: el **backend Python está bien diseñado** (validación exhaustiva, errores consistentes, separación pipeline/servicios) y la **frontera viewer↔slicer está correctamente pensada** (postMessage con verificación de origen, resolución de rutas con lista blanca), pero el **frontend no arranca tal como está** — un import estático a dos módulos inexistentes (`sim/machineLink.js`, `sim/prePrintCheck.js`) rompe el grafo de módulos ES completo — y descansa sobre un god-file de ~19.200 líneas sin un solo test. La lógica físicamente crítica (el motor de slicing que calcula la deposición de metal) tiene cero cobertura real. En su modelo de amenaza actual (operador físico de confianza, sin red pública), la seguridad es aceptable, pero existe una deuda latente que se convertirá en crítica el día que se conecte el transporte a la máquina real sin antes blindar el backend. Hay señales claras (aunque no concluyentes en todo el árbol) de código generado o volcado con poca supervisión: documentación que describe funcionalidad inexistente, imports fantasma, y un historial de 7 commits en 11 días de un solo autor con ~1.300 líneas por commit.

**¿Es mantenible?** No en su estado actual: bus factor 1, sin build/linter, god-file de 19k líneas, código muerto conviviendo con el activo.
**¿Es escalable?** En runtime sí para su caso de uso real (1 operador, sesiones acotadas); en coste de evolución del código, no.
**¿Es seguro en su modelo de despliegue?** Sí, de forma condicional: aceptable como kiosk aislado, pero el gating de comandos peligrosos es 100% client-side y no debe conectarse a hardware real sin corregirlo antes.
**¿Muestra indicios de generación por IA?** Sí, con consecuencias concretas (imports que apuntan a nada, documentación que promete funciones no implementadas).

| Dimensión | Puntuación | Estado | Δ vs. anterior |
|---|---|---|---|
| Arquitectura | 42/100 | 🔴 | — |
| Calidad de código | 64/100 | 🟡 | — |
| Seguridad | 70/100 | 🟡 | — |
| Rendimiento | 78/100 | 🟢 | — |
| Mantenibilidad | 48/100 | 🔴 | — |
| Escalabilidad | 58/100 | 🔴 | — |
| Testing | 42/100 | 🔴 | — |
| **Global (ponderada)** | **56/100** | 🔴 | — |

*(Rendimiento se evalúa en modo profunda pero no pondera en la nota global, ver rúbrica §5. Umbrales de estado: 🟢 ≥75, 🟡 60-74, 🔴 <60.)*

## 2. Contexto tecnológico

- **Stack**: Viewer (`avisualizer`, FastAPI + Three.js, puerto 8090, `.venv` Py 3.11) y Slicer (`meltio-platform` / import `meltio_platform`, FastAPI + Three.js, puerto 8765, `venv311` Py 3.11), acoplados solo por HTTP (proxy same-origin) y `postMessage`. Sin build step JS, sin linter, sin CI.
- **Módulos clave**: `urdf_viewer.js` (~19.203 líneas, monolito de UI/escena/jog/print), `sim/*.js` (módulos puros: `printSimulation.js`, `toolpathModel.js`, `simState.js`, `toolpathTubes.js`, `slicerClient.js`), backend viewer inline en `create_app` + `web/services/`, y en el slicer un pipeline puro en `slicer/core/` (`mesh_loader → transforms → slicer → support → profile_toolpath → machine → gcode`).
- **Árboles muertos/dormidos**: `_slicer_branch/projects/aslicer` (54 ficheros, fork divergente muerto), `_slicer_branch/projects/avisualizer` (33 ficheros, snapshot muerto), y el producto cloud completo bajo `meltio_platform/web` (Postgres/S3/render-service/React) que **no arranca** en el HMI local (el lanzador invoca `meltio_platform.slicer.web.app`, no `meltio_platform.web.app`).
- **Métricas**: Python activo ≈9.984 LOC, JS propio ≈28.711 LOC, CSS ≈13.166 LOC. Ratio test/código ≈0,19. Cobertura JS: 0%. Historial: 7 commits / 11 días / 1 autor / media ≈1.300 líneas por commit.
- **Cobertura de esta evaluación**: el backend Python se leyó en profundidad (ambos `web/app.py`, `slicer/core/*`, `services/*`). Los god-files JS (`urdf_viewer.js` ~19k líneas, slicer `app.js` ~5k) se muestrearon por zonas — no se leyeron línea a línea. El shell cloud dormante y el frontend React quedaron **fuera de ámbito** por no ejecutarse en el HMI local. Verificación adversarial de los hallazgos: 9 confirmados, 4 ajustados a la baja, 0 refutados, 0 no verificables.

## 3. Evaluación de arquitectura

La frontera entre viewer y slicer está bien pensada: comunicación exclusivamente por HTTP proxy same-origin y `postMessage` tipado (`dock-ready` / `slice-data` / `start-print`), y el pipeline de slicing sigue una separación de etapas puras (`mesh_loader → transforms → slicer → support → profile_toolpath → machine → gcode`) que es un buen patrón a replicar en el resto del código. Sin embargo, dos hallazgos críticos y dos importantes lastran la nota:

- **ARQ-1** (🔴 Confirmado, confianza alta) — `urdf_viewer.js:10-11` importa estáticamente `./sim/machineLink.js` y `./sim/prePrintCheck.js`, que **no existen en disco ni en git**. El módulo se carga vía `<script type="module">` (`urdf.html:1390`); el importmap solo remapea `three`/`three-addons`, no estos paths. El 404 de resolución de módulo rompe todo el grafo ES → **el viewer no arranca**: escena, jog, carga de ficheros e impresión quedan inertes. Usos adicionales en líneas 9062, 9119, 9255, 19189. *Fix*: restaurar o crear los módulos faltantes, o eliminar los imports y sus usos a la vez; añadir un gate de resolución de imports al flujo (`node --check` no lo detecta).
- **ARQ-2** (🔴 Confirmado, confianza alta) — God-file `urdf_viewer.js`: 19.203 líneas, 591 funciones de nivel superior, 838 declaraciones `let`/`const` a nivel de módulo, 383 `getElementById`, 3 listeners `message` separados, 0 exports. Estado global mutable en scope plano. El coste de cualquier cambio es altísimo, y combinado con ARQ-1 una sola arista rota anula el 100% de la funcionalidad. *Fix*: descomponer por dominio en módulos ES siguiendo el patrón ya existente en `sim/`.
- **ARQ-3** (🟠 Confirmado) — Código muerto y shell cloud dormante conviviendo en el árbol activo: `_slicer_branch/projects/aslicer` (54 ficheros) y `_slicer_branch/projects/avisualizer` (33 ficheros) son snapshots muertos; el shell `meltio_platform/web` (Postgres/S3/admin) y el frontend React no arrancan en local. Hay **dos árboles `avisualizer`**, lo que confunde cualquier búsqueda o grep. *Fix*: sacar los snapshots del árbol de build; documentar explícitamente el cloud como dormante.
- **ARQ-4** (🟠 Confirmado) — `permissions.js:21` define `LOGIN_API="/api/auth/login"` y hace `POST` (línea 314), pero esa ruta **no existe** en el backend del viewer (`web/app.py` solo expone `GET`/`PUT /api/permissions/config`); tampoco hay tabla de usuarios ni PBKDF2. El login siempre devuelve 404 → la elevación de rol está rota de origen. *Fix*: implementar/proxyear `/api/auth/login` y alinear la documentación, o recortar el flujo a lo realmente soportado.
- **ARQ-5** (🟡, mismo defecto que SEG-1) — Los permisos que gatean movimiento no tienen contraparte de validación en backend. Ver SEG-1 en §5.
- **ARQ-6** (🟡, mismo defecto que COD-6) — Trust inconsistente entre los handlers `message`. Ver COD-6 en §4.

## 4. Evaluación de código

El backend Python es de calidad **Excelente** (5/5): idiomático, con validación exhaustiva y manejo de errores consistente. El frontend arrastra la nota general por el god-file y por vacíos de testing:

- **COD-1** (🟠 Confirmado) — El motor de slicing desplegado (`meltio_platform.slicer.core`, ~130 KB, más `config.py`/`profile.py` — la física de deposición) **no tiene ningún test**. El único test que lo roza (`tests/test_slices.py`) stubea el slicing con G-code prefabricado y delega en "la suite de tests de aslicer" — pero `aslicer` es un **fork divergente** (`gcode.py` difiere 195 líneas, `machine.py` 68, `profile_toolpath.py` 78): ni portar sus tests validaría el código real. `feed_length_for_path`, `build_machine_program`, `program_to_gcode`, `_layer_heights` sin cobertura. *Escenario*: una regresión en conservación de volumen/altura de capa produce G-code con E/Z erróneos → cordón mal depositado en metal, sin ningún test que lo detecte. *Fix*: tests de contrato sobre `slice_mesh`, feed/bead y un golden G-code de una pieza mínima.
- **COD-4** (🟠 Confirmado) — Cero tests sobre `sim/*.js` (`printSimulation.js` 804 LOC, `toolpathModel.js`, `simState.js`, `toolpathTubes.js`, `slicerClient.js`), módulos puros que dirigen la animación del robot y que están explícitamente comentados como "unit-testable in isolation". No existe suite JS. *Fix*: runner mínimo (`node:test`) sobre `toolpathModel`/`simState`, que ya son puros.
- **COD-3** (🟡 Ajustado desde 🟠) — `_reservoir_sample_points` (`sensor_pointcloud.py:189-229`) es código muerto (no invocado en `src/`) pero tiene 3 tests dedicados (cobertura de fachada) y usa `random.randint` global ignorando `random_seed`. Impacto bajo: nunca se ejecuta en producción. *Fix*: eliminar la función y sus tests.
- **COD-5** (🟡) — `_aggregate_voxels_open3d` está mal nombrado: es NumPy puro, sin `open3d`. Fricción de comprensión menor.
- **COD-6** (🟡 Confirmado) — Trust inconsistente entre los 3 handlers `message` de `urdf_viewer.js` (líneas 8380 y 9404 validan `event.source===contentWindow`; línea 15880 valida `event.origin`). Incoherencia de mantenibilidad, no vulnerabilidad activa. *Fix*: unificar en un único dispatcher.
- **COD-7** (🟡) — `toolpathModel.js` asume, sin defenderlo, que las capas son contiguas.

Estado real de los tests: ratio test/código ≈0,19; **0% de cobertura JS**. La cobertura existente en Python protege en parte código muerto (COD-3) y stubea el motor de slicing en vez de probarlo (COD-1).

## 5. Evaluación de seguridad

**Modelo de amenaza asumido**: kiosk Windows en loopback (127.0.0.1), operador físico de confianza, Chromium fullscreen, sin exposición a internet. Contra este modelo, ningún hallazgo alcanzó severidad 🔴 tras la verificación adversarial — todos quedaron en 🟡, con una excepción de deuda latente (SEG-1) que sí se marca como riesgo de escalada.

- **SEG-1** (🟡 Ajustado desde 🟠) — El gating de acciones físicamente peligrosas (motion/láser/feeder/E-stop) es **100% client-side** en `permissions.js` (`setControlDenied` pone `disabled`/`tabindex` sobre `[data-requires-permission]`), reversible desde la consola del navegador; el backend **no valida rol** y lo declara explícitamente (`web/app.py:316`, "not a security boundary"). Hoy es inerte porque el transporte a la máquina no existe (ver ARQ-1). **Escalaría a 🔴** en cuanto se conecte `?machine=1` a hardware real. *Fix*: guard de rol en firmware/controlador de la M600 antes de conectar el transporte — no confiar en `permissions.js`.
- **SEG-2** (🟡 Confirmado) — La cabecera de `permissions.js` afirma validación con "salted PBKDF2 hashes" contra una tabla de usuarios que no existe en el backend del viewer. Documentación engañosa; fail-closed, sin impacto explotable.
- **SEG-4 / ARQ-7** (🟡 Confirmado/Ajustado — mismo defecto, fusionado) — `CORS allow_origins=["*"]` en `web/app.py:294-299`. `allow_methods=["GET"]` bloquea la escritura cross-origin (el `PUT` de permisos), así que el vector real queda acotado a exfiltración read-only vía `GET` (STL propietario, sensores, roles) desde una página atacante en el navegador local o DNS-rebinding — improbable en un kiosk fullscreen. *Fix*: acotar `allow_origins` al origen del slicer.
- **SEG-6** (🟡 Confirmado) — `POST /api/load` del slicer no tiene límite de tamaño ni timeout → `trimesh.load_mesh` sobre un STL enorme o malformado agota CPU/RAM (DoS local autoinfligido por un operador de confianza). *Fix*: límite de body + timeout + slice aislado con presupuesto de memoria.
- **SEG-7** (🟡, no verificado — cloud dormante) — Credenciales por defecto `meltio:meltio` en `config.py` y autenticación por confianza de cabecera en `auth.py`. Nulo impacto en el HMI actual; solo relevante si se reactivara el producto cloud.

**Exposición de código/despliegue**: superficie de red limitada a loopback; no hay ingreso desde internet. **Dependencias**: no se identificaron vulnerabilidades de terceros dentro del alcance de esta evaluación (fuera de ámbito: auditoría de paquetes npm/pip).

**Rigor de la revisión (refutaciones)**: el revisor descartó explícitamente varias hipótesis de vulnerabilidad tras examinarlas, lo que se documenta en el Apéndice B como señal de que la revisión no sobreestimó riesgos.

## 6. Evaluación de rendimiento

El perfil general es **bueno**: calidad adaptativa por pixel-ratio, vectores *scratch* reutilizados, `dispose()` disciplinado en el ciclo de vida de la escena, y sesiones acotadas a 128 con TTL evitan degradación en ejecución prolongada del kiosk. Se confirmaron dos defectos acotados y dos de bajo impacto:

- **REN-2** (🟠 Confirmado) — `_PARSED_DATA_CACHE` (`sensor_pointcloud.py:51-52,111-154`) es un diccionario de módulo **sin cota ni evicción**; la clave incluye `st_mtime_ns`, así que cada nueva versión de `Sensors.csv` o atributo añade una entrada `float32` completa que nunca se libera → **crecimiento monótono de memoria** en un kiosk que corre 24/7. (La caché `.npz` en disco sí se sobrescribe; la fuga es solo en memoria del proceso.) *Fix*: LRU acotado o expulsar la versión previa por `(ruta, atributo)`.
- **REN-1** (🟡 Ajustado desde 🟠) — `/api/load` es el único `async def` del slicer y ejecuta `load_mesh` de forma síncrona en el event-loop (slice/simulate/gcode sí van a threadpool vía `def`). Contra el escenario real de single-operator es un *stall* transitorio autoinfligido durante una carga que el propio usuario está esperando. *Fix*: declararlo `def` o envolverlo en `run_in_threadpool`.
- **REN-3** (🟡) — Pico de memoria en buffers de *bead* (~0,77 KB/segmento) en toolpaths densos; no es una fuga, hay `dispose()` en el *teardown*.
- **REN-4** (🟡) — `Box3.setFromObject` se recalcula por frame en el fallback de *clip-plane* aunque la bbox local es invariante; cachearla al inicio evitaría trabajo redundante.

**Robustez en ejecución prolongada**: buena salvo por REN-2 (memoria del proceso backend), que en un despliegue 24/7 debería resolverse antes de considerarlo cerrado.

## 7. Señales de generación por IA

La evaluación combinada de los cuatro revisores identifica un patrón consistente de código generado o volcado con poca supervisión posterior:

- **Documentación que no corresponde a la implementación**: `permissions.js` describe validación PBKDF2 y una tabla de usuarios que no existen (SEG-2, ARQ-4).
- **Dependencias fantasma**: imports estáticos a `sim/machineLink.js` y `sim/prePrintCheck.js`, inexistentes en disco y en git (ARQ-1) — el patrón clásico de una IA que "recuerda" un módulo que en algún punto se le describió o generó pero nunca se persistió.
- **God object**: `urdf_viewer.js` de 19.203 líneas sin descomposición modular, típico de generación incremental sin refactor de por medio.
- **Duplicación arrastrada**: dos árboles `avisualizer` y un `aslicer` muerto conviviendo con el código activo (ARQ-3).
- **Densidad de docstrings uniforme y alta**: en el backend Python, de buena calidad (explican el *porqué*, no solo el *qué*) — aquí la señal no es la inutilidad sino la **uniformidad** estilística propia de generación asistida.
- **Test de demostración**: `tests/test_slices.py` stubea el slicing con G-code prefabricado y delega la validación real en una suite externa de un fork divergente (COD-1) — un test que aparenta cobertura sin ejercer el código real.
- **Helper muerto pero testeado**: `_reservoir_sample_points` (COD-3), código muerto acompañado de tests que sí se ejecutan — sugiere generación de función+test en paralelo sin verificar después si la función se usa.
- **Historial de commits**: 7 commits en 11 días, 1 autor, media ≈1.300 líneas por commit — compatible con volcado de código generado en bloques grandes más que con desarrollo incremental manual.

**Matiz honesto**: no todo el código muestra estas señales. La frontera `postMessage` (con verificación de `sender`) y la resolución de rutas STL (con lista blanca vía `Path(name).name`) están bien pensadas y correctamente implementadas — son código deliberado, no generado sin revisar.

**Consecuencia práctica**: estas señales no son un juicio de valor sobre el origen del código, sino una explicación plausible de por qué conviven partes excelentes (backend) con defectos de "libro de texto" de generación sin supervisión (imports a nada, doc que promete de más). El plan de mejora (§9) debe tratarlas como deuda técnica ordinaria, priorizada por impacto.

## 8. Comparación con la evaluación anterior

Primera evaluación; sin delta. No existe informe previo con el que emparejar hallazgos por fichero+descripción. Este informe queda como línea base para futuras evaluaciones.

## 9. Plan de mejora priorizado

| # | Prioridad | Acción | Hallazgos que resuelve | Impacto | Esfuerzo | Dimensión que mejora |
|---|---|---|---|---|---|---|
| 1 | Máxima | Restaurar o eliminar los imports colgantes de `sim/machineLink.js` y `sim/prePrintCheck.js` (crear los módulos o retirar imports+usos a la vez); añadir un chequeo de resolución de imports al flujo de trabajo (`node --check` no lo detecta) | ARQ-1 | Desbloquea el arranque completo del viewer (escena, jog, carga, impresión) | Bajo | Arquitectura, Mantenibilidad |
| 2 | Alta | Descomponer `urdf_viewer.js` por dominio en módulos ES, siguiendo el patrón ya existente de `sim/`, empezando por las zonas de menor estado compartido | ARQ-2, COD-6/ARQ-6 (se resuelve al unificar el dispatcher de `message` durante la descomposición) | Reduce drásticamente el coste de cambio y el bus factor 1 | Alto | Arquitectura, Mantenibilidad, Escalabilidad |
| 3 | Alta | Tests de contrato sobre el motor de slicing: `slice_mesh`, cálculo de feed/bead, y un golden G-code de una pieza mínima | COD-1 | Cierra el mayor riesgo real del proyecto: física de deposición sin red de seguridad | Medio | Calidad de código, Testing |
| 4 | Media | Antes de conectar `?machine=1` a hardware real: implementar guard de rol server-side/firmware para comandos peligrosos (motion/láser/feeder/E-stop); no confiar en `permissions.js` | SEG-1, ARQ-5 | Evita que una deuda hoy inerte se convierta en riesgo crítico de seguridad física | Bajo | Seguridad |
| 5 | Media | Sacar los snapshots muertos (`aslicer`, `avisualizer` duplicado) del árbol de build y documentar el cloud como dormante; acotar `CORS allow_origins` al origen del slicer; implementar o retirar `/api/auth/login` | ARQ-3, SEG-4/ARQ-7, ARQ-4, SEG-2 | Reduce confusión de mantenimiento y cierra vectores de exfiltración read-only innecesarios | Bajo | Arquitectura, Seguridad, Mantenibilidad |
| 6 | Baja | Acotar `_PARSED_DATA_CACHE` con LRU o expulsión por `(ruta, atributo)`; declarar `/api/load` como `def` (o `run_in_threadpool`) y añadir límite de tamaño de body + timeout | REN-2, REN-1, SEG-6 | Elimina crecimiento monótono de memoria y el stall autoinfligido en carga de STL | Bajo | Rendimiento, Escalabilidad |
| 7 | Media | Runner mínimo de test JS (`node:test`) sobre los módulos puros `sim/toolpathModel.js` y `sim/simState.js` | COD-4 | Cubre la lógica que dirige la animación del robot, hoy sin ninguna suite JS | Medio | Testing, Calidad de código |

*(Acciones de bajo esfuerzo adicionales, no priorizadas por separado: eliminar `_reservoir_sample_points` y sus tests — COD-3; renombrar `_aggregate_voxels_open3d` — COD-5; cachear `Box3.setFromObject` en el fallback clip-plane — REN-4; documentar el supuesto de capas contiguas o defenderlo con una validación — COD-7.)*

## 10. Conclusión

**No apto para producción / uso con hardware real en su estado actual.** El defecto ARQ-1 (imports colgantes) implica que el viewer, tal como está en el repositorio, no arranca — es un bloqueador absoluto, no una cuestión de calidad. Una vez resuelto (acción #1, esfuerzo bajo), el sistema es funcionalmente utilizable como kiosk aislado, pero **no debería conectarse `?machine=1` a la M600-PRO real** hasta que SEG-1 esté resuelto con un guard de rol server-side/firmware: hoy el bloqueo de comandos peligrosos es cosmético (client-side, reversible desde la consola).

Para mantenimiento a largo plazo, son condiciones no negociables:
1. Resolver ARQ-1 antes de cualquier despliegue.
2. Cerrar SEG-1 antes de conectar el transporte a hardware real.
3. Cubrir con tests de contrato el motor de slicing (COD-1) antes de confiar en él para piezas de producción — es la pieza con mayor coste de fallo silencioso de todo el sistema.
4. Iniciar la descomposición de `urdf_viewer.js` (ARQ-2) de forma incremental; el bus factor 1 y la ausencia de linter/CI hacen que cada nueva feature sobre el god-file actual encarezca el mantenimiento futuro de forma creciente.

El backend Python demuestra que el equipo (o el proceso de generación empleado) es capaz de producir código de calidad Excelente cuando hay estructura y revisión; el reto es extender ese mismo estándar al frontend y a la cobertura de pruebas.

## Apéndice A. Derivación de puntuaciones

Bandas por calificación (rúbrica §4): Excelente 90-100 · Buena 75-89 · Aceptable 60-74 · Deficiente 40-59 · Crítica 0-39. Descuentos: 🔴 confirmado −8 a −15 (capa la dimensión a ≤59) · 🟠 confirmado −3 a −6 · 🟡 no restan individualmente (acumulación >10 resta hasta −5, no alcanzada en ninguna dimensión).

| Dimensión | Calificación cualitativa | Base de partida | Descuentos aplicados (hallazgos confirmados) | Nota final | Capado |
|---|---|---|---|---|---|
| **Arquitectura** | Deficiente (capada por 2× 🔴) | 72 (frontera viewer↔slicer bien diseñada) | ARQ-1 🔴 −10; ARQ-2 🔴 −12; ARQ-3 🟠 −4; ARQ-4 🟠 −4 | **42** | Sí — 2 🔴 confirmados capan a ≤59; 42 ya está por debajo del cap |
| **Calidad de código** | Aceptable | 76 (backend Excelente, arrastrado por frontend) | COD-1 🟠 −6; COD-4 🟠 −6 | **64** | No aplica (sin 🔴 en esta dimensión) |
| **Seguridad** | Aceptable | 74 (techo de banda, ningún 🔴 tras verificación) | SEG-1 (ajustado 🟠→🟡, deuda latente) −2; acumulación 🟡 (SEG-2, SEG-4/ARQ-7, SEG-6) −2 | **70** | No aplica |
| **Rendimiento** *(no pondera en global)* | Buena | 84 | REN-2 🟠 −5; acumulación 🟡 (REN-1, REN-3, REN-4) −1 | **78** | No aplica |
| **Mantenibilidad** | Deficiente (capada por 2× 🔴 transversales) | 74 (servicios/pipeline separados en backend) | ARQ-1 🔴 −10 (gate inexistente para imports rotos); ARQ-2 🔴 −12 (god-file, bus factor 1); ARQ-3 🟠 −4 | **48** | Sí — 2 🔴 confirmados afectan mantenibilidad; 48 ya por debajo del cap |
| **Escalabilidad** | Aceptable-bajo (banda Deficiente por umbral) | 70 (runtime correcto: sesiones acotadas a 128 + TTL) | REN-2 🟠 −4 (fuga de memoria en proceso 24/7); coste de escalar el código por ARQ-2 −8 | **58** | No (sin 🔴 directo en escalabilidad; entra en banda Deficiente por umbral numérico) |
| **Testing** | Deficiente | 60 (ratio test/código ≈0,19, existe suite en Python) | COD-1 🟠 −10 (dominio físicamente crítico sin cobertura, descuento en el límite superior por criticidad); COD-4 🟠 −8 (0% JS sobre módulos ya puros y "unit-testable") | **42** | No aplica (sin 🔴 en testing) |

**Global ponderada** (rúbrica §5): Seguridad 25% · Arquitectura 20% · Código 20% · Mantenibilidad 15% · Escalabilidad 10% · Testing 10%.

```
70×0,25 + 42×0,20 + 64×0,20 + 48×0,15 + 58×0,10 + 42×0,10
= 17,5 + 8,4 + 12,8 + 7,2 + 5,8 + 4,2
= 55,9 ≈ 56
```

**Regla de capado global**: se aplicaría si Seguridad < 40 o (Arquitectura y Código ambas < 50). Seguridad = 70 (no aplica); Arquitectura = 42 < 50 pero Código = 64 ≥ 50, así que la condición conjunta no se cumple. **No se aplica capado global.** La nota queda en **56/100**, banda Deficiente al borde de Aceptable.

*Nota de conflicto entre revisores*: ninguno de los cuatro revisores contradijo a otro en los hallazgos confirmados; el verificador no encontró conflictos sin resolver. Los cuatro ajustes de severidad (SEG-1, SEG-4/ARQ-7, COD-3, REN-1) fueron degradaciones consistentes con el modelo de amenaza real del kiosk, no discrepancias entre revisores.

## Apéndice B. Hallazgos refutados / descartados

El verificador adversarial no refutó ningún hallazgo (0 refutados de 13 evaluados: 9 confirmados + 4 ajustados). Las siguientes hipótesis fueron descartadas directamente por los revisores de arquitectura/seguridad **antes** de llegar a verificación, tras examinarlas en detalle — se listan aquí como señal de rigor de la revisión, no como hallazgos del cuerpo del informe:

| Hipótesis descartada | Motivo del descarte |
|---|---|
| Path traversal en la resolución de rutas de STL | Mitigado por `Path(name).name` + lista blanca de extensiones/directorio |
| Origen de `postMessage` no validado | Sí se valida (`event.source===contentWindow` o `event.origin`, según el handler — ver COD-6 para la inconsistencia de *estilo*, que sí se mantiene como hallazgo menor) |
| SSRF en `/api/slice/proxy` | El destino es configuración del propio operador, no un input controlable por un atacante externo |
| Open-redirect en `/slicer` | El 307 redirige a una URL de configuración local, no a input de usuario |
