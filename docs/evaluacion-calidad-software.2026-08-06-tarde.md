# Evaluación de calidad de software

> Fecha: **2026-08-06 (tarde)** · Proyecto: Meltio WebUI (HMI operador M600-PRO — `avisualizer` + `meltio-platform`) · Modo: **profunda** (detección tecnológica + 4 revisores + verificación adversarial en 3 lotes + 1 verificación puntual) · Evaluación anterior: **2026-08-06 (mañana)**, global 57/100 · HEAD evaluado: `319406e`, rama `release`: `f383a77`

> **Nota de método, que condiciona cuánto fiarse de este informe.** Los agentes especializados que la evaluación anterior utilizó (`detector-tecnologia`, `revisor-*`, `verificador-hallazgos`, `documentador-evaluacion`) **ya no existen en este entorno**: `.claude/agents/` solo contiene los del flujo `/feature`. Esta evaluación se ejecutó con agentes genéricos a los que se dio el rol por prompt, y la rúbrica se reprodujo literalmente desde el Apéndice A del informe anterior, que la documenta completa. El pipeline y la aritmética son los mismos; el juicio de los revisores no proviene de las mismas definiciones. Las puntuaciones son comparables **con reservas**.

> **Ámbito y método.** 18 hallazgos 🔴/🟠 pasaron por verificación adversarial con instrucción explícita de **refutar**: **9 confirmados, 7 ajustados, 2 refutados**. La verificación produjo 7 hallazgos nuevos; los dos propuestos como 🟠 se verificaron por separado y **ambos bajaron a 🟡**, uno con su atribución histórica refutada. Las severidades de este informe son las **posteriores** a la verificación. Tres de los cuatro revisores y los tres verificadores ejecutaron código (TestClient sobre la app real, jsdom sobre el `urdf.html` real, benchmarks con el `three` vendorizado del propio repo).

---

## 1. Resumen ejecutivo

Entre la evaluación de esta mañana y esta se mergearon **11 PRs (#35–#45)** en un día: el arreglo de un crash que tenía el HMI muerto en el arranque desde el 4 de agosto, un *boot check* que carga la aplicación en Chrome headless dentro de un check requerido, cuatro extracciones de dominio del god-file, un tercer contrato publicado (`contract-http.json`, generado desde el backend con puerta propia), y un artefacto de `release` que pasó de ser un montón de piezas a una carpeta que arranca sin Python.

**La nota global sube de 57 a 67.** Es el mayor salto de las tres evaluaciones y, a diferencia del +1 anterior, sí refleja lo que se hizo. Pero el reparto importa más que el número:

| Sube fuerte | No se mueve |
|---|---|
| Testing **+26** · Mantenibilidad **+21** · Arquitectura **+15** | Seguridad **+1** |

**El trabajo del día fue de proceso y verificación, y ahí el resultado es inequívoco.** El defecto que hizo posible el crash del 4 de agosto —que ninguna de las nueve puertas arranca la aplicación— está cerrado con un check que sí lo hace, bloqueante, y cuya cobertura se demostró rompiendo un test a propósito para comprobar que el boot check seguía ejecutándose. La suite JS pasó de 98 a 187 tests, y la revisión de código los ejecutó y **no encontró un solo test tautológico** — hay evidencia escrita en los propios tests de que el problema se atacó a conciencia (`materialsState.test.mjs` fija el umbral al literal `500` y no a la constante importada, con el razonamiento anotado).

**Seguridad no se mueve, y la razón hay que decirla sin rodeos.** Los tres 🟠 que la evaluación anterior encontró se arreglaron esta mañana. La verificación de esta tarde encontró otros tres, todos en la capa de autorización, todos **reproducidos ejecutando**:

- **SEG-1** — el servidor autoriza comandos de máquina **solo por `rank`**, y el único UI que crea roles cablea `rank: 2` sin exponerlo nunca. Un rol con `permissions: []` obtiene 200 en `ARM`, `HOME`, `CLEAR_FAULT` y **`START_PRINT`**. Un administrador que desmarque `machine.motion` en la matriz cree haber cerrado el movimiento y no lo ha hecho, sin ningún control para verlo ni corregirlo.
- **SEG-2** — no existe ninguna vía de revocación de sesiones. Borrar un usuario le deja la cookie viva 12 horas; si era administrador, conserva escritura sobre `admin.users` y puede recrearse el rol.
- **SEG-3** — el interlock pre-impresión es 100 % cliente y su override se autoriza leyendo `sessionStorage` sin validar contra el servidor. Peor: falsificar `{roleId:"role_admin"}` no se sanea, se **enriquece** con los permisos reales del rol.

Ninguno tiene consecuencia física hoy —enlace a máquina apagado por defecto, adaptador real read-only con dos comandos reenviables—, y por eso SEG-1 bajó de 🔴 a 🟠. Los tres son **precondición no negociable** antes de `AVIS_MACHINE_READONLY=0`.

**¿Es mantenible?** Sí, y con margen. Los documentos autoritativos se actualizaron el mismo día que el código, la deuda declarada sigue en cero (0 TODO, 0 `console.log` en código propio) y los comentarios explican el *porqué* de las decisiones defensivas, lo que hace la revisión verificable en vez de arqueológica. El lastre es el god-file de 12.535 líneas con 137 globales mutables, y `hmi/notifications.js`: 1.449 líneas dentro de una sola función con el cuerpo a indentación cero.

**¿Es escalable el proceso de extracción? No al ritmo actual, y es el hallazgo más incómodo del informe.** Contabilidad neta de las cuatro fases del día, medida por el verificador:

| Fase | god-file | Δ | LOC añadidas a `hmi/` |
|---|---|---|---|
| B3d movePanel | 13121→13038 | −83 | +161 |
| B3e printFlowState | 13038→13030 | **−8** | +117 |
| B3f slicerPane | 13030→12721 | −309 | +391 |
| B3g printDialogs | 12721→12535 | −186 | +247 |

Cada fase añade más líneas de las que retira; a este ritmo faltan ~85 fases. El verificador ajustó con justicia la tesis del revisor —convertir acoplamiento implícito en explícito normalmente es mejora— pero confirmó que al menos una extracción (`hmi/materials.js:1158`) **escribe en el estado del host** a través de la referencia inyectada: ahí el acoplamiento se renombró, no bajó.

**¿Es correcto lo que se publica al consumidor?** El host WPF .NET+WebView2 **no llevará Python** y reimplementará el backend leyendo los contratos. De los tres publicados, el generado desde el código (`contract-http.json`) es preciso y se comprobó ruta por ruta. Los otros dos no:

- **`contract.json` describe un sistema que no existe.** Declara comandos canónicos en camelCase y ambos backends hacen `command.upper()` antes de despachar: `"startPrint".upper()` es `"STARTPRINT"`, que no está en ningún mapa. **34 de los 38 nombres canónicos se rechazan como desconocidos**; los cuatro que funcionan (`jog`, `home`, `arm`, `disarm`) lo hacen por accidente léxico, por ser palabra única en minúscula. Entre los rotos está **`emergencyStop`**, el único con `permission: "none"`, el que debe funcionar siempre. Además el `envelope`, los 7 `ackCodes` y los 17 mensajes del canal `viewer` tienen **cero ocurrencias** en todo el árbol, y el `$comment` de ese canal describe la topología del iframe invertida.
- **`contract-dom.json` es ciego al bus de globales que sí es carga-portante.** `grep -c Meltio` sobre los tres contratos da `0 0 0`, mientras `window.Meltio*` se usa 34 veces. Consecuencia ejecutada: sin ese global, `canOperateMotion()` de `hmi/movePanel.js` devuelve `true` — **el jog queda permitido para todos los roles**, en silencio, siguiendo el manifiesto al pie de la letra.

**¿Indicios de generación por IA con consecuencias?** Sí, de una clase específica que conviene nombrar porque es la que queda cuando ya se limpiaron las otras: **defensas a medio implementar**. El servidor se protege de vaciar el documento de permisos pero no de vaciar el array de usuarios. La puerta de lookups muertos declara el problema erradicado —`KNOWN_DEAD = new Set([])`, *"EMPTY, and it should stay that way"*— y **no mira el fichero donde vive el 60 % del JS**, en el que quedan 18 lookups muertos incluido un ViewCube de 310 líneas que nunca tuvo markup ni CSS. La campana de notificaciones poda su set *"para que vuelvan a sonar si se repiten"* y el toast hermano no, así que un fallo crítico recurrente solo produce toast la primera vez. En cada caso la intención correcta está escrita en un comentario y la cobertura se queda a un paso.

Y una contradicción documental introducida el mismo día: el README que `release.yml` publica en el submódulo del consumidor afirma que el `data-app-entry` está vacío y que `urdf_viewer.js` *"is not published"*, mientras en el mismo árbol está `app.js`, 435 KB, que es exactamente ese fichero.

| Dimensión | Puntuación | Estado | Δ vs. mañana |
|---|---|---|---|
| Arquitectura | 61/100 | 🟡 | **+15** |
| Calidad de código | 66/100 | 🟡 | +4 |
| Seguridad | 59/100 | 🔴 | +1 |
| Rendimiento *(no pondera)* | 72/100 | 🟡 | −12 |
| Mantenibilidad | 75/100 | 🟢 | **+21** |
| Escalabilidad | 74/100 | 🟡 | +6 |
| Testing | 82/100 | 🟢 | **+26** |
| **Global (ponderada)** | **67/100** | 🟡 | **+10** |

*(Umbrales: 🟢 ≥75, 🟡 60-74, 🔴 <60. Rendimiento se evalúa y no pondera. Aritmética auditable en el Apéndice A.)*

**Sobre la caída de Rendimiento (−12): no es una regresión, es que esta vez se midió distinto** — y hay una contradicción abierta con la evaluación anterior que se documenta en §2.4. La evaluación anterior degradó su hallazgo REN-1 *tras medición* a 0,04–0,2 ms; esta lo midió en 6,08 ms en el mismo escenario. Una de las dos mediciones está mal y **no se ha resuelto**: la diferencia está en si el payload térmico está normalmente presente.

---

## 2. Hallazgos confirmados (posteriores a verificación)

### 2.1 Los tres que bloquean el hardware

**SEG-1 🟠 CONFIRMADO (reclamado 🔴) — Rank y capability keys divergen**
`hmi/permissions.js:477` · `apps/dev-host/src/avisualizer/web/app.py:1049-1060`

`machine_command` compara únicamente `role["rank"]`; `role["permissions"]` no se consulta jamás en el camino de comandos. `renderRoles()` crea roles con `rank: 2` cableado y la pestaña Modes solo expone nombre y borrar. Reproducido con un rol creado tal cual lo crea el producto:

```
login nobody: 200  permissions=[]
  ARM -> 200 · HOME -> 200 · CLEAR_FAULT -> 200 · START_PRINT -> 200 · ESTOP -> 200
  JOG -> 403   (única negativa: pide rank 3)
```

Ajustado a 🟠 porque hoy aterriza en el mock. **🔴 el día que se amplíe `_FORWARDABLE` o se ponga `AVIS_MACHINE_READONLY=0`.** El host C# heredará el agujero: el contrato publica `permission` por comando, pero el rank que lo satisface no es configurable desde ninguna interfaz.

**SEG-2 🟠 CONFIRMADO y más amplio de lo reportado — Sin revocación de sesiones**
`app.py:584-600, 737-776`

```
bob login (rank 4): 200 ; bob HOME -> 200
admin borra a bob -> 200 ; usuarios en disco: ['adm']
bob RE-LOGIN: 401                                   <- correcto
bob HOME / JOG / START_PRINT con cookie viva -> 200 200 200
bob puede seguir haciendo PUT de la config (admin.users)? 200
```

Rotación de contraseña vía `set_password.py`: `adm` con la cookie previa sigue en 200. `_sessions` solo se toca en cinco sitios y ninguno purga al editar el store. TTL verificado real y funcional (12 h), pero es el único límite.

**SEG-3 🟠 CONFIRMADO — Interlock pre-impresión 100 % cliente, override desde `sessionStorage`**
`hmi/prePrintCheck.js:300` · `urdf_viewer.js:5130, 5136-5139` · `hmi/permissions.js:135-143, 187`

Cadena verificada entera. El override no sale del navegador: `console.warn` y `startDockedPrint()`. `machine_command` no consulta ninguna señal de seguridad. Precisión añadida por el verificador: `init()` **re-hidrata** `currentUser.permissions` desde el rol servido por el servidor, así que falsificar `{roleId:"role_admin"}` en `sessionStorage` no se sanea — se enriquece con los permisos reales, incluido `setup.network`. Acceso avanzado completo sin contraseña.

El módulo `prePrintCheck` es **fail-closed por diseño y bien hecho** (una señal no reportada es un fallo con motivo propio); el problema es dónde se aplica, no cómo evalúa.

### 2.2 Los dos contratos que engañan al consumidor

**ARQ-1 🟠 CONFIRMADO y agravado — `contract.json` describe un sistema que no existe**

```
Nombres canónicos que el mock RECONOCE: ['jog','home','arm','disarm']
Nombres canónicos RECHAZADOS como desconocidos: 34
  (startPrint, pausePrint, resumePrint, stopPrint, clearFault, emergencyStop, slice, ...)
Los 11 alias legacy: todos reconocidos
```

La capa de autorización (`app.py:113-133`) **sí** acepta camelCase; el despacho (`app.py:1064` → `command.upper()`) no. `check_contract.mjs` no lo ve porque solo valida *emitido ⊆ declarado*, en una dirección. Grep de `notAuthorized`/`invalidState`/`invalidArgs`/`machineFault`/`requestId` fuera de `contract.json`: cero. Grep de los 17 mensajes del canal `viewer` en `hmi/`, `viewer/`, `apps/dev-host/src` y `_slicer_branch/projects`: cero ficheros.

**ARQ-2 🟠 CONFIRMADO (los 4 subpuntos) — `contract-dom.json` ciego a acoplamientos reales**

Escenario del jog, ejecutado:
```
sin MeltioPermissions      -> true    <- permite el jog
permisos deniegan          -> false
objeto presente, sin can() -> true    <- también permite
```
Cinco ficheros publicados ausentes del manifiesto (`permissions.js`, `error_codes.js`, `i18n/index.js`, `i18n/en.js`, `robot/urdfRobot.js`): 30 `.js` publicados, 25 en el manifiesto. `hmi/permissions.js` cae fuera porque usa `querySelector` (4) y cero `getElementById`, y no exporta ningún `initXxx`/`createXxx` — es un script clásico. Falso positivo confirmado: `toolpathTubes.js` publica como `injectedDeps` lo que son campos de un `options = {}` de una función pura.

**ARQ-4 🟠 CONFIRMADO contra la rama publicada — El README contradice a su propio generador**

`git show FETCH_HEAD:README.md`, vivo hoy en `release`: *"Its `data-app-entry` script is deliberately EMPTY — the wiring lives in the dev host's `urdf_viewer.js`, which is not published."* En el mismo árbol, `index.html:1485` es `<script type="module" data-app-entry src="./app.js">` y `app.js` pesa 445.527 bytes. Secundarios: `release.yml:84` dice *"eight-gate check"* (son nueve) y `gen_artifact.mjs` referencia tres veces `tools/gen_shell.mjs`, que no existe — una de ellas inyectada como comentario en el `index.html` publicado.

### 2.3 Los dos que fallan en silencio

**COD-2 🟠 CONFIRMADO (18 exacto) — Lookups muertos fuera del alcance de la puerta**

```
ids en html=344 | lookups literales en urdf_viewer.js=143 | MUERTOS=19
  (18 genuinos; printNotice se crea en runtime)
```
`gen_dom_contract.mjs:25` define `SCAN_ROOTS = ["hmi","viewer"]`. Entre los muertos, un **ViewCube completo** (`urdf_viewer.js:1470-1780`, ~310 líneas: renderer secundario, texturas de etiqueta por cara, raycasting, cuatro listeners) cuyo controlador retorna `null` en la línea 1552. `grep -c viewCube urdf_viewer.css` → 0; en el `index.html` publicado → 0. Nunca hubo markup.

**COD-3 🟠 CONFIRMADO con reproducción — Un fallo crítico repetido solo produce toast la primera vez**

`bellArrivalSeenIds` se poda deliberadamente (*"so they ring again if re-raised"*); `notificationToastedIds` recibe `.add()` en dos sitios y **cero `.delete()` en 1.449 líneas**. Reproducido bajo jsdom con el módulo real:
```
1ª aparición del E-stop : toasts=1  campana=true
el fallo se resuelve    : store = ['signal-emergency_estop:resolved']
MISMO fallo se repite   : toasts=0  campana=true
```
La campana suena y el toast no: prueba directa de que la causa es la asimetría entre los dos sets.

### 2.4 Los dos de rendimiento que sobrevivieron

**REN-1 🟠 CONFIRMADO — `getStats()` por frame durante toda la impresión**
`urdf_viewer.js:10898` (fuera de la puerta de dibujo de `:10931`) → `printSimulation.js:804-848`

Medido replicando ambos bucles con el `three` del repo, mediana de 10 pasadas:
```
segments=  10000 | heightLoop 0.102 ms | thermalLoop  0.954 ms | total/frame  1.056 ms
segments= 100000 | heightLoop 0.482 ms | thermalLoop  5.600 ms | total/frame  6.083 ms
segments= 500000 | heightLoop 2.021 ms | thermalLoop 28.606 ms | total/frame 30.627 ms
```
**También corre en pausa**, donde no se dibuja nada.

> **⚠ Contradicción abierta con la evaluación anterior.** Aquel informe degradó este mismo hallazgo *tras medición*: «0,04–0,2 ms incluso a 100k segmentos; caso común ≈0,12 ms/frame. Solo el caso con simulación térmica grande llega a ≈2,7 ms». Esta medición da **6,08 ms a 100k**, treinta veces más. La diferencia está en el bucle térmico (dos `Map.set` por segmento): la evaluación anterior lo trató como caso excepcional, esta sostiene que `getSlicerThermal` está cableado a `bridgedSliceData.thermal`, que se rellena en **cada** bridge de slice y no está condicionado a la vista Thermal. **No se ha resuelto cuál es correcta.** Un `performance.mark` alrededor de `getStats()` en la máquina real, con un slice representativo, zanja la duda en diez minutos y debería preceder a cualquier refactor. Mientras tanto, la severidad 🟠 se sostiene por el hecho estructural (trabajo O(segmentos) sin memoizar, por frame, fuera de la puerta de dibujo), no por la magnitud.

**REN-5 🟠 CONFIRMADO con demostración — El polling de telemetría no tiene timeout**
`hmi/ports/machineLink.js:127-146`

`sendCommand` usa `AbortController` con 8 s; `pollOnce` hace `fetch` pelado. Contra un servidor que acepta y nunca responde:
```
Tras 6 s con el endpoint colgado (cadencia 500 ms):
  pollOnce() lanzados  : 1  (esperados ~12)
  .finally() ejecutados: 0
  -> el bucle de telemetría está MUERTO: nunca se reprograma
```
`disconnect()` no se llama en ningún sitio del host y no hay watchdog.

**Composición peligrosa (hallazgo nuevo N-C2):** con el fetch colgado el `catch` tampoco corre, así que no se escribe `internetConnected: false` ni se emite `DISCONNECTED` — **la topbar sigue diciendo "Connected"** mientras `isConnected()` devuelve `false` a los 3 s. Etiqueta engañosa, cero notificación de pérdida de enlace, y el checklist de pre-impresión en verde sobre booleanos congelados. Un `AbortController` en `pollOnce` cierra los dos agujeros a la vez.

---

## 3. Refutados y ajustados — el valor de la verificación

**COD-1 🔴 → REFUTADO** (escenario), residual 🟡. El revisor reportó que guardar la matriz de permisos borra todas las credenciales, y lo había ejecutado. Se saltó `hmi/permissions.js:378-383`: `openAdmin()` **re-hace `loadConfig()` ya autenticado** antes de renderizar, con un comentario que existe exactamente para eso. Flujo real reproducido:
```
boot loadConfig (anon)        -> users: []
login adm: 200
openAdmin loadConfig (authed) -> users: ['op','adm','bob']
PUT: 200 | usuarios en disco: ['op','adm','bob'] | re-login bob: 200
```
Residual real: la guarda del servidor sigue siendo `and`, y `loadConfig()` traga excepciones en silencio, así que un fallo de red transitorio en ese refetch dejaría el store vacío en el Save siguiente. Arreglo de una línea.

**REN-2 🟠 → REFUTADO**, residual 🟡. El *layout thrashing* dentro del bucle de ítems no ocurre: la línea 714 es **inalcanzable** para los tres ids definidos (el guard es una tautología por id). El único llamante vivo por frame es el overlay del feeder, con un reflujo real y el `transform` memoizado.

**SEG-4 🟠 → 🟡.** Los hechos son exactos (`/api/slice/proxy` es la única ruta mutante sin autorización, y el contrato la publica como `auth.kind:"none"`), pero poner un check ahí no cierra nada: el `/api/load` del propio slicer tampoco tiene auth y escucha en el mismo loopback. Queda la inconsistencia de contrato, que sí importa para el host C#.

**REN-3 🟠 → 🟡.** `computeObjectLocalBounds` no recorre el robot entero y reutiliza `geometry.boundingBox` cacheado. Medido con el grafo real (481 `Object3D`, 454 mallas): **0,075 ms/frame**, el 0,45 % del presupuesto.

**REN-4 🟠 → 🟡, con un daño distinto.** El coste de CPU es del 0,06 % del tiempo y el agravante reclamado (crecimiento sin cota) es falso: `mergeSignalNotifications` sí purga. Pero el verificador encontró lo que el revisor no nombró:
```
centro ABIERTO, foco en el botón de una tarjeta
tras el tick de 5 s: foco PERDIDO -> <body>, nodos reconstruidos
```
En un panel táctil, cada 5 segundos se destruyen los nodos bajo el dedo del operador.

**COD-4 🟠 → 🟡** y **COD-5 🟠 → 🟡**. El primero porque `startDockedPrint` no emite ningún comando con el enlace caído (el daño es una impresión fantasma local y un checklist engañoso, no una orden a la máquina). El segundo porque las cuatro convenciones de inyección **tienen razón documentada** (live bindings durante una migración incremental) y el verificador probó el generador contra los 30 ficheros publicados sin un solo desajuste: 🟠 exige consecuencia y no la hay.

**ARQ-3 🟠 ajustado en la tesis, mantenido en severidad.** «El acoplamiento total aumenta» es interpretación; lo demostrado sin interpretación es que el ritmo no converge y que `materials.js` conserva escritura sobre el estado del host.

**Los dos hallazgos nuevos propuestos como 🟠, ambos bajados a 🟡 en verificación puntual:**
- El sistema de callouts flotantes de anotaciones (149 líneas más cinco helpers) es **inalcanzable**: el guard es una tautología por id, confirmado ejecutando las 16 combinaciones con un control positivo. Pero la atribución a un commit de hoy es **falsa** — es byte-idéntico desde el commit inicial (`b3b6de8`, 11 de julio); `git log -L` solo señalaba el commit de extracción porque creó el fichero. Nació muerto: no hay regresión.
- `hmi/error_codes.js:134` falla abierto y en silencio sin `window.MeltioMachine` (verificado: `haltCalled: false`, 0 logs), y `haltPrintForError` es una parada real, no cosmética. Pero hoy el global siempre está presente porque se asigna en el top-level del mismo `app.js`. Es 🟡 hoy y sube el día que alguien sustituya `app.js`, camino que el README del artefacto invita explícitamente a tomar.

---

## 4. Lo que está bien hecho y no hay que tocar

No es cortesía: son decisiones por encima de la media que una refactorización descuidada puede arrastrar.

- **El boot check** (`tools/check_boot.mjs`) dentro de un check requerido, con `if: ${{ !cancelled() }}` en cada paso para que un pytest rojo no lo silencie. Aprende del manifiesto cuántas mallas esperar en vez de asumir «al menos una», no tiene lista de *known bad*, y afirma los bridges `window.Meltio*`. Su razonamiento está documentado en `ci.yml:11-32`, la mejor pieza de documentación arquitectónica del repo.
- **`tests/js/artifact.test.mjs`**: camina el grafo de imports del artefacto publicado desde `app.js` resolviendo el import map, y verifica que el generador **falla** en vez de adivinar cuando el marcado del entry cambia.
- **La disciplina anti-tautología en los tests**, con el razonamiento escrito dentro del propio test. Los 187 pasan (3,2 s, ejecutados durante la revisión).
- **`ControlServiceMachine` read-only por defecto** con allowlist de dos comandos. Es el mejor fail-safe del repositorio y hoy es lo que sostiene la seguridad real del sistema.
- **`_load_command_levels()` falla cerrado**: sin `contract.json` devuelve `{}` y todo comando es 400. Un fichero de autorización ausente no significa «permitir».
- **Auditoría JSONL de todo comando aceptado**, incluidos los rechazados por la máquina.
- **`contract-http.json` generado desde el backend**, con puerta en pytest que afirma **de forma independiente** que las tres rutas con autorización siguen exigiéndola — validado mutando `app.py`: quitar `_require_permission`, la auditoría o el throttle se detectan los tres. Es el modelo que los otros dos contratos deberían seguir.
- **Render on-demand, pixel-ratio adaptativo con histéresis, y disposal riguroso** incluyendo texturas por reflexión. Los cuatro modos de fallo clásicos de «kiosco en turno largo» están cubiertos: no hay fuga de memoria no acotada, ni de listeners, ni disposal ausente, ni bloqueo del event loop.
- **`check_dead_lookups.mjs` con `KNOWN_DEAD` vacío** y el comentario que prohíbe ampliarlo. Su defecto es el alcance (COD-2), no el diseño.
- **Path traversal cerrado y verificado empíricamente**; cero secretos en el árbol; CORS acotado sin comodín; cookie `HttpOnly`+`SameSite=Strict` con TTL en servidor; `hmac.compare_digest` con hash calculado siempre.

---

## 5. Prioridades

**Antes de tocar hardware** (`AVIS_MACHINE_READONLY=0` o ampliar `_FORWARDABLE`): SEG-1, SEG-2 y SEG-3 cerrados, y SEG-7 (`distanceMm` sin cota superior) acotado en `contract.json` mientras es solo JSON.

**Antes de que el host C# implemente contra los contratos:** ARQ-1 (decidir si `contract.json` es el contrato de mensajes o la tabla de autorización HTTP — hoy se usa como lo segundo, que es la conflación que produce el fallo de `.upper()`), ARQ-2 (declarar el bus `window.Meltio*`; los dos fail-open del jog y de `error_codes` son la misma clase de defecto) y ARQ-4 (el README, cinco minutos).

**Retorno alto y coste bajo, en orden:** el `AbortController` en `pollOnce` (4 líneas; cierra REN-5 y la etiqueta «Connected» falsa) · cachear `getStats()` (~5 líneas, REN-1) · podar `notificationToastedIds` como su hermano (3 líneas, COD-3) · la guarda `or` en `put_permissions_config` más escritura atómica (residual de COD-1 y N-A1) · añadir el god-file a `SCAN_ROOTS` reconociendo también `.id = "…"` (COD-2, y borrar el ViewCube).

**Medición pendiente antes de decidir:** el `performance.mark` sobre `getStats()` que resuelve la contradicción de §2.4.

**Estructural, sin prisa pero con decisión:** el ritmo de extracción no converge. Vale la pena decidir explícitamente si el objetivo es vaciar el god-file (~85 fases más) o congelarlo y publicarlo como implementación de referencia —que es lo que el artefacto ya hace— y concentrar el esfuerzo en que los contratos sean correctos.

---

## Apéndice A. Aritmética de puntuaciones

**Rúbrica aplicada** (`evaluacion-severidad`, reproducida literalmente desde el informe anterior; ver la nota de método sobre los agentes):

- Bandas: Excelente 90-100 · Buena 75-89 · Aceptable 60-74 · Deficiente 40-59 · Crítica 0-39.
- Descuentos: 🔴 confirmado −8 a −15 (**capa la dimensión a ≤59**) · 🟠 confirmado −3 a −6 · 🟡 no restan individualmente, acumulación >10 resta hasta −5 · **refutados no puntúan**.
- Pesos: Seguridad 25 % · Arquitectura 20 % · Código 20 % · Mantenibilidad 15 % · Escalabilidad 10 % · Testing 10 %. **Rendimiento no pondera.**
- Capado global: si Seguridad < 40 **o** (Arquitectura **y** Código ambas < 50), la global no puede superar 55.
- Dimensión primaria/secundaria: descuento completo en la primaria, **mitad redondeada hacia abajo** en una única secundaria. Ningún hallazgo se descuenta en tres dimensiones.

**Sin hallazgos 🔴 tras verificación**: los dos reclamados quedaron refutado (COD-1) y ajustado a 🟠 (SEG-1). Ninguna dimensión queda capada.

### Arquitectura

| Concepto | Valor |
|---|---|
| Base: **Buena, banda media** — dirección de dependencias limpia y verificada por CI, nueve puertas más un boot check que ejecuta la app en un check requerido, tres contratos publicados (uno derivado del código con puerta propia), ratchet de lookups muertos a cero, artefacto ejecutable con test del grafo de imports, dos máquinas de estado limpias, cero abstracciones muertas entre los módulos extraídos. No llega a banda alta porque el god-file de 12.535 líneas con 137 globales mutables sigue siendo el centro de gravedad | **82** |
| ARQ-1 🟠 (primaria) — el vocabulario canónico publicado no lo acepta ningún backend, `emergencyStop` incluido; canal `viewer` sin implementación | −6 |
| ARQ-2 🟠 (primaria) — el manifiesto DOM es ciego al bus de globales, y seguirlo produce jog sin gate | −5 |
| ARQ-3 🟠 (primaria) — la extracción no converge; write-through en `materials.js` | −4 |
| ARQ-4 🟠 (primaria) — el README publicado contradice a su generador | −3 |
| SEG-1 🟠 (secundaria; primaria en Seguridad, −6) | −3 |
| Acumulación 🟡: ARQ-5, ARQ-6, ARQ-7, ARQ-8, ARQ-9, COD-5, NUEVO-1 = **7**, no supera 10 | 0 |
| **Total** | 82 − 21 = **61** |

### Calidad de código

| Concepto | Valor |
|---|---|
| Base: **Buena, banda media-baja** — 187 tests reales sin un solo tautológico (ejecutados), comentarios que explican el porqué y nombran el bug histórico que motivó cada defensa, backend endurecido con criterio, cero duplicación conceptual (verificada activamente), 0 TODO y 0 `console.log` en código propio | **84** |
| COD-2 🟠 (primaria) — 18 lookups muertos y un ViewCube de 310 líneas fuera del alcance de una puerta que se declara exhaustiva | −5 |
| COD-3 🟠 (primaria) — el toast no reaparece en fallos recurrentes; reproducido | −4 |
| ARQ-1 🟠 (secundaria; primaria en Arquitectura, −6) — el desajuste alias/canónico es también defecto de código | −3 |
| REN-5 🟠 (secundaria; primaria en Rendimiento, −4) — el `fetch` sin timeout es corrección, no rendimiento | −2 |
| Acumulación 🟡: COD-1 residual, COD-4, COD-5, COD-6, COD-7, COD-8, COD-9, COD-10, NUEVO-1, NUEVO-2, REN-2 residual, REN-3, REN-4, SEG-6, SEG-7 = **15 > 10** | −4 |
| **Total** | 84 − 18 = **66** |

### Seguridad

| Concepto | Valor |
|---|---|
| Base: **Buena, banda baja** — autorización por comando desde un contrato único con auditoría JSONL y fail-closed si el contrato falta, adaptador real read-only con allowlist de dos entradas, `postMessage` con verificación de emisor, PBKDF2 sin oráculo de temporización, CORS estrecho, 0 secretos, 0 traversal (verificado), y desde hoy `contract-http.json` con puerta que afirma independientemente que las rutas con autorización siguen exigiéndola | **80** |
| SEG-1 🟠 (primaria) — divergencia rank/capability, reproducida; invisible para el administrador | −6 |
| SEG-2 🟠 (primaria) — sin ninguna vía de revocación de sesiones; un admin revocado conserva `admin.users` 12 h | −6 |
| SEG-3 🟠 (primaria) — interlock 100 % cliente, override desde `sessionStorage` enriquecido con permisos reales | −5 |
| Acumulación 🟡: SEG-4, SEG-5, SEG-6, SEG-7, SEG-8, SEG-9, SEG-10, SEG-11, SEG-12, N-A1, N-A2, N-A3, NUEVO-2 = **13 > 10**; se aplica −4 y no −5 porque la mayoría están calibrados a loopback+kiosco por el propio revisor | −4 |
| **Total** | 80 − 21 = **59** |

### Rendimiento *(no pondera)*

| Concepto | Valor |
|---|---|
| Base: **Buena** — render on-demand real sobre 10 fuentes de movimiento, pixel-ratio adaptativo con histéresis y cooldowns separados, disposal completo incluyendo texturas, `boundedQueue` con coalescing por rAF, memoización comentada en los caminos calientes que sí la tienen | **85** |
| REN-1 🟠 (primaria) — trabajo O(segmentos) sin memoizar por frame, fuera de la puerta de dibujo y también en pausa. Magnitud en disputa (§2.4): se aplica el descuento por el hecho estructural, no por los 6 ms | −6 |
| REN-5 🟠 (primaria) — el polling muere para siempre ante un socket colgado; demostrado | −4 |
| Acumulación 🟡: REN-2 residual, REN-3, REN-4, REN-6, REN-7, REN-8, REN-9, REN-10, REN-11, NUEVO-1, N-C4 = **11 > 10** | −3 |
| **Total** | 85 − 13 = **72** |

### Mantenibilidad

| Concepto | Valor |
|---|---|
| Base: **Buena** — documentos autoritativos actualizados el mismo día que el código, deuda declarada en cero, comentarios de decisión con el bug histórico que la motivó, nueve puertas más boot check, y `serve_artifact.py` que convierte la verificación end-to-end del artefacto en un comando | **80** |
| ARQ-3 🟠 (secundaria; primaria en Arquitectura, −4) — cada extracción encarece la siguiente | −2 |
| COD-2 🟠 (secundaria; primaria en Código, −5) — 310 líneas que parecen vivas y nadie borra | −2 |
| ARQ-4 🟠 (secundaria; primaria en Arquitectura, −3) — documentación que afirma lo contrario del código | −1 |
| Acumulación 🟡: COD-5, COD-6, COD-9, COD-10, ARQ-5, ARQ-7, ARQ-8, ARQ-9, NUEVO-1 = **9**, no supera 10 | 0 |
| **Total** | 80 − 5 = **75** |

### Escalabilidad

| Concepto | Valor |
|---|---|
| Base: **Buena, banda baja** — la partición, el contrato host-owned, el puerto de máquina y ahora un artefacto de release autocontenido y ejecutable son las piezas correctas | **78** |
| ARQ-2 🟠 (secundaria; primaria en Arquitectura, −5) — el manifiesto no describe lo que un segundo consumidor necesita | −2 |
| Ajuste: el ritmo de extracción medido (−586 LOC en 4 fases, ~85 fases restantes) es un límite real de evolución que ninguna 🟠 captura por sí sola | −2 |
| Acumulación 🟡: ARQ-5, ARQ-7, ARQ-8, ARQ-9, SEG-10, COD-5 = **6** | 0 |
| **Total** | 78 − 4 = **74** |

### Testing

| Concepto | Valor |
|---|---|
| Base: **Buena, banda alta** — 187 tests JS + 47 Python del viewer + 8 smoke + 77 del slicer, ejecutados y verdes; disciplina anti-tautología explícita y documentada dentro de los propios tests; mutación usada como criterio de aceptación durante el desarrollo; jsdom sobre el `urdf.html` real en vez de fixtures sintéticos; test del grafo de imports del artefacto publicado; y un boot check que ejecuta la aplicación completa en un check requerido | **84** |
| COD-2 🟠 (secundaria; primaria en Código, −5) — las puertas certifican un alcance menor que el que su nombre sugiere: dead-lookups excluye el god-file y `check_contract` valida en una sola dirección | −2 |
| Acumulación 🟡: COD-3 y COD-4 son comportamientos que ningún test cubría; `hmi/materials.js` (1.270 LOC) sin revisar; smoke no ejecutada localmente en esta evaluación = **4** | 0 |
| **Total** | 84 − 2 = **82** |

### Global

| Dimensión | Nota | Peso | Aporte |
|---|---|---|---|
| Seguridad | 59 | 25 % | 14,75 |
| Arquitectura | 61 | 20 % | 12,20 |
| Calidad de código | 66 | 20 % | 13,20 |
| Mantenibilidad | 75 | 15 % | 11,25 |
| Escalabilidad | 74 | 10 % | 7,40 |
| Testing | 82 | 10 % | 8,20 |
| **Global** | | | **67,00 → 67** |

Capado global: Seguridad 59 ≥ 40 y (Arquitectura 61, Código 66) ambas ≥ 50 → **no aplica**.

---

## Apéndice B. Trazabilidad de la verificación

| ID | Severidad reclamada | Veredicto | Severidad final |
|---|---|---|---|
| COD-1 | 🔴 | **REFUTADO** (escenario) | 🟡 residual |
| SEG-1 | 🔴 | CONFIRMADO, ajustado | 🟠 |
| ARQ-1 | 🟠 | CONFIRMADO (agravado) | 🟠 |
| ARQ-2 | 🟠 | CONFIRMADO (4/4 subpuntos) | 🟠 |
| ARQ-3 | 🟠 | AJUSTADO (tesis) | 🟠 |
| ARQ-4 | 🟠 | CONFIRMADO | 🟠 |
| COD-2 | 🟠 | CONFIRMADO (18 exacto) | 🟠 |
| COD-3 | 🟠 | CONFIRMADO (reproducido) | 🟠 |
| COD-4 | 🟠 | AJUSTADO | 🟡 |
| COD-5 | 🟠 | AJUSTADO (consecuencia no probada) | 🟡 |
| SEG-2 | 🟠 | CONFIRMADO (más amplio) | 🟠 |
| SEG-3 | 🟠 | CONFIRMADO (más fuerte) | 🟠 |
| SEG-4 | 🟠 | AJUSTADO | 🟡 |
| REN-1 | 🟠 | CONFIRMADO (magnitud en disputa) | 🟠 |
| REN-2 | 🟠 | **REFUTADO** | 🟡 residual |
| REN-3 | 🟠 | AJUSTADO (medido) | 🟡 |
| REN-4 | 🟠 | AJUSTADO (daño distinto) | 🟡 |
| REN-5 | 🟠 | CONFIRMADO (demostrado) | 🟠 |

**Totales: 9 confirmados · 7 ajustados · 2 refutados.**

Hallazgos nuevos aportados por los verificadores (7): **N-A1** escritura no atómica del store de autorización · **N-A2** el fallback a roles built-in reactiva rangos de sesiones vivas · **N-A3** el override de seguridad no se audita en ningún sitio · **N-C2** la composición REN-5×COD-4 deja la topbar diciendo «Connected» con el enlace muerto · **N-C3** la premisa de 7,5 M triángulos es falsa (son 3,77 M en 454 primitivas; el coste dominante son draw calls, no triángulos) · **NUEVO-1** callouts de anotaciones inalcanzables desde el commit inicial · **NUEVO-2** `error_codes.js` fail-open silencioso. Los dos propuestos como 🟠 pasaron verificación puntual adicional y **ambos bajaron a 🟡**.
