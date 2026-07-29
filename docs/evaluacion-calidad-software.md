# Evaluación de calidad de software

> Fecha: 2026-07-28 · Proyecto: Meltio WebUI (HMI web viewer M600-PRO, fork `rchacon83/meltio-webui`, rama `viewer/arq2-refactor`) · Modo: profunda (detección + 4 revisores incl. rendimiento + verificación adversarial) · Evaluación anterior: ninguna (línea base)

## 1. Resumen ejecutivo

El proyecto es una interfaz web de kiosco para el control y visualización de una impresora metálica industrial (Three.js + FastAPI, sin exposición pública). La base de código muestra dos velocidades muy distintas: un backend y una capa de seguridad **sólidos y conscientes de su modelo de amenaza**, y un frontend en pleno proceso de refactor (ARQ-2: extracción de un god-file de 10.804 líneas hacia factories ES `createXxx(ctx)`) que todavía arrastra la deuda estructural que motivó el refactor. La verificación adversarial confirmó 4 hallazgos y rebajó otros 4 desde su severidad inicial; **ningún hallazgo crítico (🔴) sobrevive** a la verificación, y no se refutó ninguno.

- **¿Es mantenible?** Parcialmente. El backend y los módulos ya extraídos son mantenibles; el god-file restante sigue acoplando estado y DOM (137 `let`, 377 `getElementById`, 40 setters de cierre), lo que encarece cualquier cambio que toque UI (shotgun surgery documentado en ARQ-1). El refactor tiene trayectoria clara (`ARCHITECTURE.md`, extracciones incrementales) pero aún no ha llegado al punto de inflexión.
- **¿Es escalable?** El grafo de imports ES es un DAG limpio (sin ciclos de módulo), lo cual es una base sana para seguir escalando la extracción; el cuello de botella real es el tamaño del núcleo aún no extraído, no la arquitectura de dependencias.
- **¿Es seguro en su modelo de despliegue?** Sí, con matices. Para un kiosco local sin TLS ni exposición pública, la postura es sólida (autenticación con hardening reciente, sin RCE, sin path traversal explotable, CORS acotado). El único riesgo con consecuencia física real (movimiento de máquina sin autenticación server-side, SEG-1) está mitigado hoy porque el enlace a la máquina real viene apagado por defecto, pero debe resolverse **antes** de activar esa función en producción.
- **¿Muestra indicios de generación por IA?** Sí, de forma consistente con un refactor asistido: comentarios densos mayoritariamente de calidad "por qué" (positivo), pero también boilerplate mecánico repetido (40 setters de cierre + 34 *thunks* de re-cableado) que es sintomático de la causa raíz arquitectónica (ARQ-1) más que un problema en sí mismo. No se detectaron catches vacíos sistemáticos ni código "solo camino feliz".

| Dimensión | Puntuación | Estado | Δ vs. anterior |
|---|---|---|---|
| Arquitectura | 60/100 | 🟡 | — |
| Calidad de código | 81/100 | 🟢 | — |
| Seguridad | 80/100 | 🟢 | — |
| Rendimiento (informativa, sin peso — ver nota) | 84/100 | 🟢 | — |
| Mantenibilidad | 65/100 | 🟡 | — |
| Escalabilidad | 65/100 | 🟡 | — |
| Testing | 60/100 | 🟡 | — |
| **Global (ponderada)** | **70/100** | 🟡 | — |

**Nota sobre Rendimiento:** el pipeline de rendimiento se ejecutó y arrojó resultados sólidos (84/100), pero al no formar parte de los pesos definidos por la rúbrica de esta evaluación se reporta como dimensión **informativa**, sin contribuir a la global. Sus hallazgos confirmados (REN-1) y menores (REN-2, REN-3) sí se documentan en la sección 6 y en el plan de mejora, y sus síntomas de fondo (falta de timeouts de red) se han tenido en cuenta cualitativamente al fijar Escalabilidad en 65 (no ha bajado la nota, pero tampoco la sube).

## 2. Contexto tecnológico

**Stack:** backend Python ≥3.10 con FastAPI (`app.py`, 866 LOC, y `sensor_pointcloud.py`, 422 LOC; 2 entornos virtuales, `pip`/`pyproject`, 3 dependencias directas); frontend JavaScript vanilla en ES-modules **sin build step**, con Three.js r164 vendorizado (WebGL). Despliegue: kiosco local con dos servidores Uvicorn (`127.0.0.1:8090` viewer, `:8765` slicer), Chromium en modo kiosco, sin TLS ni exposición pública. La conexión a la máquina real está apagada por defecto (requiere `?machine=1`).

**Estado del refactor (ARQ-2):** el frontend histórico era un único fichero `urdf_viewer.js` de 10.804 LOC; se han extraído ya los módulos `notifications`, `calendar`, `cloud/{cloudLibrary, cloudStl3D, cloudPrintSim}`, `materials/{spoolHighlight, wireDrum, feederMaterials}`, `slicer/slicerBridge`, `sim/{simState, slicerClient, toolpathModel, machineLink, prePrintCheck, printSimulation}`, `controllers/{viewCube, feederPreview, annotationManager}`, `core/viewerScene`, `kinematics/jointsCore` y `robot/transparency`, todos como factories `createXxx(ctx)`.

**Testing:** 5 ficheros pytest (auth, permisos, sensor, proxy de slicer, contrato de API) sólidos y no triviales; 6 ficheros `node --test` (`*.test.mjs`) que cubren únicamente módulos puros. El CI (`ci.yml`) solo ejecuta pytest — **los tests JS nunca corren en CI** (TST-1).

**Hotspots (tamaño × churn):** `urdf_viewer.js` (10.804 LOC, churn 14), `urdf.html` (churn 14, en lockstep con el anterior), `app.py` (866 LOC, churn 6), `feederMaterials.js` (2.171 LOC), `cloudStl3D.js` (1.625 LOC), `permissions.js` (499 LOC), `sensor_pointcloud.py` (422 LOC). Bus factor bajo (un autor dominante en el refactor actual), historial corto (20 commits en 17 días). Se observa hardening de seguridad reciente y bien acompañado de tests (login constante-en-tiempo + backoff, no fuga de detalle en 5xx).

**Cobertura de esta evaluación:** se examinaron en profundidad arquitectura (grafo de dependencias e imports, call-graph runtime, ctx de las factories), código (rutas críticas de parseo, guardado y sensor de nube de puntos), seguridad (autenticación, autorización, superficie de red, dependencias) y rendimiento (gestión de recursos GPU, timers, polling). No se realizó fuzzing ni pruebas de penetración externas; el análisis de seguridad asume el modelo de amenaza declarado (operador local, sin atacante remoto) y no evalúa el firmware de la máquina, que queda fuera del repositorio.

## 3. Evaluación de arquitectura

**Mapa de dependencias:** el grafo de *imports* ES es un **DAG limpio** — ninguna factory importa a otra en ciclo; los "ciclos" que existen son de *call-graph* en tiempo de ejecución, resueltos mediante 34 *thunks* sobre *handles* `let` adelantados. El god-file actúa como hub único que orquesta todo. La dirección de las dependencias es correcta y no hay señales de arquitectura en espagueti a nivel de módulos.

**Fortalezas:**
- `core/viewerScene.js` es una frontera de extracción ejemplar: constructor de 3 parámetros, `Object.freeze` en el objeto expuesto, comentarios que explican el *porqué* de las decisiones.
- `app.py` es cohesivo y consciente de seguridad desde su diseño.
- Los módulos puros ya extraídos están bien aislados y testeados.
- El refactor es incremental, deliberado y documentado (`ARCHITECTURE.md`), no un intento apresurado.

**Hallazgos confirmados/ajustados (priorizados por impacto en mantenibilidad):**

- **ARQ-1 — Ajustado 🔴→🟠 (confirmado).** La modularización actual es en gran medida sintáctica: el god-file conserva estado y DOM (137 `let`, 377 `getElementById`, 40 setters de cierre `(v) => { x = v }`); el ctx de `feederMaterials` acumula ~180 claves. Añadir un solo campo de UI típicamente obliga a tocar 3-4 ficheros (shotgun surgery), evidenciado por el churn en lockstep de `urdf.html` y `urdf_viewer.js`. La verificación confirmó las métricas (y corrigió al alza el conteo de `const`, real 1.473 frente a los 601 estimados inicialmente, es decir la magnitud del fichero estaba infravalorada). Se baja de 🔴 a 🟠 porque el escenario es de coste de mantenimiento real (impacto medio), no un bloqueo de desarrollo.
- **ARQ-2 — Confirmado 🟠.** Bug de re-cableado de estado en la extracción de `cloudStl3D`: `let printSim = null` (`urdf_viewer.js:33`) se pasa a `cloudStl3D` (creado en `:9581`, recibe la referencia en `:9587` cuando `printSim` aún es `null`); `printSim` se reasigna después (`:10585`), pero `cloudStl3D.js:15` lo captura como `const`, congelándolo en `null` para siempre. Consecuencia: el *guard* en `cloudStl3D.js:1347` sale siempre, `autoPreparePrintSimulationForSelection` (`:1407`) nunca ejecuta el pre-slice en background, y `setSolidPreview(false)` en `:352` queda código muerto. Es una **degradación funcional silenciosa en el camino normal de uso**. El fix es trivial: pasar un getter `getPrintSim: () => printSim`, tal como ya hace `slicerBridge` (`:10108`) correctamente.
- **ARQ-3 — Ajustado 🟠→🟡 (confirmado).** Los 34 *thunks* sobre *handles* adelantados son un patrón funcional hoy (ningún *thunk* se invoca durante la construcción cruzada de factories) pero introducen fragilidad futura: cualquier reordenamiento de inicialización puede reproducir el mismo tipo de bug que ARQ-2.
- **ARQ-4 — 🟡 (no verificado por el adversarial; confianza original del revisor).** Cache-busting `?v=` gestionado manualmente y disperso en varios ficheros — riesgo de *drift* entre versión de código y versión servida.
- **ARQ-5 — 🟡 (no verificado; confianza original).** Las factories con estado no son testeables por diseño; es una consecuencia directa de ARQ-1, no un defecto independiente.

## 4. Evaluación de código

**Hallazgos confirmados/ajustados, por severidad:**

- **COD-1 — Ajustado 🟠→🟡 (confirmado).** Guardado silencioso de permisos: `permissions.js:401-405` tiene un `catch` vacío que no comprueba `res.ok`; el `onclick` de la línea 393 cierra el modal incondicionalmente aunque el guardado haya fallado; `loadConfig` sobrescribe el estado en la siguiente recarga sin avisar de la pérdida. Se ajusta a 🟡 porque el impacto es medio (configuración solo de UI, rehacible) y la condición es posible, no del camino normal. Nota relevante: este fallo silencioso cubre **todas** las ediciones del panel, no solo la matriz de permisos.
- **COD-2 — 🟡 (no verificado; confianza original).** `sensor_pointcloud.py:164-177`: si falla la escritura, el `except: pass` deja un fichero temporal de caché huérfano en disco.
- **COD-3 — 🟡, impacto Medio (no verificado; confianza original Media).** `sensor_pointcloud.py:285-317`: los *bounds*/centro se calculan sobre un submuestreo aleatorio, no sobre la nube completa — puede introducir sesgo en casos límite.
- **COD-4 — 🟡 (no verificado).** El ctx gigante compartido entre factories es deuda de transición, consistente con ARQ-1.
- **COD-5 / COD-6 — ℹ️ Nota (no verificados).** El *retry* confunde error de red con error de payload; `stopIdleWatch` tiene un nombre engañoso respecto a lo que realmente detiene.

**Estado real de los tests:**
- **TST-1 — Confirmado 🟠.** `ci.yml:26` solo ejecuta pytest; los 6 ficheros `*.test.mjs` existen y funcionan localmente pero **nunca se ejecutan en CI**.
- **TST-2 — Confirmado 🟠.** Los 6 tests JS solo importan módulos puros; ninguna de las 5 factories con estado (`feederMaterials` 2.171 LOC, `cloudStl3D` 1.625 LOC, `cloudLibrary`, `annotationManager`, `printSimulation`) tiene test. El propio bug ARQ-2 es evidencia empírica de este vacío: es exactamente el tipo de error de re-cableado de ctx que un test de integración de `cloudStl3D` habría detectado.

Al margen de estos hallazgos, la calidad de base es alta: parseo defensivo, cancelación por token de cargas obsoletas, autenticación con hardening real, y comentarios que explican decisiones. Los tests pytest existentes son sólidos y no tautológicos. Métricas cualitativas del revisor: legibilidad 4/5, robustez 4/5, uso idiomático 4/5, testing 3/5.

## 5. Evaluación de seguridad

**Modelo de amenaza asumido:** kiosco local sin exposición pública ni TLS; el riesgo relevante no es un atacante remoto sino un operador local o un fallo que permita un movimiento de máquina no autorizado.

**Superficie enumerada y postura:** PBKDF2-HMAC-SHA256 con 240k iteraciones y comparación en tiempo constante (`hmac.compare_digest`), backoff y respuesta *dummy* anti-enumeración de usuarios; *path traversal* neutralizado (`Path(x).name` + validación contra el listado real del directorio); `np.load(allow_pickle=False)` (sin RCE por deserialización); *gating* de `postMessage` por identidad de `contentWindow` (no por origen, que sería *spoofable*); `escapeHtml()` aplicado de forma consistente antes de `innerHTML`; *bind* explícito a `127.0.0.1`; CORS acotado únicamente al slicer (no `*`); `credentials.json` cubierto por `.gitignore` (regla `database/`). No se detectó ningún 🔴 dentro del modelo de amenaza real.

**Hallazgos confirmados/ajustados:**
- **SEG-1 — Confirmado 🟠.** El enlace de movimiento real de la máquina (`machineLink`) acepta `POST` sin token ni rol server-side. Está apagado por defecto (`machineLinkConfig` exige `AVIS_MACHINE.enabled`/`?machine=1`; `initMachineLink` retorna temprano si no está habilitado) y el HMI es defensivo (un `start-print` simulado solo abre el checklist; `command()` exige `isConnected()`), por lo que no escala a 🔴. El riesgo real reside en el firmware, fuera de este repositorio, pero **debe** resolverse con autenticación server-side antes de activar la conexión a máquina real en producción.
- **SEG-2 — 🟡 (no verificado; confianza original).** Escrituras sin autenticación (`PUT` de permisos, proxy de slicer), mitigadas por loopback + CORS + protección anti-*lockout*.
- **SEG-3 — 🟡, impacto Medio (no verificado; confianza original).** Agotamiento de recursos autoinfligido en loopback: `max_points` de 2M y STL completo cargado en RAM.
- **SEG-4 — 🟡 (no verificado).** Fuga menor de detalle de error; quedan 2 mensajes tras el *commit* `8557b6a` que ya redujo esta superficie.
- **SEG-5 — 🟡, impacto Medio (no verificado; confianza original Media).** El endpoint `/slicer` reenvía el campo `stl` de forma literal al servicio de slicer, lo que abre una vía potencial de SSRF si el destino no está validado; el servicio de slicer en sí queda fuera del ámbito de esta revisión.

## 6. Evaluación de rendimiento

*(Ejecutada en modo profundo; se reporta como dimensión informativa sin peso en la nota global — ver nota en la sección 1.)*

**Perfil del sistema:** higiene de GPU **ejemplar**. Los tres caminos de recreación de escena (recarga de URDF → `clearRobot`, recarga de STL → `clearCloudStlObject` antes de recrear, y el *teardown* de simulación de impresión) liberan correctamente geometría, material y texturas (`disposeMaterialWithMaps`). Timers y *listeners* se limpian de forma consistente (`dispose`/`clear`). El crecimiento de memoria está acotado: caché de materiales de log con tope de 200, LRU de nubes de puntos con tope de 8, y `THREE.Cache` global no está activado. El bucle de render aplica *throttling* en reposo y calidad adaptativa, sin *allocations* por fotograma.

**Hallazgos:**
- **REN-1 — Ajustado 🟠→🟡 (confirmado).** El *polling* de `machineLink` carece de *timeout* y de protección anti-solapamiento (`AbortController` ausente, `setInterval` sin guarda de solicitud en curso). Como la función está apagada por defecto y requiere un controlador de máquina patológico para manifestarse, se ajusta a 🟡.
- **REN-2 — 🟡 (no verificado; confianza original).** Los `fetch` de assets (`loadUrdf`, `loadCloudStlFromUrl`) no tienen *timeout*.
- **REN-3 — 🟡, impacto Medio (no verificado; confianza original Media).** `getBoundingClientRect` invocado por fotograma en la vista de alimentador enfocada; es un estado transitorio, no permanente.

**Robustez en ejecución prolongada:** el único gap sistemático detectado es la ausencia de *timeouts* en operaciones de red/hardware; en lo demás (gestión de memoria GPU, limpieza de recursos, límites de caché) el sistema está preparado para ejecución continua tipo kiosco.

## 7. Señales de generación por IA

Consolidando las observaciones de los cuatro revisores:

- **Comentarios de calidad "por qué"** son la norma en los módulos ya extraídos (ej. `core/viewerScene.js`), lo cual es una señal positiva de intervención humana deliberada o de un uso disciplinado de asistencia de IA guiada.
- **Boilerplate mecánico repetido**: 40 setters de cierre idénticos en forma + 34 *thunks* de re-cableado son el patrón más claramente atribuible a generación asistida sistemática. No son un defecto en sí mismos, pero son el síntoma directo de la causa raíz arquitectónica (ARQ-1): en vez de rediseñar la propiedad del estado, el patrón de extracción replica mecánicamente el acoplamiento existente en cada nueva factory.
- **Ausencia de antipatrones típicos de generación descuidada**: no se encontraron `catch` vacíos sistemáticos ni código que solo contemple el camino feliz; el manejo de errores, aunque con huecos puntuales (COD-1, COD-2), es en general consciente.
- **Implicación práctica**: el riesgo no es "código generado por IA de baja calidad", sino que el patrón mecánico de extracción, si se repite sin pausa para rediseñar la propiedad de estado, puede seguir produciendo bugs de la misma familia que ARQ-2 en las próximas factories a extraer.

## 8. Comparación con la evaluación anterior

No existe evaluación previa registrada para este proyecto. Este informe constituye la **línea base**: todas las puntuaciones y hallazgos se establecen aquí por primera vez y servirán de referencia para medir el progreso del refactor ARQ-2 en evaluaciones futuras (columna Δ = "—" en toda la tabla de la sección 1).

## 9. Plan de mejora priorizado

| Prioridad | Acción | Hallazgos que resuelve | Impacto | Esfuerzo | Dimensión que mejora |
|---|---|---|---|---|---|
| 1 | Corregir la captura `const` de `printSim` en `cloudStl3D` pasando un getter (`getPrintSim: () => printSim`), replicando el patrón ya usado en `slicerBridge` | ARQ-2 | Alto (restaura pre-slice en background y preview sólido) | Bajo (cambio de una línea + verificación) | Arquitectura / Código |
| 2 | Añadir un *job* de CI que ejecute `node --test` junto a pytest | TST-1 | Medio-alto (visibilidad inmediata de regresiones JS) | Bajo | Testing |
| 3 | Escribir el primer test de integración de `cloudStl3D` que cubra el flujo de `printSim` (regresión directa de la acción 1) y extenderlo progresivamente a `feederMaterials`, `cloudLibrary`, `annotationManager`, `printSimulation` | TST-2 | Alto (estas factories concentran la mayor parte del riesgo no cubierto) | Medio-alto | Testing / Mantenibilidad |
| 4 | Refactorizar el ctx monolítico (~180 claves) en sub-contextos por dominio (materials, cloud, sim) en lugar de un único objeto compartido | ARQ-1, ARQ-5, COD-4 | Alto (reduce el coste de la próxima feature típica) | Alto (cambio estructural, requiere planificación por leaf) | Arquitectura / Mantenibilidad |
| 5 | Mostrar el error al usuario cuando `res.ok` es falso en el guardado de permisos y no cerrar el modal hasta confirmar éxito | COD-1 | Medio (evita pérdida silenciosa de configuración) | Bajo | Código |
| 6 | Borrar el fichero temporal huérfano si falla la escritura de caché; documentar o corregir el cálculo de bounds/centro sobre muestreo | COD-2, COD-3 | Bajo-medio | Bajo | Código |
| 7 | Añadir `AbortController`/timeout a los `fetch` de red (assets y, si se activa, `machineLink`) y guarda anti-solapamiento en el *polling* | REN-1, REN-2 | Medio (solo se manifiesta si se activan las funciones opt-in) | Bajo | Rendimiento |
| 8 | Añadir autenticación/autorización server-side a `machineLink` antes de habilitar la conexión a máquina real en producción | SEG-1 | Alto (condición de bloqueo si se activa `?machine=1` en campo) | Medio | Seguridad |
| 9 | Validar/lista blanca del destino en el reenvío de `stl` hacia el slicer | SEG-5 | Medio | Bajo-medio | Seguridad |
| 10 | Sustituir el cache-busting `?v=` disperso por un manifiesto de versión único | ARQ-4 | Bajo | Bajo | Arquitectura |

## 10. Conclusión

**Recomendación:** apto para **mantenimiento a largo plazo** y para continuar operando en su despliegue actual de kiosco local con la máquina real apagada por defecto. No apto todavía para escalar sin condiciones a un modo de operación donde `machineLink` esté activo en campo.

**Condiciones concretas antes de:**
- **Activar `?machine=1` / `machineLink` en producción:** resolver SEG-1 (autenticación server-side) y REN-1 (timeout + anti-solapamiento en el polling).
- **Continuar el refactor ARQ-2 con confianza:** corregir ARQ-2 (acción 1, trivial) y añadir el *job* de CI para los tests JS (TST-1) antes de seguir extrayendo más factories, para no acumular regresiones invisibles como la de `cloudStl3D`.
- **Reducir el coste de mantenimiento estructural:** encarar ARQ-1 (ctx monolítico) de forma planificada, factory por factory, apoyándose en la cobertura de tests que se vaya añadiendo (acción 3) como red de seguridad.

En conjunto, el proyecto refleja una disciplina de ingeniería por encima de la media para software de este tamaño (backend consciente de seguridad, tests de backend sólidos, higiene de GPU ejemplar, refactor documentado), con una deuda arquitectónica de frontend claramente identificada, acotada y en camino de resolución, no un problema estructural sin salida.

## Apéndice A. Derivación de puntuaciones

| Dimensión | Calificación del revisor | Banda base | Ajustes aplicados | Nota final |
|---|---|---|---|---|
| Seguridad | Buena (84) | 75-89 | SEG-1 confirmado 🟠 (residual, documentado, mitigado por apagado-por-defecto): −4 | **80** |
| Arquitectura | Deficiente (58) → recalibrada tras verificación (el 🔴 de ARQ-1 se ajustó a 🟠, se levanta el capado a ≤59) | Aceptable, extremo superior (69) — refleja DAG limpio de imports + backend cohesivo + trayectoria de refactor documentada | ARQ-1 confirmado 🟠 (shotgun surgery real): −5; ARQ-2 confirmado 🟠 (degradación funcional silenciosa): −4; ARQ-3/4/5 🟡 (3 hallazgos, no supera el umbral de acumulación >10): sin descuento adicional | **60** (69−5−4) |
| Calidad de código | Buena (80) | 75-89 | COD-1 ajustado a 🟡 (no confirmado como 🟠): sin descuento individual; COD-2/3/4 🟡 y COD-5/6 ℹ️ (no superan umbral de acumulación): sin descuento | **81** |
| Rendimiento (informativa, sin peso) | Buena (84) | 75-89 | REN-1 ajustado a 🟡 (no confirmado como 🟠): sin descuento individual; REN-2/3 🟡: sin descuento | **84** (no contribuye a la global) |
| Mantenibilidad | Derivada (no hay revisor dedicado) a partir de los hallazgos de arquitectura (god-file 10,8k LOC, ctx ~180 claves, bus factor bajo) atenuados por documentación (`ARCHITECTURE.md`) y trayectoria de extracción incremental | Aceptable | Sin descuentos adicionales distintos de los ya reflejados en la banda | **65** |
| Escalabilidad | Derivada a partir del grafo de imports (DAG limpio, sin ciclos de módulo) atenuado por el god-file como cuello de botella de tamaño | Aceptable | Sin descuentos adicionales | **65** |
| Testing | Derivada de TST-1 y TST-2 sobre una base de backend sólido (pytest no trivial) | Aceptable, extremo superior (70) | TST-1 confirmado 🟠 (CI no ejecuta tests JS): −6; TST-2 confirmado 🟠 (0% cobertura de factories con estado): −4 | **60** (70−6−4) |

**Regla de capado global:** Seguridad (80) ≥ 40 y no se da el caso de Arquitectura Y Código ambas <50 (60 y 81 respectivamente) → **no se activa el capado**; la global se calcula por media ponderada estricta.

**Cálculo de la global ponderada:**

| Dimensión | Nota | Peso | Contribución |
|---|---|---|---|
| Seguridad | 80 | 25% | 20,00 |
| Arquitectura | 60 | 20% | 12,00 |
| Calidad de código | 81 | 20% | 16,20 |
| Mantenibilidad | 65 | 15% | 9,75 |
| Escalabilidad | 65 | 10% | 6,50 |
| Testing | 60 | 10% | 6,00 |
| **Global** | | **100%** | **70,45 → 70/100** |

*(Rendimiento no participa del cálculo — dimensión informativa por decisión documentada en la sección 1.)*

## Apéndice B. Hallazgos refutados en verificación

No se refutó ningún hallazgo en esta evaluación (0 de 8 hallazgos sometidos a verificación adversarial). Los 4 hallazgos no confirmados en su severidad original (ARQ-1, ARQ-3, COD-1, REN-1) fueron **ajustados a la baja**, no refutados, y se documentan como tales en las secciones 3, 4 y 6.

| ID | Afirmación original | Motivo de la refutación |
|---|---|---|
| — | — | No aplica: sin refutaciones en esta ejecución |
