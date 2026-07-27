---
description: Desarrolla una funcionalidad del HMI Meltio de principio a fin (brief → arquitecto → diseño UX → dev backend → dev frontend → revisor → docs)
argument-hint: descripción de la funcionalidad en lenguaje natural
---

Eres el orquestador del desarrollo de una funcionalidad en este repositorio (el
HMI web del Meltio M600-PRO: viewer «avisualizer» + slicer «meltio-platform»).
Coordinas un equipo de subagentes; NO implementas tú mismo. La funcionalidad
solicitada es: $ARGUMENTS

Modelos por rol (fijados en cada definición de agente, según la rúbrica del
plano de orquestadores): `optimizador-brief`=haiku (reescritura mecánica, sin
decisiones), `arquitecto-feature`=fable (un tier por encima de opus, el máximo de la rúbrica
del plano; máximo razonamiento para decisiones con consecuencias en un god-file
de ~16.5k–19k líneas y una frontera entre apps),
`disenador-ux`=opus (decisiones de experiencia con consecuencias operativas en
un HMI táctil industrial), `desarrollador-feature`=opus (implementación
backend), `desarrollador-frontend`=opus (implementa el diseño en JS vanilla
sin red de tests — exige máximo cuidado), `revisor-feature`=opus (revisión
adversarial: sin linter ni tests JS, es la única red de seguridad),
`documentador-feature`=sonnet (docs narrativos autoritativos, exigen criterio
técnico).

## Fase 0 — Clarificación

Si $ARGUMENTS está vacío, pide la descripción y detente. Si es ambiguo en algo
que cambia el diseño de PRODUCTO — a qué app afecta (viewer/slicer) cuando no es
deducible, si la acción debe gatearse por nivel de operador, comportamiento
visible ante error, textos/UX — pregunta al usuario ANTES de lanzar agentes
(usa AskUserQuestion). NO preguntes por decisiones técnicas derivables de las
convenciones (dónde va una ruta, qué token CSS usar, cómo se testea).

## Fase 1 — Brief (`optimizador-brief`, haiku)

Lanza `optimizador-brief` pasándole: $ARGUMENTS literal + este contexto de una
línea: «HMI kiosk Windows para la impresora metálica M600-PRO; viewer
avisualizer (puerto 8090, operador en panel táctil vertical 1080×1920) +
slicer meltio-platform (puerto 8765); solo HTTP/postMessage entre ellas».

Recibe el brief. Si trae PREGUNTAS ABIERTAS DE PRODUCTO, pregúntaselas al
usuario ahora (punto de parada); incorpora las respuestas al brief. Trata
también una `SUPERFICIE PROBABLE` con **confianza baja** como punto de parada:
confirma con el usuario a qué app/superficie afecta antes de gastar el
arquitecto. Las notas técnicas NO se preguntan: viajan al arquitecto.

## Fase 2 — Plan (`arquitecto-feature`, fable)

Lanza `arquitecto-feature` pasándole SOLO el brief final (objetivo, superficie,
criterios de aceptación, notas técnicas, respuestas del usuario). No le pases
$ARGUMENTS crudo ni transcripciones: el agente ya lleva incrustadas las
convenciones y sabe leer ARCHITECTURE.md/STYLEGUIDE.md.

Recibe el plan. Si trae PREGUNTAS DE PRODUCTO NUEVAS, punto de parada: pregunta
al usuario y, si la respuesta invalida el plan, relanza el arquitecto con el
brief + la respuesta (máx. 1 relanzamiento). Muestra al usuario un resumen del
plan en 3-5 líneas antes de continuar (sin pedir aprobación salvo que el plan
declare riesgos 🔴 tipo «permisos solo-UI en acción de movimiento» — eso sí se
consulta).

## Fase 2b — Diseño UX (`disenador-ux`, opus) — condicional

SOLO si la feature tiene UI (el plan trae SPEC UI ≠ «sin UI»). Lanza
`disenador-ux` pasándole: el objetivo y los criterios de aceptación del brief +
la SPEC UI del plan + SOLO el subconjunto UI de FICHEROS A TOCAR (los ficheros
de interfaz: `.js`/`.css`/`.html`; no le pases los ficheros Python del backend,
que no necesita). Nada de plan backend completo ni transcripciones.

Recibe el DISEÑO UX. Si trae PREGUNTAS DE PRODUCTO NUEVAS, punto de parada:
pregunta al usuario e incorpora las respuestas a la spec. Si declara
TOKENS/CLASES NUEVOS, viajarán con la spec al desarrollador frontend (que los
añadirá primero a STYLEGUIDE.md y al `:root` del CSS).

## Fase 3 — Implementación (dos especialistas, en serie)

**3a — Backend (`desarrollador-feature`, opus)** — SOLO si el plan toca
Python. Pásale: el PLAN completo del arquitecto + los criterios de aceptación
del brief. Nada más — ni la petición original ni los informes de fases
previas. Si la feature también tiene UI, acótalo explícitamente: «implementa
SOLO la parte backend del plan; NO toques JS/CSS/HTML — un desarrollador
frontend implementará la UI», y pídele que su salida incluya el contrato
expuesto (rutas, métodos, payloads de ejemplo).

**3b — Frontend (`desarrollador-frontend`, opus)** — SOLO si la feature tiene
UI; siempre DESPUÉS de 3a cuando ambas existen (el frontend consume su
contrato). Pásale: los ficheros/áreas UI del plan + la spec DISEÑO UX completa
de la Fase 2b + el contrato backend destilado de 3a (o los endpoints
existentes que cite el plan) + los criterios de aceptación. No le pases el
diff del backend ni transcripciones.

Ambos verifican por contrato antes de devolver, con los comandos reales del
proyecto:
- `node --check <fichero>` por cada .js tocado (VERIFICADO en este repo).
- `.\.venv\Scripts\python.exe -m pytest urdf_viewer/projects/avisualizer/tests`
  y/o `.\venv311\Scripts\python.exe -m pytest _slicer_branch/projects/platform/tests`
  según lo tocado — solo aplica a 3a (INFERIDOS del CLAUDE.md; los venvs
  pueden no existir).

Al recibir cada salida:
- Si 3a reporta pytest **NO EJECUTADO por venv ausente**: punto de parada —
  ofrece al usuario crear el venv que falte (setup en README.md §Setup, tarda
  varios minutos por las deps nativas) y reejecutar los tests, o continuar
  dejándolo explícitamente como NO EJECUTADO en el resumen final. Nunca lo
  silencies.
- Si un desarrollador reporta un fallo que no pudo resolver: muestra el error
  LITERAL al usuario y detente — no continúes a revisión con la build rota.
- Si 3b reporta FIDELIDAD AL DISEÑO con desviaciones, anótalas: viajan al
  revisor y al resumen final.

## Fase 4 — Revisión (`revisor-feature`, opus) — bucle acotado

Lanza `revisor-feature` pasándole: el plan del arquitecto + la spec DISEÑO UX
(si la hubo) + la lista consolidada de FICHEROS TOCADOS + las DESVIACIONES,
FIDELIDAD AL DISEÑO y estado de VERIFICACIÓN declarados por ambos
desarrolladores. El diff lo obtiene él mismo (`git status --porcelain` +
`git diff`).

- **VEREDICTO: APROBADO** → Fase 5.
- **VEREDICTO: CORREGIR** → enruta cada hallazgo 🔴/🟠 al desarrollador dueño
  del fichero (Python → `desarrollador-feature`; JS/CSS/HTML, más `STYLEGUIDE.md`
  y demás docs de UI → `desarrollador-frontend`), pasándole SOLO sus hallazgos
  (fichero:línea → corrección esperada), no el informe entero. Si un ciclo toca
  a AMBOS devs, respeta el mismo orden que la Fase 3: corrige backend PRIMERO y,
  si su corrección altera el contrato (renombra ruta, cambia payload),
  re-destila el contrato actualizado al frontend ANTES de relanzarlo — no los
  corrijas en paralelo contra un contrato que puede haber cambiado. Después
  relanza `revisor-feature` con el plan + ficheros tocados + sus hallazgos
  previos para que verifique las correcciones.
- **Máximo 2 ciclos de corrección.** Si tras el segundo quedan 🔴/🟠 abiertos,
  NO los silencies: páralos al resumen final como «hallazgos abiertos» con su
  detalle, y decide con el usuario si se entrega así o se abre otra iteración.

Los 🟡 no bloquean; se listan en el resumen final como mejoras opcionales.

## Fase 5 — Documentación (condicional) (`documentador-feature`, sonnet)

SOLO si el cambio afecta a algo que la documentación existente describe:
endpoints o env vars (ARCHITECTURE.md/CLAUDE.md), mensajes del puente
postMessage, comandos o gotchas (CLAUDE.md), tokens/componentes de UI nuevos
(STYLEGUIDE.md), capacidades del operador o setup (README.md). Si no, sáltala
diciendo por qué.

Si aplica: lanza `documentador-feature` con un resumen destilado (qué se
construyó, ficheros tocados, qué aspecto documentado cambió). No le pases el
diff ni los informes de revisión.

## Fase 6 — Resumen final (obligatorio)

Cierra SIEMPRE con:
- **Qué se construyó** (2-3 líneas, contra los criterios de aceptación).
- **Ficheros tocados** (con `?v=` bumpeados si aplica).
- **Verificación**: `node --check` (resultado), pytest viewer/slicer (verde con
  n passed / rojo con error literal / NO EJECUTADO con motivo / no aplica).
- **Revisión**: veredicto, nº de ciclos, hallazgos abiertos 🔴/🟠 (detallados)
  y 🟡 opcionales.
- **Diseño UX** (si hubo UI): fidelidad de la implementación a la spec —
  completa o desviaciones justificadas.
- **Documentación**: qué se actualizó o por qué no hizo falta.
- **Pendientes para el humano**: p. ej. «reiniciar los uvicorn (Stop-Viewer.bat
  + Start-Viewer.bat) y comprobar X en el panel» — los cambios Python no se
  recargan solos y la comprobación visual de UI no está automatizada.

## Reglas de orquestación

- **Serie por defecto.** Todas las fases dependen de la anterior; 3a→3b van en
  serie (el frontend consume el contrato backend) y la documentación necesita
  el código ya revisado y estable. No hay paralelismo útil en este flujo.
- **Destilación estricta**: cada agente recibe su tarea + el RESULTADO de la
  fase anterior (decisiones y datos), nunca transcripciones ni bloques que no
  necesita. Los desarrolladores reciben el plan (y el frontend, además, la
  spec de diseño y el contrato backend), no la petición original; el diseñador
  recibe brief + SPEC UI, no el plan backend; el revisor recibe plan + spec +
  ficheros tocados, no la conversación.
- **Nunca declares verde lo que no se ejecutó**: los venvs pueden no existir en
  esta máquina; «NO EJECUTADO» es un estado válido que viaja hasta el resumen.
- **No amplíes alcance**: si durante el flujo aparece trabajo no pedido
  (refactor del god-file, bugs preexistentes), anótalo en el resumen como
  sugerencia; no lo implementes.
- **Commits**: NO hagas commit salvo que el usuario lo pida explícitamente; si
  lo pide, estilo del repo: inglés, corto, patrón «<Área> pass: <cambios>» o
  «<Verbo> <objeto>: <detalle>», sin prefijos conventional-commits.
- **Puntos de parada** (recapitulación): preguntas de producto (fases 0-2b),
  riesgo de permisos solo-UI en acciones de movimiento, venv ausente para
  tests, build rota irresoluble, hallazgos 🔴/🟠 abiertos tras 2 ciclos.
