# Evaluación de calidad de software

> Fecha: **2026-08-07** · Proyecto: Meltio WebUI (HMI operador M600-PRO — `avisualizer` + `meltio-platform`) · Modo: **profunda** · HEAD evaluado: **`319406e`** (rama `main`), rama `release`: `f383a77` · Evaluación anterior: **2026-08-06 (tarde)**, global **67/100**
>
> Pipeline: detección tecnológica → 4 revisores especializados en paralelo → 3 verificadores adversariales en lotes → 2 verificaciones puntuales adicionales.

---

## ⚠ Aviso que condiciona todo lo que sigue: el código no ha cambiado

**El HEAD evaluado es el mismo que el de la evaluación del 6 de agosto (tarde): `319406e`. La misma rama, el mismo commit, sin una línea tocada entre ambas.**

Por tanto **ningún delta de puntuación de este informe mide progreso ni regresión del proyecto**. Mide la diferencia entre dos instrumentos aplicados al mismo objeto:

| | 2026-08-06 (tarde) | 2026-08-07 (esta) |
|---|---|---|
| Agentes | **genéricos**, con el rol dado por prompt (lo advertía en su propia nota de método: comparable «con reservas») | **especializados** (`detector-tecnologia`, `revisor-arquitectura`, `revisor-codigo`, `revisor-seguridad`, `revisor-rendimiento`, `verificador-hallazgos`, `documentador-evaluacion`) |
| Verificación | TestClient, jsdom, benchmarks con el `three` del repo | lo anterior **más**: Chrome real 1080×1920 pilotado por CDP sobre la aplicación completa servida por el backend; instrumentación de `write_text` sobre NTFS con hilo observador; seis formas de corrupción del almacén de autorización; benchmarks replicados de forma independiente; un servidor que acepta y no responde; `Input.dispatchTouchEvent` con holds reales |
| Hallazgos 🔴/🟠 verificados | 18 | 17 + 2 verificaciones puntuales |

Un lector que vea «Seguridad −4» sin esta advertencia concluirá que la seguridad empeoró en un día en el que nadie tocó el repositorio. Lo que empeoró es lo que sabemos: la instrumentación de esta evaluación llegó a sitios donde la anterior no llegó, y encontró la familia de hallazgos más grave del proyecto hasta la fecha. **Un delta aquí es una corrección de la medición, no una noticia sobre el código.**

Las bases cualitativas del Apéndice A se han mantenido **idénticas** a las del informe anterior en todas las dimensiones salvo una (Testing, explicada en su tabla), precisamente para que el delta aísle el efecto de la verificación y no lo confunda con un cambio de criterio en la base.

---

## Nota de método

**17 hallazgos 🔴/🟠 pasaron por verificación adversarial con instrucción explícita de refutar, más 2 verificaciones puntuales:**

| | n |
|---|---|
| **Confirmados** (a veces agravados) | **5** |
| **Ajustados** (severidad, magnitud o tesis corregida) | **11** + 2 puntuales |
| **Refutados** | **1** |

Los verificadores aportaron además **14 hallazgos nuevos** (N-A1…N-A4, N-B1…N-B4, N-C1…N-C6), de los que uno es 🟠 (N-B1) y dos son 🟢.

**Las severidades de este informe son las posteriores a la verificación.** Ninguna severidad propuesta por un revisor se ha copiado sin más. El único 🔴 reclamado (COD-1) bajó a 🟠, así que **ninguna dimensión queda capada** por la regla del 🔴.

La verificación corrigió en las dos direcciones, que es la señal de que funcionó:

- **A la baja en magnitud:** la basura de `getStats()` pasó de 7,3 MB a **5,21 MB** por cada 10 s de impresión (las dos `Map` se indexan por capa, ~200 entradas, no por segmento); el coste de COD-1 pasó de «catastrófico» a **0,44 ms por `apply()` ≈ 2,6 % del hilo principal**.
- **Al alza en alcance:** el re-render de notificaciones no necesita «6+ avisos» — con las **3 notificaciones de fábrica** la lista ya desborda (`scrollHeight` 568 > `clientHeight` 504), así que ocurre *out of the box*.
- **En la dirección de la honestidad, contra la tesis del revisor:** el «botón muerto en táctil» quedó **refutado con 15/15 taps correctos**; el conteo de comandos rotos se corrigió de «27 + 11 por alias» a **34/38**; la evidencia CSS del ViewCube se corrigió porque el `grep` del revisor era *case-sensitive* (hay **8 reglas vivas**, no 0 — lo que agrava el hallazgo pero invalida su prueba); el vector `parents[5]` de ARQ-1(b) se refutó y se sustituyó por otro más probable; el escenario de SEG-2 («el admin borra un usuario») se declaró inexistente en la UI y se sustituyó por uno más fuerte.

---

## 1. Resumen ejecutivo

Desde la evaluación anterior **no ha pasado nada en el código**: mismo commit. Lo que ha pasado es que esta evaluación levantó la aplicación de verdad. Y al hacerlo encontró lo que ninguna evaluación previa había visto.

### 1.1 La noticia: con la máquina imprimiendo, el operador no tiene botón de parada

Reproducido ejecutando la página real —backend en `:8091`, `/urdf?machine=1`, Chrome headless 1080×1920, `fetch` devolviendo `state:"printing"` desde el primer poll—:

```
=== máquina imprimiendo, página recién cargada ===
linkConnected: true, linkState: "printing", telemetryState: "printing", polls: 7
topbarPrintProgressHidden: true, topbarPrintPct: "0%", bodyPrintProgressActive: false
doorLabel: "Open Door", stopModalOpen: false, cmdsSoFar: []
=== tras pulsar navDoorToggle ===
cmds: [], stopModal: { hidden: true, display: "none" }
=== topbar mientras la máquina imprime ===
conn: "Connected", linkState: "printing"
```

Tres hechos en esa traza, y los tres son el mismo defecto:

1. **Ningún control operable por el operador puede enviar `STOP` ni `ESTOP`.** Enumeración exhaustiva de caminos hasta `STOP`, tres y ni uno más: (1) `navDoorToggle` → `openStopConfirm()` → `confirmStopPrint()` → `machineLink.stop()`, **no alcanzable** porque la guarda exige `simState === playing/paused` o `isPrePrintSequenceActive`; (2) el modal directo, **no alcanzable** (`display:none`, solo el camino 1 lo abre); (3) telemetría con `activeCodes[{class:"error"}]` → `errs.raise()` → `haltPrintForError()` → `stop()`, **alcanzable pero por la máquina, no por el operador** (verificado inyectando un código de error con la sim idle: `cmds: ["STOP"]`). Sin atajos de teclado: los cinco `keydown` publicados solo hacen Escape, cierres y numpad.
2. **El botón no solo falla: hace lo contrario.** La pulsación cae en `runBottomNavDoorToggleAction()` (`urdf_viewer.js:11723`) y **ejecuta la apertura de la puerta frontal**. El operador que busca el Stop ve abrirse la puerta mientras la máquina imprime. Un fallo de modo peor que la inacción.
3. **La UI niega activamente que haya impresión.** `updateTopbarPrintProgress()` (`:10482-10487`) se alimenta solo de `printSim.getState()`, así que la píldora de progreso está `hidden`; `onMachineStateChange` (`:4904-4909`) colapsa `printing` en la etiqueta genérica «Connected». El operador no tiene ni motivo para buscar el botón. Ésta es la mitad más grave del problema.

La causa raíz es de arquitectura, no de UI: **el estado de la simulación local es la autoridad de un control con función de parada.** `isDockedPrintActive` solo lo pone a `true` `startDockedPrint()` (`:5008`); tras un F5 vale `false`, y `urdf_viewer.js:4939` (`if (!printSim || !snap || !isDockedPrintActive) return;`) garantiza que **ningún snapshot con `state:"printing"` toca `printSim`**. No hay rehidratación, ni reconciliación, ni aviso, ni bloqueo. La refutación se intentó y falló.

Alrededor de ese núcleo hay cinco hallazgos más de la misma familia, todos verificados:

- **N-C4** — aunque el camino se abriera, `contract.json` declara `stopPrint` con `permission: "operator"`; la HMI arranca **sin sesión**, y `confirmStopPrint()` → `machineLink.stop()` → **HTTP 401** (`{"detail":"Sign in to control the machine"}`), con el operador viendo solo el toast `Stop command failed: command HTTP 401`. *(**Reclasificado a 🟢 — §8.2 corrección 4**: el rank es correcto por diseño; queda solo el residuo de UX.)*
- **N-C1** — el E-stop por software **no tiene ningún llamador**. Barrido exhaustivo: `"ESTOP"` aparece 1 vez en todo el JS no-bundle (`machineLink.js:200`); `emergencyStop(` 2 veces (definición + su propia llamada interna); inventario de controles de `urdf.html` con nombre accesible tipo stop/emerg/halt/abort/parada → 8 hits, **ninguno un E-stop**; CSS → 0 estilos y un **comentario huérfano** (`:6448`) que describe un cluster «(E-stop + progress + utility icons)» que no existe en el markup. Esto **no es un fallo de seguridad**: `machineLink.js:34-36` documenta que la consola es una ayuda al operador y que el E-stop y los interlocks de hardware son la capa real y deben ser independientes de este código. Es **andamiaje muerto**: se declaró en el contrato, se le talló una excepción de autorización propia (`permission: "none"`) y no se conectó. Agravante: `_FORWARDABLE` solo reenvía dos comandos, `ESTOP` y `STOP` — **la mitad exacta de la superficie que llega al hardware real no tiene disparador en pantalla**.
- **N-C5** — `MeltioErrors.raise` tiene **un solo llamador** y es la telemetría (`machineLink.js:112`). El camino 3, la última parada automática, depende enteramente de que la máquina se autodiagnostique. Si el adaptador real no rellena `activeCodes`, tampoco existe.
- **ARQ-1(b)/SEG-6** — con `contract.json` ilegible (una coma de más al declarar un comando nuevo), `_load_command_levels()` traga el `ValueError`, la app arranca, la UI carga y **todos** los comandos dan 400, `ESTOP` y `STOP` incluidos. Contradice el comentario de `app.py:1061-1063` (*"refusing a stop request because nobody is logged in is the wrong failure direction"*).
- **REN-2** — el bucle de telemetría muere en silencio ante un socket colgado y **nunca reprograma**; `onMachineStateChange` es el único escritor de la etiqueta del topbar y no dispara, así que la barra **sigue diciendo «Connected»** con el enlace muerto. Además, a los 3 s `machineConnected()` → `false` desarma en silencio `haltPrintForError()` — la única parada automática que queda.

**Calibración honesta.** Hoy, por defecto (sin `?machine=1`), nada de esto es alcanzable; con `?machine=1` contra el mock es 🟡; con `AVIS_MACHINE_READONLY=0` y el ControlService real es **🟠**; y en el **host WPF .NET**, que reimplementa este backend contra un `contract-http.json` **que no describe ningún modo read-only** y sirve los mismos `hmi/` publicados con la misma lógica de `navDoorToggle`, las precondiciones se reducen a «hay impresión en curso y la página se recargó, o el trabajo lo lanzó otro cliente». Toda la rebaja de hoy descansa en `machine_controlservice.py:369-377`, una mitigación **que el host .NET no hereda**.

### 1.2 Lo que la UI dice que bloquea y no bloquea

**SEG-1 confirmado y agravado.** `app.py:1051-1060` compara únicamente `int(role.get("rank") or 0) < required_rank`; `role["permissions"]` no se lee jamás en el camino de comandos. El verificador corrigió el conteo del revisor (confundía HTTP 200 con despacho) y, sobre todo, **encontró un escenario mejor y enteramente de UI**: el administrador desmarca todas las casillas del built-in Operator+ en la matriz, con el PUT exacto que emite la interfaz.

```
stored role: [{'id':'role_operator_plus','rank':2,'builtin':True,'permissions':[]}]
login op: 200 · ARM 200 {'accepted':True,'state':'armed'} · START_PRINT 200 {'state':'printing'}
/api/me permissions: []
```

**Un rol con cero capabilities según su propia matriz arranca una impresión.** El diseño server-side está documentado como intencional; lo que no está documentado en ninguna parte es el `rank: 2` cableado (única aparición de `rank` en todo el frontend: `permissions.js:477`) ni que la matriz no gobierna comandos.

**SEG-4 confirmado en seis formas de corrupción.** El almacén de autorización falla **abierto**:

```
hardened store -> ARM: 403
  truncated mid-write / empty file / single NUL byte /
  valid JSON sin 'roles' / roles vacío / no-dict     -> ARM 200, roles de fábrica
  file DELETED (clon fresco)                          -> ARM 200
corrupt store + cookie viva: ARM+START_PRINT 200 {'accepted':True,'state':'printing'}
CONTRASTE _load_command_levels con contract.json corrupto: levels: {}   <-- fail-closed
```

No distingue «no hay fichero» (clon fresco → defaults, correcto) de «hay fichero ilegible» (`app.py:530-543`, mismo `return`). Y **la corrupción es alcanzable, medido**: 400 reescrituras de `write_text` con un hilo observador sobre `stat().st_size` en NTFS → `observed sizes: [0, 909]`. **El tamaño 0 se observa: la ventana de truncado existe.** Contradice la regla que el propio fichero enuncia 400 líneas antes (`app.py:116-117`, *"a missing authorization table must never mean allow"*). Cara B que el revisor no mencionó: un corte de corriente durante el guardado deja el kiosco con **cero cuentas y sin vía de recuperación desde la UI** — hay que ir a la CLI.

### 1.3 La interfaz se come a sí misma sesenta veces por segundo

**COD-1, bajado de 🔴 a 🟠 pero agravado en el mecanismo.** En Chrome real, con la app completa y **sin que el verificador mute nada**: 126 records en `.perm-account-chip` en 2 s idle / 63 frames rAF = **exactamente un `apply()` por frame, indefinidamente, ya en marcha en el arranque**. jsdom confirma que no decae: `IDLE 1s → 0 records`; tras UNA `appendChild` externa → 70 records en 1 s, 216 en 3 s, y 72 más tras retirar el estímulo.

El verificador refutó tres cosas del revisor y encontró una peor:

```
CONTROL #topbarSettingsToggle hold=0/40/150/400ms -> clicks emitidos siempre
CHIP  .perm-account-chip hold=  0ms -> clicks=["SPAN"] modal=true
CHIP  .perm-account-chip hold= 40ms -> clicks=["SPAN"] modal=true
CHIP  .perm-account-chip hold=150ms -> clicks=[]       modal=false
CHIP  .perm-account-chip hold=400ms -> clicks=[]       modal=false
```

Una pulsación **de ratón** mantenida ≥1-2 frames no genera ningún `click`: el nodo del `mousedown` ya está destruido en el `mouseup`. Un clic humano dura 80-200 ms. En táctil el botón funciona (15/15 taps con holds de 30 a 600 ms abren el modal), así que **en el modelo de despliegue declarado el defecto no muerde**; muerde con ratón, es decir en desarrollo, servicio técnico o kiosco con periférico. Y muerde peor en **N-B1**: el botón **Sign in / Sign out** de Settings tiene su listener sobre el nodo recreado (`permissions.js:299/:301`, `stillAttached: false` medido) — ahí no hay elemento estable que recoja el clic.

**REN-3 confirmado y agravado.** El re-render de notificaciones cada 5 s es destructivo, sin guardia y sin dirty-check:

```
{"panelVisible":false,"cards":2,"childListRecordsIn11s":2}
{"childListRewritesOver15s":3,"timesTheMarkupActuallyDiffered":0}
{"scrollSetTo":1204,"scrollTopAfter6s":0}
{"focusBefore":"BUTTON","focusAfter":"BODY","lost":true}
```

Tres reescrituras, **cero veces distinto**. En un panel táctil, el operador que se desplaza por la lista vuelve al principio cada 5 segundos y pierde el foco del botón «Acknowledge». **N-B2** lo cierra en círculo: `updateNotificationFilterCounts()` reescribe el `innerHTML` de los 4 chips de filtro en el mismo tick y **realimenta el observador de COD-1**. Ninguno de los dos revisores vinculó los dos hallazgos; el verificador sí.

**COD-2 confirmado y mucho más amplio.** `notificationToastedIds` recibe `.add()` y **ningún `.delete()` en 1.449 líneas**; su gemelo `bellArrivalSeenIds` sí se poda (*"so they ring again if re-raised"*).

```
E-STOP #1 ON   toasts=1  titles=["Emergency E-Stop"]  bellRang=true
E-STOP OFF     toasts=0                                bellRang=true
E-STOP #2 ON   toasts=0  titles=[]                     bellRang=true   <-- sin toast
E-STOP #3 ON   toasts=0  titles=[]                     bellRang=true   <-- sin toast
```

No es «el segundo E-Stop»: son **los ~15 tipos de señal, y para siempre** en un kiosco que nunca recarga. Contradice literalmente el comentario de `:872-880` (*"…so an urgent alert can never silently disappear unnoticed"*). Atenuante honesto: campana, badge y tarjeta siguen funcionando.

### 1.4 Respuestas directas

**¿Es mantenible?** Sí, con el mismo margen que ayer y por las mismas razones medidas: 0 TODO/FIXME/HACK, 0 `console.log` en JS propio, 0 `print(` de depuración en Python propio, documentos autoritativos al día, comentarios que explican el *porqué* y nombran el bug histórico que motivó cada defensa. Los lastres son los conocidos —god-file de 12.535 líneas, `create_app()` como clausura de 698 líneas con 26 decoradores de ruta y 0 `BaseModel`/`Depends`/`APIRouter`— más uno nuevo que esta evaluación documenta: **`ARCHITECTURE.md` tiene cero menciones de e-stop, emergency o safety, mientras `CONTRIBUTING.md:143-147` presupone lo contrario** (*"Any control for a physically dangerous action (motion, laser, feeder, e-stop) must be authorized server-side/in firmware"*). Esa contradicción documental es exactamente lo que permitió que la familia N-C sobreviviera 26 días.

**¿Es escalable?** Las piezas son correctas: partición en dos apps sin import cruzado, contrato host-owned, puerto de máquina, artefacto de release autocontenido y ejecutable. La objeción de la evaluación anterior —«el ritmo de extracción no converge, faltan ~85 fases»— **se ajusta a la baja en este informe**: el verificador midió que la contabilidad `−586 LOC netas` omitía **1.064 líneas de test añadidas** por las mismas cuatro fases a código que no tenía ninguna. Presentar «+330 netas» sin eso hace parecer churn puro lo que es cobertura nueva. Aquel `−2` ad hoc de Escalabilidad no se repite (ver la discrepancia anotada en el Apéndice A). Lo que sí limita el crecimiento es el **segundo consumidor**: el host WPF .NET recibe contratos que se contradicen entre sí (§2.4).

**¿Es seguro?** No para tocar hardware, y la razón cambió de sitio respecto a ayer. Los tres 🟠 de seguridad de ayer siguen ahí en sustancia pero dos bajaron a 🟡 al acotarse (SEG-2, SEG-3); en su lugar aparecen **SEG-4** (fail-open del almacén, con ventana de truncado medida en NTFS) y **la familia N-C** (las vías de parada). El modelo de amenaza está bien acotado y verificado: **loopback en todos los procesos**, sin atacante remoto. Contra eso, la superficie real es el operador físico —que ya tiene E-stop de hardware— y el **administrador legítimo que decide con una UI que no le muestra la variable que autoriza**. Y hay una puerta de CI **roja ahora mismo**: `npm audit --audit-level=high` sale con exit 1 por js-yaml 4.3.0 vía eslint→@eslint/eslintrc (CVE-2026-59870); `npm audit fix` lo cierra sin breaking change.

**¿Indicios de generación por IA con consecuencias?** Sí, y esta evaluación afina la clase: **defensas y andamiajes a medio conectar, con la intención correcta escrita en un comentario y la cobertura a un paso**.
- `check_dead_lookups.mjs:32` presume de haber cableado «the wire-drum card, the feeder-wheel floating jog panel»; las 11 ids `hotspot*` y `materialsWireDrumToggle` **siguen muertas en el fichero que el gate no lee**.
- El comentario de `urdf_viewer.css:6448` describe un cluster «(E-stop + progress + utility icons)» que nunca existió en el markup.
- `emergencyStop` tiene su propia excepción de autorización (`permission: "none"`) y cero llamadores.
- `_load_command_levels()` falla cerrado y, 400 líneas más abajo, el almacén de permisos falla abierto por el mismo tipo de entrada corrupta.
- `bellArrivalSeenIds` se poda con el motivo escrito; su gemelo no.
- `window.ENABLE_NOTIFICATION_MOCK_SIGNALS` (**N-B4**) no se pone a `true` en ningún sitio: 25 líneas muertas en cualquier despliegue.

### 1.5 Tabla de dimensiones

| Dimensión | Puntuación | Estado | Δ vs. 2026-08-06 (tarde) |
|---|---|---|---|
| Arquitectura | 65/100 | 🟡 | **+4** |
| Calidad de código | 62/100 | 🟡 | **−4** |
| Seguridad | 55/100 | 🔴 | **−4** |
| Rendimiento *(no pondera)* | 77/100 | 🟢 | **+5** |
| Mantenibilidad | 78/100 | 🟢 | **+3** |
| Escalabilidad | 74/100 | 🟡 | 0 |
| Testing | 78/100 | 🟢 | **−4** |
| **Global (ponderada)** | **66/100** | 🟡 | **−1** |

*(Umbrales: 🟢 ≥75, 🟡 60-74, 🔴 <60. Rendimiento se evalúa y no pondera. Aritmética completa y auditable en el Apéndice A, ejecutada, no calculada de cabeza.)*

**La global se mueve 1 punto y el reparto se mueve 4 en cuatro dimensiones distintas, en direcciones opuestas. Ésa es la historia del informe.** Con el mismo código, un instrumento más agresivo bajó Seguridad, Código y Testing y subió Arquitectura y Rendimiento, casi cancelándose. Lo que esto dice no es «el proyecto está igual»: dice que **la nota global tiene una banda de incertidumbre de al menos ±4 puntos por dimensión atribuible al instrumento**, y que compararla entre evaluaciones ejecutadas con instrumental distinto es comparar dos reglas, no dos objetos. Las cuatro variaciones se justifican una a una en §5.

---

## 2. Hallazgos confirmados

Agrupados por lo que significan, no por ID. La familia de §2.1 es el hilo conductor y no aparecía en ninguna evaluación previa.

### 2.1 Los que bloquean tocar hardware — las vías de parada

Ya descritos en §1.1 con la evidencia ejecutada. Resumen operativo:

| ID | Severidad final | Qué es | Dónde |
|---|---|---|---|
| **N-C3** | **🟠** precondición / 🟡 hoy | La única parada del operador depende del estado de la simulación **local**; tras un F5 con la máquina imprimiendo no hay camino a `STOP`, el botón abre la puerta y la barra dice «Connected» | `urdf_viewer.js:4939, 5008, 10482-10487, 11723`, `:4904-4909` |
| **ARQ-1(b)/SEG-6** | **🟠** | `contract.json` ilegible ⇒ la app arranca y **todos** los comandos dan 400, `ESTOP`/`STOP` incluidos | `app.py` `_load_command_levels()`, comentario contradicho en `:1061-1063` |
| ~~N-C4~~ | 🟢 | **Reclasificado, ver §8.2 corrección 4**: el rank es correcto por diseño (parada de proceso recuperable, no de seguridad). Residuo real: el control no está gateado y el 401 se muestra como código HTTP | `urdf_viewer.js:10418` |
| N-C1 | 🟡 | El E-stop por software no tiene ningún llamador. Función de seguridad deliberadamente en hardware; lo que falla es la documentación y el andamiaje muerto | `machineLink.js:200, 34-36`, `urdf_viewer.js:12520-12526`, `urdf_viewer.css:6448` |
| N-C2 | 🟡 | Seis wrappers de `machineLink` sin un solo call-site (`disarm`, `home`, `clearFault`, `jog`, `feeder`, `sendCommand`); el D-pad hace 6 `moveJointToValue` y **0 peticiones al servidor**; `onMachineTelemetry` nunca lee `snap.position` | `hmi/ports/machineLink.js`, `urdf_viewer.js:4938-4965` |
| N-C5 | 🟡 | `MeltioErrors.raise` solo lo llama la telemetría: la última parada automática depende de que la máquina se autodiagnostique | `machineLink.js:112` |
| REN-2 | 🟡 hoy / 🟠 con `?machine=1` | El polling muere en la petición 3 ante un socket colgado y no vuelve; la etiqueta sigue en «Connected»; a los 3 s desarma `haltPrintForError()` | `hmi/ports/machineLink.js` `pollOnce` |

Traza de REN-2, contra un servidor que acepta y no responde:

```
t=  404ms requests=2 hung=0 getState()=printing isConnected()=true  progress=0.42
t= 1419ms requests=3 hung=1 getState()=printing isConnected()=true  progress=0.42
t= 3426ms requests=3 hung=1 getState()=printing isConnected()=false progress=0.42
t=10442ms requests=3 hung=1 getState()=printing isConnected()=false progress=0.42
onStateChange transitions: disconnected->connecting | connecting->printing | printing->printing
```

`disconnect()` tiene cero llamadores; no hay watchdog. Chrome no impone timeout a `fetch` (el `headersTimeout` de 300 s de undici es artefacto de Node y no aplica). El arreglo es un `AbortController` con el mismo `COMMAND_TIMEOUT_MS` que ya usa `sendCommand` quince líneas más abajo.

### 2.2 Los que dejan pasar lo que la UI dice que bloquea

**SEG-1 🟠 CONFIRMADO y agravado** y **SEG-4 🟠 CONFIRMADO** — evidencia completa en §1.2.

Precisión de SEG-4 que el revisor no comprobó y el verificador sí, **ambas condiciones se cumplen en instalación por defecto**:
1. El fail-open solo escala si el rol del usuario comparte id con uno built-in (`intacto/corrupto + role id custom → ARM 403` en ambos). Se cumple siempre, porque `set_password.py --create` escribe `DEFAULT_PERMISSIONS_DOC` tal cual.
2. Se pierden los usuarios, así que no hay login nuevo (`corrupt store, nuevo login: 401`); solo explotan sesiones ya vivas.

### 2.3 Los que se comen la interacción del operador

**COD-1 🟠 (bajó de 🔴) + N-B1 🟠**, **REN-3 🟠 CONFIRMADO y agravado**, **COD-2 🟠 CONFIRMADO y agravado** — evidencia completa en §1.3.

COD-1 **sube a 🔴** si el panel deja de ser exclusivamente táctil, o si alguien mete un `<input>` dentro de `.perm-settings-account` (perdería el foco 60 veces por segundo).

### 2.4 Los que engañan al segundo consumidor

**ARQ-1(a) 🟠 AJUSTADO — conteo corregido, causa raíz distinta, agravante peor.** Ejecutados los 38 canónicos + 11 alias con sesión rank 4:

```
REACHED HANDLER by canonical name: 4   (jog, home, arm, disarm)
UNKNOWN AT MOCK: 34
Aliases: 11 -> 11 reaching a handler, 0 unknown
```

Dos correcciones al revisor: son **34/38**, no «27 + 11 por alias» (`jog`/`home`/`arm`/`disarm` despachan por su nombre canónico porque `.upper()` los convierte exactamente en el handler); y **«27 no llegan a ningún handler» no es un defecto**, porque el `$comment` de `contract.json` lo autoriza explícitamente (*"Deliberately WIDE… hosts that do not implement a command MUST still ack it"*).

**Lo que sí queda es peor de lo reportado:** el contrato dice cómo ack-ear un comando no implementado — `{success:false, code:'notSupported'}` — y el backend de referencia responde `{'accepted': False, 'reason': "unknown command 'emergencyStop'"}`. `notSupported`, `ackCodes`, `requestId` y los 17 mensajes del canal `viewer`: **0 ocurrencias fuera de `contract.json`** en todo el repo. **El backend de referencia incumple el contrato que publica.**

Y el agravante más afilado: `loadFeeder` declara `params: {feeder, materialId, amountGrams}` y su alias `FEEDER` se emite con `{action, side}` (`machineLink.js:202`). **Ni una clave en común**, sin nota que permita a un alias llevar payload distinto. El host C# que mapee `FEEDER → loadFeeder` recibe `{action:"side", side:"left"}` y no tiene el número de alimentador. Consecuencia hoy en runtime: ninguna. El defecto es **exportado**.

**ARQ-3 🟠 AJUSTADO — la tesis del revisor es falsa y el defecto empeora.** Escenario reproducido contra el `machineLink.js` real:

```
A) host fiel al contrato: activeCodes = ["200.1"]      -> MeltioErrors.raise calls: []
B) forma real del backend: [{class,code}]              -> MeltioErrors.raise calls: [["error","200.1"]]
```

El fault se traga en silencio, sin validación aguas arriba. `app.py`: **0 BaseModel, 0 response_model, 0 Depends, 0 APIRouter, 26 decoradores**; el OpenAPI de `/api/machine/state` es `{"additionalProperties": true, "type": "object"}`. Pero la tesis causal —«el esquema solo vive en `machine_mock.py`, que `release` no lleva»— **es falsa**: `hmi/ports/machineLink.js:21` (publicado) documenta la forma exacta con ejemplo y `hmi/notifications.js:228-253` (publicado) es un literal de 18 claves de señales. **Lo que queda es peor que la ausencia: contradicción.** El árbol publicado contiene dos descripciones de `activeCodes` y **la legible por máquina es la equivocada**. Sub-claim refutado: «bloquea toda impresión sin pista de qué falta» — `prePrintCheck.js:67` nombra las claves ausentes.

**N-A1 🟡, corroborado por dos verificadores independientes, ambos midiendo — escritura ilimitada al log de auditoría sin autenticar.** `_append_command_audit` (`app.py:623-646`) corre para todo comando **autorizado**, incluidos los 12 de nivel `none` que no exigen sesión, y vuelca `args` verbatim sin cota, sin rotación y sin límite de tasa — mientras `PUT /api/permissions/config` sí tiene tope de 512 KB.

```
lote B: anonymous setLight con blob de 900 KB -> audit log 900.172 bytes tras UNA petición
        180,9 MB tras 201 peticiones en 2,3 s = 77,6 MB/s de escritura a disco sin autenticar
lote C: 1.000.880 bytes en 5 peticiones sin cookie
```

Acotado a loopback, pero `contract-http.json` exporta la ruta con `"audited": true` y sin cota, así que el host C# la reimplementará igual. **N-A4 🟢** explica cómo se coló: la docstring dice *"an accepted (authorised + dispatched) machine command"* y el código audita todo comando **autorizado**, aceptado o no.

### 2.5 Lo que las puertas no miran

**COD-3 🟠 CONFIRMADO (18 exacto), con tres correcciones de evidencia.** Recuento propio del verificador con el regex literal del gate: **143 ids distintos en el god-file, 19 ausentes de `urdf.html`, de los que `printNotice` es falso positivo (creado en runtime) → 18 muertos reales.** Confirmado en runtime sobre la app viva: `{"viewCube": false}`. `createViewCubeController()` sale por `return null` en `:1554` en cada arranque; el bloque mide **244 líneas** (1552-1795) con `THREE.WebGLRenderer` propio, escena, cámara, texturas por cara, raycasting y cinco listeners; `viewCubeController?.onResize()` y `?.update()` son no-ops perpetuos.

Las tres correcciones al revisor —importantes porque dos de sus pruebas eran malas y aun así el hallazgo es peor—:
1. **La evidencia CSS del revisor es falsa**: su `grep` era case-sensitive. Hay **8 reglas CSS vivas** del ViewCube (`urdf_viewer.css:188, 198, 203, 1985, 1992, 1997, 2092, 2093`, una dentro de una media query) → **N-B3**. Agrava el hallazgo, pero su «→ 0» era incorrecto.
2. **El wire drum no está muerto entero**: `urdf.html` sí tiene `wireDrumAppearButton` con listener vivo (`:11298`). Lo muerto es solo la variante del menú Materials.
3. **El porcentaje**: el gate no mira el **52,5 %** del JS propio (12.535 frente a 11.336 de `hmi/`+`viewer/`), no el 55 %.

**N-C6 🟡** cierra el mismo agujero por el otro lado: `check_contract.mjs` es unidireccional (*emitido ⊆ declarado*). Un comando declarado con autorización especial que **nadie emite** —exactamente `emergencyStop`— es invisible para las nueve puertas y para el boot check. **N-B3 🟡**: ninguna puerta mira CSS contra markup.

**COD-4 🟡 (bajó de 🟠) — acantilado de cobertura, defecto de proceso.** Ambos mutantes aplicados a `hmi/permissions.js` sobreviven a **todo**: 187 node + 49 pytest, eslint (0 errores), las cuatro puertas de contrato/imports/dom/dead-lookups **y el boot check real en Chrome** (`settled in 24.2s — 24/24 meshes, 0 console errors → clean`). La pregunta abierta del revisor queda resuelta: **el boot check no los toca**, ninguno produce error de consola. Baja a 🟡 porque ambos viven en una capa que el propio proyecto declara no-frontera de seguridad, verificado: con `hasPermission → true` el servidor sigue rechazando por `rank`. Es deuda de proceso — **7 módulos vivos, ~15.500 líneas, sin un solo test**: `permissions.js` (527), `calendar.js` (820), `utilities.js` (414), `machineLink.js` (257), `printSimulation.js` (878), `assemblyAnnotations.js` (877), `urdf_viewer.js` (12.535).

---

## 3. Refutados y ajustados — la sección que audita al informe

Esta es la sección que demuestra que las severidades de arriba no son las que propusieron los revisores.

### 3.1 El único refutado

**SEG-5 🟠 → REFUTADO en el escenario, residuo 🟡.** El revisor sostenía que `canOperateMotion()` falla abierto sin `window.MeltioPermissions`, dejando el jog permitido para todos los roles. El fail-open de la función es exacto (matriz completa verificada: sin global → `true`, sin `can()` → `true`, `can()` lanza → propaga). **Pero el escenario no ocurre, por cuatro razones que el revisor no vio:**

1. **`hmi/permissions.js` SÍ está en el artefacto de release.** El verificador lo generó: el `index.html` producido lo carga en la línea 1466 como script clásico **sin `defer`**, antes del `type="module"` (diferido) ⇒ `window.MeltioPermissions` garantizado antes de que corra una línea de módulo.
2. `tools/check_boot.mjs:284` **falla el arranque** si `window.MeltioPermissions` no es un objeto, en headless Chrome, dentro de un check requerido.
3. El comportamiento está **testeado como intencional**: `tests/js/movePanel.test.mjs:201-207` — *"Standalone/demo boot has no MeltioPermissions at all; the panel must work."*
4. **Decisivo: el D-pad no emite ningún comando de máquina.** `jogAxis` (`hmi/movePanel.js:93-110`) llama a `moveJointToValue`, una animación del grafo de escena. `machineLink.jog()` **no tiene ni un solo llamador** en todo el repo. Un D-pad totalmente abierto mueve el robot 3D, no los ejes. Y el servidor exige rank 3 para `JOG`.

**Residuo 🟡:** `contract-dom.json` omite `window.MeltioPermissions` de los `injectedDeps` de `movePanel.js` y omite `hmi/permissions.js` de los 25 módulos del manifiesto. Es el fichero que el README manda «Read this one first». Documental, no explotable.

### 3.2 Los que bajaron de 🟠 a 🟡

**SEG-2 → 🟡. El escenario reclamado no existe; el que sí existe es distinto y más incómodo.**

```
A) borrar usuario:            re-login 401 · cookie viva ARM 200 · /api/me authenticated:true
B) reasignar roleId a rank-1: PUT 200, store dice role_low · cookie viva ARM 200   <-- NUEVO
C) bajar el rank del ROL 2->1: cookie viva ARM 403                                 <-- sí revalida
D) TTL: 11h59m ARM 200 · 12h00m05s ARM 401 · store purgado al leer
E) set_password.py --password: login antiguo 401 · cookie previa ARM 200
F) set_password.py --delete:   login 401       · cookie previa ARM 200
G) create_app() nuevo:         cookie vieja -> authenticated False
```

«El admin borra un usuario» **no existe en la UI**. La forma más fuerte del hallazgo es **(F): la vía de revocación documentada del producto (`set_password.py --delete`) no revoca.** Agravante (B): la sesión fija `roleId` en el login (`app.py:711-718`), así que degradar reasignando el rol —la acción natural de «quitarle permisos»— **no surte efecto**; solo (C) funciona. **Magnitud ajustada:** la ventana no es 12 h. `hmi/permissions.js:26,155-165` auto-cierra sesión a los **10 min de inactividad** y `_sessions` es in-process. Ventana real = `min(10 min inactivo, 12 h, uptime)`. Con cookie HttpOnly+SameSite=strict hace falta el propio navegador del kiosco, es decir presencia física.

**SEG-3 → 🟡. Punto 2 confirmado y agravado; punto 1 cierto pero sin consecuencia alcanzable.**

```
Operator+ tras marcar 'Advanced (network/Wi-Fi/SSL/API/fixtures)': can setup.network true, MeltioAdvanced.set [false,false,true,true]
Operator+ por defecto:                                              can setup.network false, [false,false,false,false]
forjado {roleId:"role_admin", permissions:[]}  -> isGod true, setup.network true, admin.users true
forjado {roleId:"nope", permissions:[...]}     -> isGod true, setup.network true
```

`setup.network` es la única llave del override del interlock (`permissions.js:187` → `settings.js:452-458` → `:478` → `urdf_viewer.js:5130`). Un administrador que marque esa casilla pensando «que puedan configurar el Wi-Fi» concede, sin mencionarlo, autoridad para saltarse un check de seguridad fallido. La forja de `sessionStorage` falla abierta **en las dos direcciones**: con `roleId` real se enriquece con los permisos verdaderos; con uno inexistente el array auto-declarado sobrevive. Baja a 🟡 porque (a) el mock **sí** tiene interlock de e-stop (`after ESTOP → START_PRINT: accepted False, "E-stop engaged"`), (b) `START_PRINT` no está en `_FORWARDABLE`, y (c) la forja no produce cookie de servidor: desbloquea la UI, pero el POST sigue exigiendo sesión real. **Sube a 🔴 si `START_PRINT` entra en `_FORWARDABLE`.**

**ARQ-2 → 🟡. Hechos ciertos, cadena reproducida, consecuencia refutada para el artefacto que realmente se envía.**

```
regen == committed: true
printSimulation: {"entryPoints":["createPrintSimulation"],"requiredDomIds":[],"injectedDeps":["signal"]}
printFlowState:  {"entryPoints":["initPrintFlowState"],"requiredDomIds":[],"injectedDeps":[]}
published .js: 30 | in manifest: 25
MISSING: hmi/error_codes.js, hmi/i18n/en.js, hmi/i18n/index.js, hmi/permissions.js, viewer/robot/urdfRobot.js
```

Cadena `isInertPurging`→jog **reproducida** (el revisor solo la había leído):

```
A) embebedor fiel al manifiesto: isPrintActivelyRunning()=false, moveJointToValue llamado, notices=[]
B) cableado del dev-host:        isPrintActivelyRunning()=true,  moveJointToValue NO llamado, notices=["Stop the print to jog the axes."]
```

Pero **el artefacto publicado sí cablea la dep**: contiene `app.js` = `urdf_viewer.js` verbatim, línea 139 incluida (`initPrintFlowState({ isInertPurging: () => inertPhase === "purging" });`). El fallo solo aparece si el embebedor tira `app.js` y reensambla desde el manifiesto. **Sube a 🟠 con el primer host que monte `hmi/`+`viewer/` sin `app.js`.** Magnitud ajustada además: de las 18 deps desestructuradas, **10 están guardadas** con `typeof x === "function"`; solo 8 son duras. Censo de globales del árbol publicado: 6 globales, 35 ocurrencias, **0 en los tres contratos**, y el `$comment` del manifiesto **no** los declara fuera de alcance.

**ARQ-4 → 🟡. El censo del revisor era correcto pero engañoso, y el verificador midió el número honesto.** Con **acorn**, no grep: 1.121 sentencias top-level (reclamado 1.119), 372 `FunctionDeclaration` hoisted que no ejecutan, 526 declaraciones en su mayoría inertes, **1 solo `TryStatement` top-level**, 0 IIFEs. **El número honesto —sentencias top-level que llaman a algo en carga— es 378**, desde `applyDomTranslations()` (`:133`) hasta `animate()` (`:12182`). La tesis sobrevive más afilada, pero la contabilidad de la extracción omitía las **1.064 líneas de test** (320+163+287+294) que las mismas cuatro fases añadieron a código que no tenía ninguna. Sin consecuencia de runtime demostrada → 🟡.

**REN-1 → 🟡. Benchmark replicado de forma independiente, basura sobreestimada, agravante real pero acotado.** Réplica dentro del 10 % de lo reportado (mediana ms, sin/con térmica): 10k 0,021/0,331 · 100k 0,200/**3,404** · 250k 0,495/**8,243**. `printSecondsAt1x` **inmutable, medido**: 70 ciclos cruzando playing y paused → `distinct printSeconds values: [2500]`. **Corre en pausa, medido**: `state after pause(): paused | draw gate wants 'playing' -> renders: false`, mientras `updateTopbarPrintProgress` lo trata como activo. Basura corregida a la baja con GC forzado: `9105 B/call` ⇒ **5,21 MB por cada 10 s de impresión, no 7,3**. El agravante del degradador adaptativo deja de ser mecanismo deducido —`DYNAMIC_QUALITY_DOWN_FRAME_MS = 24` confirmado y el delta rAF-a-rAF sí incluye `getStats()`— pero **solo muerde por encima de ~180k segmentos** (16,6+3,4 = 20 ms no cruza; 16,6+8,2 = 24,8 ms sí). **Sube a 🟠 con un toolpath real por encima de ~180k segmentos.** El arreglo es memoizar un valor que no cambia.

**COD-4 → 🟡** y **N-C1 → 🟡**: descritos en §2.5 y §2.1.

### 3.3 Tesis corregidas sin cambio de severidad

- **COD-1**: mecanismo confirmado y agravado, pero **tres refutaciones**. El botón **no se destruye** (`installAccountChip()` está guardado por `if (!left || accountChipEl) return`; `chipIsSameElementAsBoot: true`) — lo que se recrea son sus hijos. «Un `pointerup` entre el `innerHTML=""` y el `append`» es **imposible**: `apply()` es síncrona y JS es monohilo. Y **la causa raíz de «botón muerto en táctil» está refutada**: 15/15 taps reales abren el modal, porque Chrome sintetiza el click táctil por hit-test en el `touchend`.
- **ARQ-1(b)**: el vector propuesto por el revisor (`parents[5]`) está **refutado**. `REPO_ROOT` alimenta también `HMI_DIR`/`VIEWER_DIR`, que `app.py:490-491` pasa a `StaticFiles`, y eso revienta antes (`RuntimeError Directory 'Z:/nope/hmi' does not exist`): no hay «servidor con el E-stop muerto», no hay servidor. El vector real es otro y **más probable**: `contract.json` corrupto o ausente con el árbol sano.
- **N-C3**: «no existiría ningún control capaz de enviar STOP ni ESTOP» es refutable en su literalidad. La formulación correcta, que es la que este informe usa: **ningún control operable por el operador puede enviar `STOP` ni `ESTOP`; la única parada por software que queda es la que la máquina se dispara a sí misma al reportar un código de error.**
- **SEG-1**: el conteo del revisor confundía HTTP 200 con despacho. Conjunto real de comandos efectivos con `rank:2, permissions:[]`: **ARM, HOME, START_PRINT, FEEDER, DISARM, CLEAR_FAULT** (+STOP/PAUSE/RESUME según estado); `homeXY` y `toggleFrontDoor` dan `200 False "unknown command"` y `JOG` da 403.
- **ARQ-3**: la tesis causal del revisor es falsa (§2.4) y el sub-claim del bloqueo sin pista, refutado.

### 3.4 La contradicción que el informe anterior dejó abierta: **RESUELTA**

El §2.4 del informe del 6 de agosto documentó una contradicción sin resolver: una evaluación midió `getStats()` en **0,04–0,2 ms** y la otra en **6,08 ms** en el mismo escenario, treinta veces más, y ninguna era descartable.

**No era contradicción de medición. Era contradicción de premisa. Ambas midieron bien.** El revisor de rendimiento de esta evaluación verificó la cadena completa:

- el único botón de corte del slicer es `sliceButton` = «Slice + Simulate» (`index.html:579`); `simulateButton` está `disabled hidden` (`:582`);
- `sliceAndSimulate()` = `await slice()` + `await simulate()` (`app.js:2513-2523`);
- `lastSimPayload = payload` (`:2564`) → `thermal: lastSimPayload` en el postMessage (`:878`) → `setBridgedSliceData({thermal: data.thermal})` (`urdf_viewer.js:4402`);
- y `getStats()` lee el payload **crudo** (`getSlicerThermal()`, `printSimulation.js:823`), no `thermalBuffers`: **apagar la vista Thermal no evita el coste**.

**No hay forma de cortar sin simular, así que el payload térmico está siempre presente tras un corte.** La premisa cara es la correcta. Los 0,04–0,2 ms de la primera evaluación son la columna **sin** térmica; los 6,08 ms de la segunda caen entre 100k y 250k segmentos, o son 100k en una CPU ~2× más lenta — que es exactamente lo que es un panel empotrado.

**Aun así el hallazgo baja a 🟡**, porque al medirse y acotarse resulta que 3,4 ms sobre un presupuesto de 16,6 es ~20 % sin romper nada, y el agravante del degradador solo cruza por encima de ~180k segmentos. **Lo que sigue sin medirse** es cuántos segmentos tiene un toolpath real de producción y cuánto cuesta esto en el panel objetivo. Esa medición —un `performance.mark` alrededor de `getStats()` en la máquina real con un slice representativo— sigue siendo la que zanja la calibración, y debería preceder a cualquier refactor de esa ruta.

---

## 4. Lo que está bien hecho y no hay que tocar

No es cortesía: cada punto se verificó ejecutando, y una refactorización descuidada puede arrastrarlo.

**Seguridad**
- **Bind loopback en todos los procesos**, verificado: `launch-viewer.ps1:65,81` → `--host 127.0.0.1`; `serve_artifact.py:73` → `("127.0.0.1", PORT)`; ningún bind en `0.0.0.0`. No hay atacante remoto, y eso es lo que sostiene la calibración de media docena de hallazgos.
- **PBKDF2-HMAC-SHA256 100k + `hmac.compare_digest`, con el hash calculado también para usuario inexistente. Medido: desconocido 31 ms, conocido 32 ms** — sin oráculo de temporización ni enumeración de cuentas.
- **CSRF cerrado de facto y verificado**: POST cross-site simple → 422; preflight JSON → 400 *Disallowed CORS method*. Es *emergente* —nadie escribió un token— y **un PR que acepte `text/plain` lo rompería sin que ningún test lo note**: vale un test de una línea.
- Cookie HttpOnly + SameSite=strict + Path + Max-Age, **sin `Secure` correctamente** (despliegue http loopback). CORS estrecho con allowlist derivada, `allow_methods=["GET"]`, sin credenciales ni comodín.
- **Cero path traversal en 10 sondas** contra 6 superficies. **Cero secretos en árbol e historial** (`git log --all --diff-filter=A` sobre `.env`/`.pem`/`.key`/`permissions.json` → nada). **Sin credenciales por defecto**: 4 roles built-in, 0 usuarios.
- **`ControlServiceMachine` read-only por defecto con allowlist de dos comandos.** Es lo que sostiene la seguridad física real hoy — y precisamente por eso, lo que el host .NET no hereda (§1.1).
- **Predicados de `prePrintCheck` fail-closed y probados**: rechazan `"true"`, `1`, `null`, `"yes"`, `{}`.
- **`_load_command_levels()` falla cerrado**, y **auditoría JSONL de todo comando aceptado**, incluidos los anónimos.
- **`contract-http.json` generado por AST walk con puerta independiente** (`test_http_contract.py` regenera, compara y **afirma por su cuenta** que las tres rutas con autorización siguen exigiéndola). Es el modelo que los otros dos contratos deberían seguir.

**Rendimiento** — la evaluación de esta ronda es más favorable que la anterior porque midió más:
- **Puerta de dibujo bajo demanda real enumerando diez fuentes de movimiento** (`urdf_viewer.js:10925-10934`), con la misma disciplina replicada en el slicer.
- **Pixel ratio adaptativo con histéresis y cooldowns separados por dirección** (bajada 24 ms, subida 16,8 ms).
- **`disposeMaterialWithMaps` itera propiedades y libera todo lo que sea `isTexture`** —el olvido clásico— usado consistentemente en 3 sitios.
- **Cero fugas de listeners globales en un god-file de 12.535 líneas**: los 20 `window`/`document.addEventListener` están a nivel de módulo, ejecutados una vez; los 234 restantes cuelgan de nodos que mueren con su re-render. Con **0 `removeEventListener` en todo el frontend**, esto podría haber sido un desastre y no lo es.
- **`boundedQueue(3)` con coalescing por rAF** y comentario que nombra el O(N²) histórico. Round-robin presupuestado para raycasts de oclusión. Bed tracking en O(1). El bucle de polling no apila peticiones. Logs de historial acotados con recorte real.
- **Dirty-checks reales en el resto de la barra** (`updateBottomNavState`, `updateTopDoorShortcutButton`, `updateQuickFrontDoorToggleButton`, `updateFilesMenuDoorSeeThrough` construyen una `stateKey` y salen por early-return): exactamente el patrón que a `updateTopbarPrintProgress` y a `renderNotificationCenter` les falta. El arreglo ya existe en el repo, en el fichero de al lado.
- **El iframe del slicer preservado no consume**: `display:none` mete el subárbol en no-render y Chrome suspende su rAF. **Está resuelto; que nadie lo «optimice».**
- **REN-8 🟢**: la duplicación de `three` **no afecta al arranque** — el iframe se carga perezosamente y se blanquea al salir, así que en un arranque normal se descarga una copia. 1,3 MB frente a **139,2 MB de GLB en 24 ficheros, con `Chassis.glb` a 73,3 MB él solo**. Si se quiere atacar el arranque, el objetivo es el GLB, no el vendor.
- El backend no bloquea el event loop (rutas `def`, no `async def` → threadpool).

**Tests y puertas**
- **No hay un solo test tautológico, y se verificó por mutación**: 3/3 mutantes muertos (`notifications.js` coolant `>60`→`>=60`; `prePrintCheck.js` gas `&&`→`||`; `materialsState.js` `Math.max`→`Math.min`). Valores frontera en todas partes (799/800, 500/501, 1200/1201, barrido `[0,20,48,59,60]` vs `61`). `materialsState.test.mjs:78-84` fija el umbral al literal `500` **con el razonamiento anti-tautología escrito dentro del test**.
- **336 tests ejecutados, 0 fallos** (49 pytest viewer + 8 smoke HTTP con servidores reales + 83 slicer con el pipeline real en memoria + 187 node frontend + 9 node slicer).
- **El boot check** dentro de un check requerido, con `if: !cancelled()` en cada paso. Es lo único que habría atrapado el incidente `515877b` (dos días, nueve puertas verdes, la app muerta).
- **`check_dead_lookups.mjs` con `KNOWN_DEAD = new Set([])`** y el comentario que prohíbe ampliarlo. Su defecto es el **alcance** (COD-3), no el diseño.

**Arquitectura**
- **`ControlServiceMachine` vs `MockMachine` es el patrón adaptador usado correctamente**: dos implementaciones reales, ambas ejercitadas. No es una factoría especulativa, y el revisor lo revisó explícitamente para no elevarlo a hallazgo.
- **Fronteras `hmi`-no-three y `viewer`-no-DOM-fuera-de-overlays verificadas correctas**, con puerta en CI.
- Las **dos copias de `three.module.js` son md5-idénticas** (`71f9ef14…`) y no hay acoplamiento real entre apps. Falta una puerta que afirme la igualdad, pero la deriva costaría poco.
- **`hmi/i18n/`** (106 LOC, 27 claves, 1 locale) es abstracción especulativa **barata y con camino de salida documentado**: no vale la pena tocarla.
- **Cero deuda declarada**: 0 TODO/FIXME/HACK, 0 `console.log`/`console.debug` en JS propio, 0 `print(` de depuración en Python propio.

---

## 5. Comparación con la evaluación anterior

**Recordatorio: mismo HEAD, mismo código. Lo que sigue explica por qué cambió la medición, no el proyecto.**

| Dimensión | 06-ago (tarde) | 07-ago | Δ | Por qué se movió |
|---|---|---|---|---|
| Arquitectura | 61 | **65** | **+4** | Dos 🟠 de ayer bajaron a 🟡 al verificarse (ARQ-2: el artefacto publicado **sí** cablea la dep; el README que contradecía a su generador se reclasificó a 🟡 al no verificarse su consecuencia) y el `−2` ad hoc por «ritmo de extracción» desapareció al medirse las 1.064 líneas de test omitidas. Entra ARQ-3 (contradicción del payload de telemetría), que ayer no existía. |
| Calidad de código | 66 | **62** | **−4** | Entra **COD-1+N-B1** (−6): un bucle a 60 Hz medido en Chrome real que ayer nadie vio, con el botón de Sign in/out destruido cada frame. La acumulación 🟡 baja de −4 a −3 al acotarse varios hallazgos. |
| Seguridad | 59 | **55** | **−4** | Entran **SEG-4** (fail-open del almacén con ventana de truncado medida en NTFS) y **N-C3** (vías de parada), ninguno visto ayer, y **ARQ-1(b)** (el E-stop muere con el contrato ilegible). Salen del bloque 🟠 los SEG-2 y SEG-3 de ayer, que al acotarse bajaron a 🟡. La acumulación 🟡 sube de −4 a −5: 16 hallazgos, uno de ellos una **puerta de CI roja ahora mismo**. |
| Rendimiento *(no pondera)* | 72 | **77** | **+5** | La contradicción de §2.4 quedó **resuelta** y el hallazgo bajó a 🟡 al acotarse a >180k segmentos; el polling sin timeout bajó a 🟡 porque el enlace de máquina está apagado por defecto. Entra REN-3 (−5), confirmado y agravado. |
| Mantenibilidad | 75 | **78** | **+3** | Entra la contradicción `ARCHITECTURE.md` / `CONTRIBUTING.md` sobre el e-stop y salen los descuentos secundarios que ayer venían de 🟠 hoy rebajados — eso se cancelaba en 75. El +3 llega después, al refutarse ARQ-5 por completo (§8.2 corrección 5): el contador 🟡 cae de 11 a 10 y cruza su umbral. **El código no cambió; la medición sí.** |
| Escalabilidad | 74 | **74** | 0 | Sin cambios netos: desaparece el `−2` ad hoc del ritmo de extracción, aparece el `−2` secundario de ARQ-3 (el segundo consumidor recibe dos descripciones contradictorias y la legible por máquina es la mala). |
| Testing | 82 | **78** | **−4** | **La única base que se movió**: de 84 a 80. No es un hallazgo nuevo, es un hecho medido que ayer no se tenía — **cero medición de cobertura de línea en las cinco suites** y **7 módulos vivos ≈15.500 líneas sin un solo test**, con dos mutantes que sobreviven a las 336 pruebas, a eslint, a las cuatro puertas y al boot check. La calidad del test sigue siendo alta; su alcance no es de banda alta. |
| **Global** | **67** | **66** | **−1** | Las subidas y las bajadas casi se cancelan. |

**Los IDs de hallazgo no son estables entre evaluaciones.** El `COD-1` de ayer («guardar la matriz borra las credenciales», refutado) no tiene nada que ver con el `COD-1` de hoy (el bucle del observador). El Apéndice B usa la numeración de **esta** evaluación.

**Hallazgos que esta evaluación encontró y la anterior no tenía:** COD-1/N-B1 · SEG-4 · ARQ-3 · REN-3 · **N-C1, N-C2, N-C3, N-C4, N-C5 (la familia de las vías de parada)** · N-A1 (auditoría sin cota, 77,6 MB/s sin autenticar) · N-B2 (el círculo entre COD-1 y las notificaciones) · N-B3 (8 reglas CSS muertas) · SEG-8 (la puerta de dependencias está **roja ahora mismo**).

**Hallazgos que la anterior sostenía y esta rebaja, tras medirlos:** REN-1 (🟠→🟡), ARQ-2 (🟠→🟡), SEG-2 (🟠→🟡), SEG-3 (🟠→🟡), ARQ-4 (🟠→🟡).

---

## 6. Cobertura declarada y límites de confianza

Un informe que no dice lo que no miró no es auditable.

### 6.1 Qué no se revisó

| Revisor | Leído íntegro | **No abierto** |
|---|---|---|
| Arquitectura | `app.py`, `machine_mock.py`, `machine_controlservice.py`, `contract.json`, `gate.sh`, los 4 scripts de puertas, `gen_artifact.mjs`, `release.yml`, `machineLink.js`, `printFlowState.js`, `i18n/index.js`; ~250 de 12.535 líneas del god-file | `materials.js`, `notifications.js`, `calendar.js`, `fileLibrary.js`, `settings.js`, `utilities.js`, `prePrintCheck.js`, `assemblyAnnotations.js`, `urdf.html`, `urdf_viewer.css`, `sensor_pointcloud.py`, **todo el slicer, todos los tests** |
| Código | `notifications.js`, `prePrintCheck.js`, `permissions.js`, `materialsState.js`, `gate.sh`, `check_dead_lookups.mjs`, `domFixture.mjs`, 4 ficheros de test; parcial `app.py` (~200/1.163) y `materials.js` | **el 95 % del god-file**, `urdf_viewer.css`, `calendar.js`, `fileLibrary.js`, `settings.js`, `utilities.js`, `slicerPane.js`, `printDialogs.js`, `movePanel.js`, `ports/*`, **todo `viewer/`, todo el slicer** |
| Seguridad | `app.py` (1.163), `machine_controlservice.py`, `machine_mock.py`, `permissions.js`, `prePrintCheck.js`, `machineLink.js`, `movePanel.js`, `set_password.py`, `serve_artifact.py`, los 3 contratos, ambos workflows, `launch-viewer.ps1`, `.gitignore`, `pyproject.toml`; parcial god-file y `settings.js` | **el cloud shell dormido (7.797 líneas con su propio `auth.py`/`permissions.py` — código de autenticación sin revisar en el árbol)**, `_slicer_branch` en general, `urdf_viewer/` legacy (44.663 LOC) |
| Rendimiento | módulos de simulación y la ruta de dibujo, con benchmarks sobre el `three` del repo | el resto de la escena bajo carga; el slicer bajo carga |

### 6.2 Qué no se pudo verificar

- **No hay ni una sola medición del frame real del HMI en el panel objetivo.** El revisor de rendimiento no pudo levantar la aplicación (los backends estaban caídos en su ventana); los verificadores sí la levantaron, pero para reproducir hallazgos concretos, no para presupuestar el frame. El factor 2-4× del panel empotrado frente al escritorio **es una estimación, no una medición**. Tampoco se ha verificado si el degradador adaptativo llega a dispararse en uso real, ni cuántos segmentos tiene un toolpath de producción.
- **Ningún test de cobertura de línea en ninguna de las cinco suites.** El ratio ≈1 test / 145 LOC activas es un proxy, no una cobertura.
- **El comportamiento del host WPF .NET no se pudo comprobar**: no está en este repositorio. Todo lo que este informe dice sobre él se deriva de los contratos publicados y de que `contract-http.json` **no describe ningún modo read-only**.
- **N-C4 no tuvo verificación independiente** (una sola comprobación contra el backend real).

### 6.3 La asunción que sostiene media docena de calibraciones

**Este informe asume que el interlock físico y el E-stop de hardware de la M600 funcionan y son independientes de este software.** Es lo que `machineLink.js:34-36` afirma (*"the console is an operator aid, NOT a safety controller… the machine's hardware E-stop and interlocks are the real safety layer and must remain independent of this code"*) y lo que `urdf_viewer.js:12520-12524` repite. **Nadie lo pudo comprobar**: el firmware y el ControlService de la M600 no están en este repositorio.

Si esa asunción no se cumple —si el E-stop de hardware pasa por este software, o si el interlock de puerta depende de la orden que emite la UI— entonces **N-C3 y N-C1 no son 🟠 bajo precondición: son 🔴 hoy**, y el capado de la rúbrica se activaría sobre Seguridad. Verificar esa independencia con el equipo de firmware es más barato que cualquier arreglo de este informe y cambia la severidad de la familia entera. **Es la primera pregunta que debería contestarse.**

> **CONTESTADA — ver §8.1.** La asunción se cumple, y con margen: la electrónica supervisa la presencia del software y cancela por su cuenta si desaparece. Las severidades de este informe se sostienen tal cual, y el filtro queda más nítido — lo que el watchdog no cubre es el software **vivo** mostrando un estado equivocado, que es exactamente lo que describe la familia de §2.1.

Segunda asunción, menor: la calibración de casi todos los hallazgos de seguridad descansa en el **bind loopback**, que sí se verificó, y en que el kiosco es de un solo usuario con presencia física. Cualquier despliegue que exponga `:8090` fuera de `127.0.0.1` invalida la calibración de SEG-2, SEG-3, N-A1 y N-A3 de golpe.

---

## 7. Prioridades

### 7.1 Precondiciones no negociables antes de tocar hardware

Aplica a poner `AVIS_MACHINE_READONLY=0`, a ampliar `_FORWARDABLE`, **y a que el host WPF .NET sirva `hmi/` con forwarding propio** — este último caso es el que reduce las precondiciones de N-C3 a «una recarga de página».

0. **Confirmar con firmware que el E-stop de hardware y el interlock de puerta son independientes de este software** (§6.3). Si no lo son, todo lo demás cambia de severidad.
1. **N-C3 — vías de parada.** Reconciliar `isDockedPrintActive`/`printSim` desde el primer snapshot con `state ∈ {printing, paused}`; que `updateTopbarPrintProgress` y la etiqueta del topbar se alimenten de la telemetría y no solo de la simulación local; y que `navDoorToggle` **nunca** abra la puerta cuando la telemetría dice `printing`.
2. ~~**N-C4 — el `STOP` del operador no puede exigir sesión.**~~ **RETIRADO de las precondiciones — ver §8.2, corrección 4.** El rank es correcto por diseño: `stopPrint` es una parada de proceso *recuperable*, no una acción de seguridad, y exigir identidad de operador es lo que se quiere. Queda un residuo 🟢 de UX en §8.2.1. **No hacer nada de lo que dice esta línea.**
3. **N-C1 — decidir y documentar.** O se conecta un control de parada, o se documenta la ausencia en `ARCHITECTURE.md` (hoy: **cero** menciones de e-stop/emergency/safety) y se alinea `CONTRIBUTING.md:143-147`, que hoy presupone lo contrario. Y se retira el andamiaje muerto.
4. **ARQ-1(b) — el E-stop no puede depender de que un JSON sea legible.** Que `_load_command_levels()` distinga «ausente» de «corrupto», o que los comandos de nivel `none` tengan un camino que no pase por el fichero.
5. **SEG-1 — exponer `rank` en la UI de roles** (~8 líneas). Un administrador no puede autorizar lo que no ve. Alternativa: que el camino de comandos consulte también `role["permissions"]`.
6. **SEG-4 — escritura atómica** (`write` a temporal + `os.replace`) **y distinguir «no hay fichero» de «hay fichero ilegible»**. La ventana de truncado está medida en NTFS.
7. **SEG-7 — acotar `distanceMm`** en `contract.json` mientras siga siendo solo JSON y no haya que tocar dos backends.

### 7.2 Retorno alto y coste bajo (por orden de retorno / línea)

| Arreglo | Tamaño | Cierra |
|---|---|---|
| `AbortController` en `pollOnce`, con el `COMMAND_TIMEOUT_MS` que ya usa `sendCommand` 15 líneas más abajo | **4 líneas** | REN-2 + la etiqueta «Connected» falsa + el desarme silencioso de `haltPrintForError()` |
| `npm audit fix` | **1 comando** | SEG-8 — **la puerta `frontend js checks` está roja ahora mismo**, sin breaking change |
| El `.delete()` que falta en `notificationToastedIds`, copiando las cinco líneas que ya existen para `bellArrivalSeenIds` | **3 líneas** | COD-2 — el canal de toasts deja de quedarse mudo para siempre |
| Guardia de visibilidad en `renderNotificationCenter` (el patrón `stateKey` + early-return ya está en cuatro funciones del mismo fichero) | **~5 líneas** | REN-3 + N-B2, y con ellos la realimentación de COD-1 |
| Memoizar `getStats()` (`printSecondsAt1x` está medido inmutable: 70 ciclos, `[2500]`) | **~6 líneas** | REN-1 y su caso de pausa |
| Desconectar el observador durante `apply()`, o comparar antes de reconstruir | **~6 líneas** | COD-1 + N-B1 |
| Añadir el god-file a `SCAN_ROOTS` y borrar el ViewCube | 244 líneas JS + 8 reglas CSS **borradas** | COD-3 + N-B3 |
| Hacer `check_contract.mjs` bidireccional (declarado ⊆ emitido, con lista de excepciones explícita) | pequeño | N-C6, y evita que N-C1 vuelva a pasar 26 días sin detectarse |
| Un test de una línea que fije el rechazo de `Content-Type: text/plain` en los POST | **1 test** | Convierte el cierre CSRF **emergente** en un cierre defendido |

### 7.3 Medición pendiente antes de decidir

- `performance.mark` alrededor de `getStats()` **en el panel real** con un slice representativo, y el conteo de segmentos de un toolpath de producción. Zanja la calibración de REN-1 (🟡 hoy, 🟠 por encima de ~180k segmentos).
- Si se quiere atacar el arranque: el objetivo son los **139,2 MB de GLB** (`Chassis.glb` 73,3 MB él solo), no el 1,3 MB de `three` duplicado, que **no afecta al arranque** (REN-8, verificado).

### 7.4 Estructural, sin prisa pero con decisión

El ritmo de extracción del god-file no converge, pero la contabilidad de ayer era injusta (omitía 1.064 líneas de test nuevas). La decisión sigue pendiente y es la misma: **vaciar el god-file, o congelarlo y publicarlo como implementación de referencia** —que es lo que el artefacto ya hace— y concentrar el esfuerzo en que los tres contratos sean correctos, que es donde el segundo consumidor se hace daño.

> **Resuelto tras la publicación de este informe** (ver §8): se sigue extrayendo. La decisión trae consigo dos precondiciones que el plan de mejora incorpora — cerrar los namespaces abiertos y aislar el arranque en fases — porque sin ellas cada extracción encarece la siguiente y añade un modo de fallo de arranque más.

---

## 8. Addendum — información posterior a la evaluación

*Añadido el 2026-08-07, después de publicar el informe. Contesta la pregunta abierta de §6.3, corrige cuatro cosas del propio informe y reclasifica dos hallazgos.*

**Ninguna puntuación se mueve, y la comprobación es esta:** las correcciones 2 y 4 retiran N-A2 y N-C4 de los contadores de acumulación 🟡. En Seguridad el contador baja de 16 a 14 y **sigue por encima de 10**, así que el −5 (el máximo de la rúbrica) se mantiene; en Arquitectura baja de 9 a 7 y **sigue sin superar el umbral**, así que el 0 se mantiene. La aritmética del Apéndice A queda literalmente como está.

### 8.1 La pregunta abierta de §6.3, contestada: hay watchdog en la electrónica

El responsable del proyecto confirma que **la electrónica supervisa la presencia del software principal: si el HMI se cierra por cualquier motivo, la electrónica lo detecta, cancela todo y tira la seguridad.**

Eso responde afirmativamente a la asunción sobre la que descansaba media docena de calibraciones de este informe —el interlock de hardware es independiente de este software— y **añade una capa que la evaluación desconocía**. La consecuencia no es que los hallazgos desaparezcan, sino que se afilan en un filtro:

> **El escenario «el software muere» está cubierto por hardware. El escenario «el software vive y muestra un estado equivocado» no lo está por nada.**

Todos los hallazgos de la familia de parada (§2.1) caen en el segundo. N-C3 no describe un software caído: describe un software sano, conectado, con telemetría fresca, que muestra «Connected» sin píldora de progreso mientras la máquina imprime, y cuyo botón de parada abre la puerta frontal. El watchdog no lo ve porque no hay nada que ver: el proceso está vivo y respondiendo.

Y de ahí se sigue algo que conviene decir en voz alta, porque es el resumen más honesto del estado actual: **hoy, la parada por software más rápida y garantizada al alcance del operador es cerrar el navegador.**

Efecto secundario sobre el diseño del aislamiento de arranque: un `boot()` por fases que capture excepciones y continúe **convertiría el caso seguro en el peligroso** (HMI a medias, viva, con el watchdog satisfecho). Las fases deben relanzar tras marcar la app inutilizable; el aislamiento compra diagnóstico, nunca continuación.

### 8.2 Cinco correcciones a este informe, encontradas al planificar los arreglos

Verificadas leyendo el código, después de publicar.

| # | Lo que dice el informe | Lo verificado | Efecto |
|---|---|---|---|
| 1 | La nota 7 de §7 propone arreglar N-C3 «reconciliando `isDockedPrintActive` desde el primer snapshot con `state ∈ {printing, paused}`» | **La recomendación es insuficiente.** `printSimulation.js:641-643` — `play()` devuelve `false` si no hay `source`; `:695-700` — `setProgress()` deja el estado en `IDLE` si no hay `source`. Tras un F5 no hay toolpath cargado, así que el flag se pondría y `printSim.getState()` seguiría diciendo `"idle"` — y los tres consumidores (`updateBottomNavState:10531`, `updateTopbarPrintProgress:10482`, `navDoorToggle:11718`) leen la sim, no el flag | El hallazgo N-C3 **no cambia**; cambia su arreglo. Hace falta un predicado derivado del enlace (`link.isConnected() && state ∈ {printing,paused}`) combinado con el de la sim, nunca un flag enclavado desde telemetría |
| 2 | N-A2 🟡: `homePosition` es «un comando de nombre motriz aceptado sin sesión» que expondría «homing sin login» al host C# | **Parcialmente refutado por el propio contrato**, que lo declara `"motion": false, "note": "camera/scene preset, not machine motion"`. No es homing: es un preajuste de cámara | N-A2 sale de las precondiciones de hardware de §7.1. Queda como renombrado cosmético (`resetCameraHome`) para que un host no se confunda con el nombre |
| 3 | ARQ-3 se presenta como un defecto de contrato | El contrato lo dispara, pero la causa raíz de que sea **invisible** es `machineLink.js:107`: `if (!item \|\| !item.code) continue;` sobre un string hace `continue` mudo | El arreglo son dos cambios en dos ficheros, no uno. Sin el `console.warn`, un host que malinterprete el contrato corregido seguiría sin enterarse |
| 4 | N-C4 🟡: que `stopPrint` exija sesión «muerde en el camino nominal» y es precondición de hardware | **Mal clasificado, aclarado por el responsable del producto.** `stopPrint` para una impresión **de forma recuperable, sin tirar seguridad**, justo para poder reanudarla después: es un comando de proceso, no de seguridad. Exigir identidad de operador es el diseño correcto, no un defecto. La parada de emergencia es el E-stop de hardware, con el watchdog de §8.1 detrás | N-C4 **sale de las precondiciones de §7.1** y `contract.json` no cambia para `stopPrint`. Queda un residuo real pero menor, de UX (§8.2.1) |

| 5 | ARQ-5 🟡: `CONTRIBUTING.md` «no se tocó en la fase C», arrastra **9 rutas rotas** y afirma *"There is no active CI at the repo root… these local commands are the contract"* (`CONTRIBUTING.md:39`) | **Refutado. El texto citado no existe en el árbol evaluado.** Se eliminó en `33bbbc1` (Sprint 1), varios commits antes del HEAD `319406e` que este informe mide. El fichero en HEAD abre su sección de validación con *"**CI is the contract.** `.github/workflows/ci.yml` runs on every PR and `main` is protected behind its three required checks"*, y sus rutas resuelven. Tampoco está en `urdf_viewer/CONTRIBUTING.md` ni en `_slicer_branch/CONTRIBUTING.md` (28 líneas cada uno, sin la frase). El «no build step» del README se fue en el mismo commit | ARQ-5 queda **refutado por completo**: la mitad de `CLAUDE.md` ya lo estaba en verificación, y ésta era la otra. Sale de los tres contadores 🟡 → **Mantenibilidad 75 → 78** (§8.2.2). Global sin cambio |

La corrección 1 es la más costosa: es la que habría hecho perder tiempo a quien siguiera el informe al pie de la letra. La 4 es la más instructiva sobre el método — **la evaluación leyó una decisión de dominio deliberada como un defecto**, por no tener acceso a la semántica del producto. Un revisor externo no puede distinguir «parada recuperable que exige operador» de «parada bloqueada por un permiso mal puesto» solo leyendo el código; los dos se ven igual desde fuera.

La 5 es de otra clase, y merece decirse sin adornos: **es la única corrección en la que el informe cita literalmente un texto que no existe.** Las otras cuatro son lecturas discutibles de código real. Ésta es una cita — con número de línea y comillas — de un fichero que en el commit evaluado dice lo contrario. La verificación adversarial de la fase 3 no la cazó porque ARQ-5 llegó como 🟡 y el protocolo solo verifica 🔴 y 🟠, así que la única parte de ARQ-5 que se verificó fue la de `CLAUDE.md`, que también resultó falsa. Dos de dos. **Corolario operativo: una cita textual de un revisor es una afirmación verificable y barata de comprobar; conviene comprobarla aunque el hallazgo sea 🟡.**

#### 8.2.1 Lo que sí queda de N-C4

Ninguno de los elementos del camino de Stop (`navDoorToggle`, `printStopConfirm`) lleva `data-requires-permission`, pese a que existe una capability `print.control` («Start / pause / stop print») que hoy no gatea nada. Consecuencia: a un operador sin sesión se le ofrece un control que **siempre** va a devolver 401, y el fallo le llega como `Stop command failed: command HTTP 401` (`urdf_viewer.js:10418`). El defecto no es la autorización: es ofrecer una acción imposible y traducir el rechazo a un código HTTP delante de un operador de planta. 🟢, arreglo de una línea de texto.

Y una consecuencia operativa que se sigue de la regla, y que no está escrita en ningún sitio: con **cero usuarios** en el store —el estado de un clon fresco, verificado en este árbol— nadie puede ejecutar una parada recuperable; solo queda la vía de hardware. **`set_password.py --create` no es un paso opcional de puesta en marcha: es precondición para operar la máquina.**

#### 8.2.2 Efecto de la corrección 5 en las puntuaciones

ARQ-5 no llevaba descuento propio —era 🟡— pero figuraba en tres contadores de acumulación, y uno de ellos estaba **justo en el umbral**:

| Dimensión | Contador 🟡 | Regla | Antes | Ahora |
|---|---|---|---|---|
| Arquitectura | 9 → **8** | >10 resta | 0 | 0 (sin cambio) |
| Escalabilidad | 9 → **8** | >10 resta | 0 | 0 (sin cambio) |
| **Mantenibilidad** | 11 → **10** | >10 resta | **−3** | **0** |

Mantenibilidad pasa de `80 − 2 − 3 = 75` a `80 − 2 = 78`. La global se recalcula a **66,05 → 66**: no se mueve. Que un contador cruce su umbral por un solo hallazgo y la global no lo note es, otra vez, el argumento de §5 — el número global promedia el ruido de instrumento hasta hacerlo invisible, y por eso las señales de este informe no están en él.

Las tablas del Apéndice A y de §5 están actualizadas con este resultado. **Ninguna otra corrección de §8.2 mueve una puntuación**: la 1 cambia un arreglo, no un hallazgo; la 2 y la 4 sacan hallazgos de la puerta de hardware sin sacarlos de ningún contador con descuento (Seguridad baja de 16 a 14 🟡 y Arquitectura de 9 a 7, ambas se quedan del mismo lado de su umbral); la 3 añade una causa raíz a un hallazgo que ya descontaba.

### 8.3 Estado de ejecución

Existe un plan de mejora por fases derivado de este informe (7 fases, ~21 PRs, más una puerta con criterio de entrada a hardware que agrupa las precondiciones de §7.1). Lo ejecutado hasta ahora, una rama por PR:

| PR | Cierra | Estado |
|---|---|---|
| Fase 0 — desbloquear el pipeline | SEG-8 | `npm audit --audit-level=high` estaba en rojo y bloqueaba **todo** merge; sale en 0. Además `package.json` gana los scripts `test`/`gate` que `gate.sh` y `ci.yml` duplicaban como glob literal |
| Fase 2.1 — timeout de telemetría | REN-2, puerta H nº 3 | `AbortController` en `pollOnce`, y el primer test que tiene `machineLink.js` (135 líneas, 4 casos). Mutación: quitar el `signal` mata 3 de 4 |
| N-C1 — el E-stop es hardware | N-C1, puerta H nº 9 | Borrado el andamiaje muerto de `MeltioMachine.emergencyStop()` (14 líneas, cero llamadores, que además fallaba abierto devolviendo `false`), escrita la §1.1 de `ARCHITECTURE.md` y corregido `CONTRIBUTING.md`. **Resuelve la contradicción documental que este informe cuenta en §1.1** |
| Fase 1.1 — `contract.json` | ARQ-3, ARQ-1(a), SEG-7, N-A2, N-C5; puerta H nº 7 y nº 8 | `activeCodes` pasa a la forma objeto, `signals` a sus 20 claves, `FEEDER` deja de ser alias de `loadFeeder` y pasa a `driveFeeder`, cota en `distanceMm`, `homePosition`→`resetCameraHome`. Más la causa raíz de la invisibilidad (corrección 3): el `continue` mudo de `machineLink.js` ahora avisa. Test de regresión nuevo |
| Fase 1.2 — `contract-dom.json` | ARQ-2 residuo, SEG-5 residuo, ARQ-8 | El bus de `window` publicado como sección **generada**, separando quién escribe de quién lee. Deja a la vista que `MeltioMachine` no lo provee ningún módulo publicado |
| Fase 1.3 — documentación | ARQ-5 | §3.3.1 de `ARCHITECTURE.md` para el bus de globales. ARQ-5 no necesitaba arreglo: ver corrección 5 |
| Fase 1.4 — puerta 3 inversa | N-C6 | La puerta contrasta ahora el contrato contra el código, no solo el código contra el contrato: **todo alias declarado debe emitirse**. Verde sin sembrar excepciones. La formulación que pedía el plan (*todo `permission:"none"` debe emitirse*) se descartó al llegar en rojo con once excepciones que sembrar |

Cada PR se verificó con las nueve puertas, `pytest apps/dev-host/tests` y el boot check; los que tocan módulos publicados, además contra el artefacto generado.

---

## Apéndice A. Rúbrica y aritmética de puntuaciones

### A.0 Rúbrica aplicada (`evaluacion-severidad`), reproducida literalmente

- **Bandas**: Excelente 90-100 · Buena 75-89 · Aceptable 60-74 · Deficiente 40-59 · Crítica 0-39.
- **Descuentos**: 🔴 confirmado −8 a −15 y **capa la dimensión a ≤59** · 🟠 confirmado −3 a −6 · 🟡 no restan individualmente, pero una acumulación >10 resta hasta −5 · **refutados no puntúan**.
- **Pesos globales**: Seguridad 25 % · Arquitectura 20 % · Código 20 % · Mantenibilidad 15 % · Escalabilidad 10 % · Testing 10 %. **Rendimiento se evalúa y no pondera.**
- **Capado global**: si Seguridad < 40 **o** (Arquitectura **y** Código ambas < 50), la global no puede superar 55.
- **Primaria/secundaria**: cada hallazgo aplica su descuento completo en su dimensión primaria y, cuando el coste en otra es real y distinto, **la mitad redondeada hacia abajo** en **una única** dimensión secundaria. Ningún hallazgo se descuenta en tres dimensiones.

**Dos precisiones de aplicación, para que este informe sea reproducible:**

1. La regla de las tres dimensiones se aplica a los **descuentos individuales** (🔴/🟠 primaria + secundaria). Los contadores de acumulación 🟡 son un mecanismo de **masa crítica por dimensión**, no un descuento por hallazgo, así que un mismo 🟡 puede figurar en más de un contador. Es el mismo criterio que aplicó el informe del 6 de agosto.
2. **Sin hallazgos 🔴 tras verificación**: el único reclamado (COD-1) bajó a 🟠. **Ninguna dimensión queda capada.**

**Aritmética ejecutada, no calculada de cabeza:**

```
Seguridad        base 80 SEG-1 P:-6 SEG-4 P:-5 ARQ-1b/SEG-6 P:-4 N-C3 P:-5 acum:-5 = 55  (prev 59, delta -4)  aporte 13.75
Arquitectura     base 82 ARQ-1a P:-5 ARQ-3 P:-5 SEG-1 S:-3 ARQ-1b/SEG-6 S:-2 N-C3 S:-2  = 65  (prev 61, delta +4)  aporte 13.00
Codigo           base 84 COD-1+N-B1 P:-6 COD-2 P:-4 COD-3 P:-5 REN-3 S:-2 SEG-4 S:-2 acum:-3 = 62  (prev 66, delta -4)  aporte 12.40
Mantenibilidad   base 80 COD-2 S:-2 acum:-3 = 75  (prev 75, delta +0)  aporte 11.25
Escalabilidad    base 78 ARQ-1a S:-2 ARQ-3 S:-2 = 74  (prev 74, delta +0)  aporte 7.40
Testing          base 80 COD-3 S:-2 = 78  (prev 82, delta -4)  aporte 7.80
Rendimiento      base 85 REN-3 P:-5 COD-1 S:-3 = 77  (prev 72, delta +5)  NO PONDERA
pesos suman 1.0
GLOBAL = 65.60 -> 66   (prev 67, delta -1)
capado: no aplica por Seguridad | no aplica por Arq/Cod
```

**Asignación primaria/secundaria de los 10 hallazgos 🟠, comprobada: ninguno aparece en tres dimensiones.**

| Hallazgo | Primaria (completo) | Secundaria (mitad ↓) |
|---|---|---|
| SEG-1 | Seguridad −6 | Arquitectura −3 |
| SEG-4 | Seguridad −5 | Código −2 |
| ARQ-1(b)/SEG-6 | Seguridad −4 | Arquitectura −2 |
| N-C3 | Seguridad −5 | Arquitectura −2 |
| ARQ-1(a) | Arquitectura −5 | Escalabilidad −2 |
| ARQ-3 | Arquitectura −5 | Escalabilidad −2 |
| COD-1 + N-B1 | Código −6 | Rendimiento −3 |
| COD-2 | Código −4 | Mantenibilidad −2 |
| COD-3 | Código −5 | Testing −2 |
| REN-3 | Rendimiento −5 | Código −2 |

### A.1 Seguridad — **55/100** (Deficiente)

| Concepto | Valor |
|---|---|
| **Base: Buena, banda baja** — *idéntica a la del informe anterior, deliberadamente.* Autorización por comando desde un contrato único con auditoría JSONL y `_load_command_levels()` fail-closed; adaptador real read-only con allowlist de dos entradas; PBKDF2 100k **sin oráculo de temporización, medido (31 vs 32 ms)**; CSRF cerrado de facto y verificado; CORS estrecho sin comodín; cookie HttpOnly+SameSite=strict con TTL en servidor; 0 secretos en árbol e historial; 0 path traversal en 10 sondas contra 6 superficies; sin credenciales por defecto; `contract-http.json` con puerta que afirma independientemente la autorización; bind loopback verificado en todos los procesos | **80** |
| **SEG-1 🟠** (primaria) — el rank autoriza y la matriz que ve el administrador no; un rol con `permissions: []` según su propia UI **arranca una impresión**; reproducido con el PUT exacto que emite la interfaz | **−6** |
| **SEG-4 🟠** (primaria) — el almacén de autorización falla **abierto** en seis formas de corrupción, con la ventana de truncado **medida en NTFS** (`observed sizes: [0, 909]`), contradiciendo la regla que el propio fichero enuncia 400 líneas antes | **−5** |
| **N-C3 🟠** (primaria) — con la máquina imprimiendo y la página recargada, ningún control operable por el operador puede enviar `STOP` ni `ESTOP`; el botón abre la puerta; la UI niega que haya impresión. 🟠 bajo la precondición de tocar hardware o de servirse desde el host .NET | **−5** |
| **ARQ-1(b)/SEG-6 🟠** (primaria) — con `contract.json` ilegible la app arranca y **todos** los comandos dan 400, `ESTOP`/`STOP` incluidos. Vector del revisor refutado; el real (JSON corrupto con el árbol sano) es más probable | **−4** |
| **Acumulación 🟡 = 16 > 10 → −5** (el máximo): SEG-2, SEG-3, SEG-5 residuo, SEG-7, SEG-8, SEG-9, SEG-10, SEG-11, N-A1, N-A2, N-A3, N-C1, N-C2, N-C4, N-C5, N-C6. Se aplica −5 y no −4 (como ayer) porque uno de ellos es una **puerta de CI roja ahora mismo** (SEG-8) y cuatro (N-C1/2/4/5) componen entre sí la familia de las vías de parada | **−5** |
| **Total** | 80 − 25 = **55** |

> **Nota de discrepancia.** El revisor de seguridad propuso **54**. La diferencia de un punto viene de que la verificación rebajó SEG-2, SEG-3 y SEG-5 pero añadió N-C3 y las cuatro 🟡 de la familia N-C. Se usa **55**, la aritmética de este informe.

### A.2 Arquitectura — **65/100** (Aceptable)

| Concepto | Valor |
|---|---|
| **Base: Buena, banda media** — *idéntica a la del informe anterior.* Dirección de dependencias limpia y verificada por CI; fronteras `hmi`/`viewer` verificadas correctas; adaptador `ControlServiceMachine`/`MockMachine` usado bien (dos implementaciones reales, ambas ejercitadas); nueve puertas más un boot check que ejecuta la app dentro de un check requerido; tres contratos publicados, uno derivado del código por AST walk con puerta independiente; ratchet de lookups muertos a cero; artefacto ejecutable con test del grafo de imports. No llega a banda alta porque el god-file de 12.535 líneas sigue siendo el centro de gravedad y `create_app()` es una clausura de 698 líneas con 26 decoradores de ruta, 0 `BaseModel`, 0 `Depends`, 0 `APIRouter` | **82** |
| **ARQ-1(a) 🟠** (primaria) — el backend de referencia **incumple el contrato que publica** (`notSupported`/`ackCodes`/`requestId`: 0 ocurrencias fuera de `contract.json`) y el alias `FEEDER` lleva un payload **sin ni una clave en común** con el `loadFeeder` que declara. Conteo corregido a 34/38; los «27 sin handler» no son defecto, el `$comment` los autoriza | **−5** |
| **ARQ-3 🟠** (primaria) — el árbol publicado contiene **dos descripciones contradictorias** de `activeCodes` y **la legible por máquina es la equivocada**; el fault se traga en silencio, reproducido contra el `machineLink.js` real | **−5** |
| **SEG-1 🟠** (secundaria; primaria en Seguridad, −6) — la UI de administración contradice el modelo de autorización | **−3** |
| **ARQ-1(b)/SEG-6 🟠** (secundaria; primaria en Seguridad, −4) — la disponibilidad de la superficie de comandos cuelga de la legibilidad de un fichero | **−2** |
| **N-C3 🟠** (secundaria; primaria en Seguridad, −5) — el estado de la simulación local es la autoridad de un control con función de parada; no hay reconciliación con la telemetría | **−2** |
| Acumulación 🟡 = 8, **no supera 10**: ARQ-2, ARQ-4, ARQ-6, SEG-5 residuo, N-C6, N-C2, N-A2, REN-5. *(Era 9; ARQ-5 sale por §8.2 corrección 5 — no cambia el resultado)* | **0** |
| **Total** | 82 − 17 = **65** |

> **Nota de discrepancia.** El revisor propuso **61**. La verificación bajó a 🟡 dos de sus 🟠 (ARQ-2 y ARQ-4) y corrigió el conteo de ARQ-1. Se usa **65**.

### A.3 Calidad de código — **62/100** (Aceptable)

| Concepto | Valor |
|---|---|
| **Base: Buena, banda media-baja** — *idéntica a la del informe anterior.* 236 tests que pueden ejercitar el JS del HMI, **sin un solo tautológico y verificado por mutación (3/3 muertos)**; valores frontera sistemáticos; comentarios que explican el porqué y nombran el bug histórico; **cero fugas de listeners globales en un god-file de 12.535 líneas**; disposal riguroso incluyendo texturas; dirty-checks reales en cuatro funciones de la barra; 0 TODO, 0 `console.log`, 0 `print(` de depuración | **84** |
| **COD-1 🟠 + N-B1 🟠** (primaria; se puntúan juntos porque son el mismo mecanismo, y por eso −6 y no −5) — el observador de permisos se auto-alimenta **un `apply()` por frame, indefinidamente, desde el arranque**, medido en Chrome real sin estímulo externo; con ratón, un hold ≥150 ms **no genera ningún `click`**; el botón Sign in/Sign out tiene el listener sobre el nodo recreado (`stillAttached: false`). Bajó de 🔴 porque en táctil funciona (15/15) y el coste es 0,44 ms/apply ≈ 2,6 % del hilo | **−6** |
| **COD-3 🟠** (primaria) — 18 lookups muertos exactos fuera del alcance de una puerta que se declara exhaustiva, incluido un ViewCube de **244 líneas** con renderer, escena, texturas por cara, raycasting y cinco listeners que retorna `null` en cada arranque | **−5** |
| **COD-2 🟠** (primaria) — el toast no reaparece **nunca más**, para los ~15 tipos de señal, en un kiosco que no recarga; `.add()` en dos sitios y **cero `.delete()` en 1.449 líneas** mientras su gemelo sí se poda | **−4** |
| **REN-3 🟠** (secundaria; primaria en Rendimiento, −5) — reescribir un `innerHTML` idéntico cada 5 s sin dirty-check es defecto de código antes que de rendimiento | **−2** |
| **SEG-4 🟠** (secundaria; primaria en Seguridad, −5) — escritura no atómica y un `return` que no distingue «ausente» de «ilegible» | **−2** |
| Acumulación 🟡 = 11 > 10 → **−3** (y no −5, porque la mayoría son código muerto y deuda de rutas sin test, sin consecuencia de runtime demostrada, y tres de ellas son la misma clase que COD-3, ya descontado): COD-4, COD-5, COD-6, N-B2, N-B3, N-C1, N-C2, REN-7, SEG-7, N-A3, ARQ-4 | **−3** |
| **Total** | 84 − 22 = **62** |

> **Nota de discrepancia.** El revisor propuso **74** con COD-1 en 🔴. La verificación bajó COD-1 a 🟠 (lo que sube la nota) pero **agravó su mecanismo y añadió N-B1**, y confirmó COD-2 y COD-3 con agravantes. Se usa **62**.

### A.4 Rendimiento *(no pondera)* — **77/100** (Buena)

| Concepto | Valor |
|---|---|
| **Base: Buena** — *idéntica a la del informe anterior.* Puerta de dibujo bajo demanda **enumerando diez fuentes de movimiento**; pixel ratio adaptativo con histéresis y cooldowns separados por dirección; `disposeMaterialWithMaps` que libera todo `isTexture`, en 3 sitios; `boundedQueue(3)` con coalescing por rAF y el O(N²) histórico nombrado en comentario; round-robin presupuestado de raycasts; bed tracking O(1); logs acotados con recorte real; el iframe preservado no consume porque `display:none` suspende su rAF; el backend no bloquea el event loop | **85** |
| **REN-3 🟠** (primaria) — re-render destructivo cada 5 s **con el panel cerrado y sin dirty-check**: 3 reescrituras, **0 veces distinto**; el umbral no es «6+ avisos», es el estado de fábrica (`scrollHeight` 568 > 504); scroll y foco perdidos, reproducidos | **−5** |
| **COD-1 🟠** (secundaria; primaria en Código, −6) — 0,44 ms por `apply()` con CSS real y layout forzado ≈ 2,6 % del hilo principal a 60 Hz, indefinidamente | **−3** |
| Acumulación 🟡 = 8, **no supera 10**: REN-1, REN-2, REN-4, REN-5, REN-6, REN-7, N-B2, N-A1 | **0** |
| **Total** | 85 − 8 = **77** |

> **Nota de discrepancia.** El revisor propuso **72**. La verificación bajó REN-1 y REN-2 a 🟡 (medidos y acotados) y confirmó REN-3. Se usa **77**. Advertencia que acompaña a esta nota: **no hay ni una medición del frame real en el panel objetivo** (§6.2); 77 califica la disciplina verificada del código, no el comportamiento medido del kiosco.

### A.5 Mantenibilidad — **78/100** (Buena)

| Concepto | Valor |
|---|---|
| **Base: Buena** — *idéntica a la del informe anterior.* Documentos autoritativos actualizados con el código; deuda declarada en cero (0 TODO/FIXME/HACK, 0 `console.log` en JS propio, 0 `print(` de depuración); comentarios de decisión que nombran el bug histórico que los motivó; nueve puertas más boot check; `serve_artifact.py` convierte la verificación end-to-end del artefacto en un comando; bus factor 2 con dos personas reales | **80** |
| **COD-2 🟠** (secundaria; primaria en Código, −4) — el comentario de `notifications.js:872-880` afirma literalmente lo contrario de lo que el código hace. Un comentario que miente es peor que ninguno: convierte la revisión en arqueología | **−2** |
| Acumulación 🟡 = **10**, no supera 10: ARQ-2, ARQ-4, ARQ-6, COD-4, COD-5, COD-6, N-B2, N-B3, N-C1 (**`ARCHITECTURE.md` cero menciones de e-stop/safety frente a `CONTRIBUTING.md:143-147`**), N-C6. *(Eran 11, con **−3**; ARQ-5 sale por §8.2 corrección 5 y el contador cruza su umbral a la baja. Éste es el único descuento que la corrección elimina)* | **0** |
| **Total** | 80 − 2 = **78** |

### A.6 Escalabilidad — **74/100** (Aceptable)

| Concepto | Valor |
|---|---|
| **Base: Buena, banda baja** — *idéntica a la del informe anterior.* La partición en dos apps sin import Python cruzado, el contrato host-owned, el puerto de máquina y el artefacto de release autocontenido y ejecutable son las piezas correctas para un segundo consumidor | **78** |
| **ARQ-1(a) 🟠** (secundaria; primaria en Arquitectura, −5) — el defecto es **exportado**: el host C# que mapee `FEEDER → loadFeeder` no recibe el número de alimentador, y no hay `notSupported` que implementar porque el backend de referencia no lo emite | **−2** |
| **ARQ-3 🟠** (secundaria; primaria en Arquitectura, −5) — un consumidor que priorice el contrato legible por máquina sobre un comentario de cabecera **pierde todos los faults** | **−2** |
| Acumulación 🟡 = 8, **no supera 10**: ARQ-2, N-A1 (el host C# reimplementará la ruta de auditoría sin cota, `"audited": true` sin tope), N-A2, N-C4, N-C5, N-C6, REN-1, REN-2. *(Era 9; ARQ-5 sale por §8.2 corrección 5 — no cambia el resultado)* | **0** |
| **Total** | 78 − 4 = **74** |

> **Nota de discrepancia, con el informe anterior.** El informe del 6 de agosto aplicó aquí un `−2` adicional «de ajuste» por el ritmo de extracción (−586 LOC en 4 fases, ~85 fases restantes). **Esta evaluación no lo repite**, porque el verificador midió que esa contabilidad omitía **1.064 líneas de test** añadidas por las mismas cuatro fases a código que no tenía ninguna. El revisor de arquitectura propuso **68**; se usa **74**, y la diferencia es enteramente que ARQ-2 y ARQ-4 bajaron a 🟡 en verificación.

### A.7 Testing — **78/100** (Buena)

| Concepto | Valor |
|---|---|
| **Base: Buena, banda media-alta — 80. Ésta es la única base que se mueve respecto al informe anterior (era 84), y no por un hallazgo nuevo sino por un hecho medido que ayer no se tenía.** A favor: **336 tests ejecutados, 0 fallos** (49 pytest viewer + 8 smoke con servidores reales + 83 slicer con el pipeline real en memoria + 187 node + 9 node slicer); disciplina anti-tautología **verificada por mutación, 3/3 mutantes muertos**, con el razonamiento escrito dentro del test; valores frontera sistemáticos; jsdom sobre el `urdf.html` real, no fixtures sintéticos; test del grafo de imports del artefacto publicado; boot check que ejecuta la aplicación completa dentro de un check requerido. En contra, y por eso no es banda alta: **cero medición de cobertura de línea en las cinco suites** (el ratio ≈1 test / 145 LOC activas es un proxy, no una cobertura) y **7 módulos vivos ≈15.500 líneas sin un solo test** (`urdf_viewer.js`, `printSimulation.js`, `assemblyAnnotations.js`, `calendar.js`, `permissions.js`, `utilities.js`, `machineLink.js`) | **80** |
| **COD-3 🟠** (secundaria; primaria en Código, −5) — las puertas certifican un alcance menor que el que su nombre sugiere: `check_dead_lookups` no mira el **52,5 %** del JS propio y `check_contract` valida en una sola dirección | **−2** |
| Acumulación 🟡 = 5, **no supera 10**: COD-4 (dos mutantes sobreviven a las 336 pruebas, a eslint, a las cuatro puertas **y al boot check**), N-C6, N-B3 (ninguna puerta mira CSS contra markup), N-B2, SEG-8 (la puerta `frontend js checks` está en rojo) | **0** |
| **Total** | 80 − 2 = **78** |

> **Nota de discrepancia.** El revisor propuso **71**, principalmente por el acantilado de cobertura. La verificación bajó COD-4 a 🟡 al comprobar que ambos mutantes viven en una capa que el propio proyecto declara no-frontera de seguridad (con `hasPermission → true` el servidor **sigue rechazando por `rank`**). Se usa **78**, con la base rebajada a 80 en vez de descontar dos veces el mismo hecho.

### A.8 Global — **66/100**

| Dimensión | Nota | Peso | Aporte |
|---|---|---|---|
| Seguridad | 55 | 25 % | 13,75 |
| Arquitectura | 65 | 20 % | 13,00 |
| Calidad de código | 62 | 20 % | 12,40 |
| Mantenibilidad | 78 | 15 % | 11,70 |
| Escalabilidad | 74 | 10 % | 7,40 |
| Testing | 78 | 10 % | 7,80 |
| **Global** | | **100 %** | **66,05 → 66** |

**Capado global:** Seguridad 55 ≥ 40, y (Arquitectura 65, Código 62) ambas ≥ 50 → **no aplica**. Rendimiento (77) se evalúa y no pondera.

**Advertencia sobre este número.** 66 frente a 67 con **el mismo commit** significa que, en las condiciones de esta evaluación, el ruido de instrumento entre dos ejecuciones del mismo pipeline es del orden de ±4 puntos por dimensión, y que la global los promedia hasta casi cancelarlos. **No se debe leer un delta global de 1 punto como una señal.** Las señales de este informe están en §1.1, no en esta tabla.

---

## Apéndice B. Trazabilidad de la verificación

### B.1 Tabla de veredictos

| ID | Reclamada | Veredicto | **Final** |
|---|---|---|---|
| COD-1 — bucle de realimentación del observador de permisos | 🔴 | **AJUSTADO** — mecanismo confirmado y agravado; tesis causal («botón muerto en táctil») **refutada** con 15/15 taps; magnitud inflada (0,44 ms, 2,6 % del hilo) | **🟠** |
| COD-2 — el toast no reaparece nunca más | 🟠 | **CONFIRMADO**, agravado (no es «el segundo E-Stop»: son ~15 tipos de señal y para siempre) | **🟠** |
| COD-3 — 18 lookups muertos fuera del alcance de la puerta | 🟠 | **CONFIRMADO** (18 exacto), con **3 correcciones de evidencia** (CSS: 8 reglas vivas, no 0; wire drum parcialmente vivo; 52,5 %, no 55 %) | **🟠** |
| COD-4 — acantilado de cobertura | 🟠 | AJUSTADO — defecto de proceso, no agujero presente (con `hasPermission → true` el servidor sigue rechazando por `rank`) | **🟡** |
| REN-3 — re-render destructivo de notificaciones cada 5 s | 🟠 | **CONFIRMADO**, agravado (ocurre *out of the box*, con el panel cerrado, 0/3 diferencias) | **🟠** |
| SEG-1 — rank autoriza, la matriz no | 🟠 | **CONFIRMADO**, agravado (camino **100 % UI**: desmarcar el built-in Operator+ y arrancar una impresión) | **🟠** |
| SEG-2 — sin revocación de sesiones | 🟠 | AJUSTADO — mecanismo agravado (B: reasignar rol no surte efecto; F: `--delete` no revoca); escenario reclamado inalcanzable; ventana real = `min(10 min inactivo, 12 h, uptime)` | **🟡** |
| SEG-3 — interlock cliente, override desde `sessionStorage` | 🟠 | AJUSTADO — punto 2 confirmado y agravado (forja abierta en las dos direcciones); punto 1 sin consecuencia alcanzable (`START_PRINT` no está en `_FORWARDABLE`) | **🟡** |
| SEG-4 — el almacén de autorización falla abierto | 🟠 | **CONFIRMADO** en 6 formas de corrupción, con 2 condiciones medidas que **se cumplen por defecto**, y la ventana de truncado observada en NTFS | **🟠** |
| SEG-5 — `canOperateMotion()` fail-open | 🟠 | **REFUTADO** en el escenario (4 razones; decisiva: el D-pad no emite ningún comando de máquina) | **🟢 + residuo 🟡** |
| ARQ-1 (a) — vocabulario canónico no despachado | 🟠 | AJUSTADO — conteo corregido a 34/38, causa raíz distinta (el `$comment` autoriza el contrato ancho), **agravante nuevo**: el backend incumple su propio contrato de ack y el alias `FEEDER` no comparte ni una clave con `loadFeeder` | **🟠** |
| ARQ-1(b)/SEG-6 — el E-stop muere con el contrato ilegible | 🟠 | AJUSTADO — el E-stop **sí** muere; vector `parents[5]` **refutado** (`StaticFiles` revienta antes), vector real distinto y más probable | **🟠** |
| ARQ-2 — `contract-dom.json` ciego | 🟠 | AJUSTADO — hechos ciertos, cadena `isInertPurging`→jog **reproducida**, consecuencia **refutada para el artefacto enviado** (contiene `app.js` verbatim, línea 139 incluida) | **🟡** |
| ARQ-3 — payload de telemetría no descrito | 🟠 | AJUSTADO — escenario reproducido, **tesis causal falsa** (el árbol publicado sí describe la forma), defecto **peor**: contradicción, con la versión legible por máquina equivocada | **🟠** |
| ARQ-4 — extracción bimodal y arranque sin fases | 🟠 | AJUSTADO — censo correcto pero engañoso (372 hoisted); número honesto medido con acorn: **378**; la contabilidad omitía 1.064 líneas de test | **🟡** |
| REN-1 — `getStats()` por frame | 🟠 | AJUSTADO — benchmark **replicado dentro del 10 %**, basura sobreestimada (5,21 MB, no 7,3), agravante real pero acotado a >180k segmentos | **🟡** |
| REN-2 — polling sin timeout | 🟠 | AJUSTADO — mecanismo confirmado y agravado (la etiqueta sigue en «Connected»; desarma `haltPrintForError()`); severidad baja por el flag | **🟡 hoy / 🟠 con `?machine=1`** |
| N-C1 (puntual) — el E-stop por software sin llamadores | 🟠 | AJUSTADO — **documentado como decisión de hardware** (`machineLink.js:34-36`); lo muerto es el andamiaje y lo que falla es la documentación | **🟡** |
| N-C3 (puntual) — la parada del operador depende de la simulación local | 🟠 | AJUSTADO/CONFIRMADO bajo precondición nombrada; literalidad de la tesis corregida; **tres agravantes propios** (el botón abre la puerta; la UI niega la impresión; el host WPF no hereda las mitigaciones) | **🟠 precondición / 🟡 hoy** |

**Totales: 5 confirmados · 11 ajustados · 1 refutado** (más 2 verificaciones puntuales, ambas ajustadas).

### B.2 Hallazgos nuevos aportados por los verificadores

| ID | Sev. | Qué es | Verificación |
|---|---|---|---|
| **N-A1** | 🟡 | Escritura ilimitada al log de auditoría **sin autenticar**: `_append_command_audit` corre para los 12 comandos de nivel `none` y vuelca `args` verbatim sin cota, rotación ni límite de tasa, mientras `PUT /api/permissions/config` sí tiene tope de 512 KB | **Dos verificadores independientes, ambos midiendo**: 900.172 B tras **una** petición; 180,9 MB en 201 peticiones en 2,3 s = **77,6 MB/s sin autenticar**; y 1.000.880 B en 5 peticiones sin cookie |
| **N-A2** | 🟡 | `contract.json` declara `homePosition` con `permission: "none"` — comando de nombre motriz aceptado sin sesión. Muere en el mock por el `.upper()`, pero el contrato es host-owned y el host C# lo implementará. Mismo patrón, menos grave: `setLight` | Anónimo → HTTP 200 + línea de auditoría |
| **N-A3** | 🟡 | `PUT /api/permissions/config` acepta el campo `rank` del cliente **sin validarlo** (rango, tipo, ni tope contra el rank del llamante): un rol con `admin.users` y rank 1 puede subirse a rank 4 | Ejecutado |
| **N-A4** | 🟢 | Deriva docstring/comportamiento en la auditoría: dice *"accepted (authorised + dispatched)"* y audita todo comando **autorizado**. Es lo que hace posible N-A1 | Lectura + N-A1 |
| **N-B1** | **🟠** | El botón **Sign in / Sign out** de Settings se destruye y recrea 60 veces/s, y a diferencia del chip **el listener está sobre el nodo recreado** (`permissions.js:299/:301`): no hay elemento estable que recoja el clic. COD-1 en su forma más grave | `stillAttached: false` medido en Chrome real |
| **N-B2** | 🟡 | `updateNotificationFilterCounts()` reescribe el `innerHTML` de los 4 chips de filtro cada 5 s sin diff y **realimenta el observador de COD-1**: los dos hallazgos se alimentan mutuamente. Ninguno de los dos revisores lo vinculó | Ejecutado |
| **N-B3** | 🟡 | **8 reglas CSS muertas** del ViewCube (`urdf_viewer.css:188, 198, 203, 1985, 1992, 1997, 2092, 2093`). **Ninguna puerta mira CSS contra markup** | Grep case-insensitive, corrigiendo al revisor |
| **N-B4** | 🟢 | `window.ENABLE_NOTIFICATION_MOCK_SIGNALS` no se pone a `true` en ningún sitio: `updateMockNotificationSignals()` (25 líneas) es código muerto en cualquier despliegue. Relevante para REN-3: **la lista no rota por sí sola**, lo que hace aún más gratuita la reescritura | Barrido del árbol |
| **N-C1** | 🟡 | El E-stop por software no tiene ningún llamador (ver B.1) | Barrido exhaustivo: JS, `urdf.html`, atajos de teclado, CSS, UI del slicer, artefacto de release |
| **N-C2** | 🟡 | **Seis wrappers de `machineLink` muertos** (`disarm`, `home`, `clearFault`, `jog`, `feeder`, `sendCommand`; siete en la práctica). El desacople es en **ambas direcciones**: `onMachineTelemetry` nunca lee `snap.position`. Con `?machine=1`, la pose en pantalla ni la mueve la máquina ni el operador mueve la máquina | D-pad ejecutado con módulo real sobre `urdf.html` real y `fetch` espiado: 5 pulsaciones → **6 `moveJointToValue`, 0 peticiones al servidor** |
| ~~**N-C4**~~ | **🟢 reclasificado (§8.2 c.4)** | Los hechos son exactos —`stopPrint` es `permission: "operator"` y sin sesión da 401— pero **la lectura era errónea**: es una parada de proceso *recuperable*, no de seguridad, así que exigir operador es el diseño y no el defecto. Residuo: el control no está gateado por `print.control` y el rechazo se muestra como código HTTP | POST sin sesión → `{"detail":"Sign in to control the machine"}` HTTP 401 |
| **N-C5** | 🟡 | `MeltioErrors.raise` tiene **un solo llamador** y es la telemetría (`machineLink.js:112`). Si el adaptador real no rellena `activeCodes`, la última parada automática por software tampoco existe | Conteo de call-sites |
| **N-C6** | 🟡 | `check_contract.mjs` es **unidireccional** (*emitido ⊆ declarado*). Un comando declarado con autorización especial que nadie emite es invisible para las nueve puertas y el boot check. Para que N-C1 no vuelva, la puerta debe comprobar también la dirección contraria | Lectura del script |

### B.3 Correcciones de los verificadores a los revisores

Se listan aparte porque son la medida de cuánto fiarse de la fase 2.

| Reclamación del revisor | Corrección verificada |
|---|---|
| «El botón del chip está muerto en táctil» | **Refutado**: 15/15 taps (`Input.dispatchTouchEvent`, holds 30/80/150/300/600 ms × 3) abren el modal |
| «El botón se destruye» | **Refutado**: `installAccountChip()` está guardado; `chipIsSameElementAsBoot: true`. Lo que se recrea son los hijos |
| «Un `pointerup` cae entre el `innerHTML=""` y el `append`» | **Imposible**: `apply()` es síncrona y JS es monohilo |
| «27 rotos + 11 que solo funcionan por alias» | **34/38**: `jog`/`home`/`arm`/`disarm` despachan por su nombre canónico |
| «`grep -c viewCube urdf_viewer.css` → 0» | **Falso**: el grep era case-sensitive. **8 reglas vivas** |
| «El wire drum está muerto entero» | **Parcial**: `wireDrumAppearButton` tiene listener vivo (`:11298`) |
| «El gate no mira el 55 % del JS» | **52,5 %** (12.535 frente a 11.336) |
| «El vector es `parents[5]`» | **Refutado**: `StaticFiles` revienta antes. Vector real: `contract.json` corrupto con el árbol sano |
| «El admin borra un usuario y la cookie sigue viva 12 h» | El escenario **no existe en la UI**; la forma fuerte es `set_password.py --delete`, y la ventana es `min(10 min inactivo, 12 h, uptime)` |
| «Sin `MeltioPermissions` el jog queda abierto» | **Refutado**: el módulo sí está en el artefacto, el boot check lo exige, está testeado como intencional, y **el D-pad no emite ningún comando** |
| «El esquema de `activeCodes` solo vive en `machine_mock.py`» | **Falso**: `machineLink.js:21` y `notifications.js:228-253` lo describen y están publicados. El defecto es peor: contradicción |
| «Bloquea toda impresión sin pista de qué falta» | **Refutado**: `prePrintCheck.js:67` nombra las claves ausentes |
| «7,3 MB de basura por 10 s» | **5,21 MB** con GC forzado (`9105 B/call`) |
| «Se nota con 6+ avisos» | **Con las 3 de fábrica**: `scrollHeight` 568 > `clientHeight` 504 |
| «336 tests pueden ejercitar el JS del HMI» | **236** (187 node + 49 pytest); los 83 del slicer no ejecutan JS del viewer |
| «El artefacto no cablea `isInertPurging`» | **Sí lo cablea**: `app.js` es `urdf_viewer.js` verbatim, línea 139 incluida |
| «1.119 sentencias top-level» | 1.121 con acorn; el número **honesto** (las que llaman a algo en carga) es **378** |
| «−586 LOC netas en 4 fases» | Cierto, pero omite **+1.064 líneas de test** a código que no tenía ninguna |
| «`getStats()` cuesta 6 ms en el caso común» | Replicado: 3,4 ms a 100k, 8,2 ms a 250k. Real pero acotado: solo cruza el umbral del degradador por encima de ~180k segmentos |
