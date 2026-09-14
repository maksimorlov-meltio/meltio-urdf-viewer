# El comando `/feature` — desarrollo asistido por un equipo de subagentes

Este directorio contiene un **comando orquestador** de Claude Code, `/feature`, que
desarrolla una funcionalidad del HMI Meltio de principio a fin encadenando un equipo
de subagentes especializados, cada uno con las convenciones de ESTE repositorio
incrustadas. La idea: en vez de pedirle a un único modelo que lo haga todo, el trabajo
se reparte entre roles (arquitecto, diseñador, desarrollador, revisor…) que se pasan
un contexto destilado y verifican lo implementado con los comandos reales del proyecto.

Fue generado con la skill `feature-generico` y endurecido con una auditoría adversarial
(`auditor-comandos`). Este README explica **qué hay**, **cómo se usa** y **cómo
mantenerlo o regenerarlo**.

> **Lo que produzca `/feature` sigue sujeto a [`../TODO.md`](../TODO.md)** — la lista
> recurrente de cada cambio (mutación de los tests, huella del DOM en refactores que no
> deben cambiar nada, contratos regenerados, cache-busters). Los subagentes la conocen,
> pero el PR lo firmas tú.

## Qué hay aquí

```
.claude/
├─ commands/
│  └─ feature.md            # el orquestador (lo que ejecuta /feature)
└─ agents/
   ├─ optimizador-brief.md      # 1. estructura la petición
   ├─ arquitecto-feature.md     # 2. diseña el plan (ficheros, decisiones)
   ├─ disenador-ux.md           # 2b. diseño UX (si hay interfaz)
   ├─ desarrollador-feature.md  # 3a. implementa el backend (Python)
   ├─ desarrollador-frontend.md # 3b. implementa la UI (JS/CSS/HTML)
   ├─ revisor-feature.md        # 4. revisión crítica adversarial
   └─ documentador-feature.md   # 5. actualiza la documentación
```

## El equipo

| Fase | Agente | Modelo | Rol | Herramientas |
|---|---|---|---|---|
| 1 | `optimizador-brief` | haiku | Convierte la petición en un brief estructurado (objetivo, superficie, criterios, preguntas abiertas). Sin decisiones de diseño. | solo lectura |
| 2 | `arquitecto-feature` | fable | Decide qué ficheros tocar y cómo, respetando la frontera viewer↔slicer y el god-file. No escribe código. | solo lectura |
| 2b | `disenador-ux` | opus | (Solo si hay UI) Spec de diseño: elementos, estados, gestos táctiles, tokens del STYLEGUIDE, textos. | solo lectura |
| 3a | `desarrollador-feature` | opus | (Solo si toca Python) Implementa el backend y sus tests; devuelve el contrato de API. | lectura + edición + Bash |
| 3b | `desarrollador-frontend` | opus | (Solo si hay UI) Implementa la spec en JS/CSS/HTML; no toca Python. | lectura + edición + Bash |
| 4 | `revisor-feature` | opus | Revisión adversarial: caza antipatrones IA, listeners huérfanos, cache-busters olvidados, violaciones del STYLEGUIDE y de la frontera. Solo reporta. | lectura + Bash |
| 5 | `documentador-feature` | sonnet | (Condicional) Actualiza CLAUDE.md / ARCHITECTURE.md / STYLEGUIDE.md / README.md si el cambio afecta algo que describen. | lectura + edición |

**Por qué estos modelos** (rúbrica: ajustar el modelo al razonamiento, no al prestigio del rol):
haiku para lo mecánico (brief); **fable** para el arquitecto (máximo razonamiento: decisiones
con consecuencias en un god-file de ~19k líneas y una frontera entre apps); opus para diseño,
implementación y revisión (criterio y adversarial, sin red de tests JS); sonnet para docs
(criterio técnico pero acotado). Ningún modelo mecánico (haiku) toca código.

## El flujo

```
/feature <descripción>
   │
   ├─ Fase 0  Clarificación   ── pregunta SOLO decisiones de producto no inferibles
   ├─ Fase 1  optimizador-brief    → brief estructurado
   ├─ Fase 2  arquitecto-feature   → plan (ficheros, decisiones, spec UI, tests, cache-busters)
   ├─ Fase 2b disenador-ux         → spec de diseño          [si hay UI]
   ├─ Fase 3a desarrollador-feature → backend + contrato     [si toca Python]
   ├─ Fase 3b desarrollador-frontend → UI                    [si hay UI, tras 3a]
   ├─ Fase 4  revisor-feature      → veredicto (bucle máx. 2 ciclos de corrección)
   ├─ Fase 5  documentador-feature → docs                    [condicional]
   └─ Resumen final: qué se construyó, ficheros, verificación, revisión, pendientes
```

Principios de diseño que lo hacen fiable (y que conviene preservar si lo editas):
- **Destilación de contexto**: cada agente recibe solo lo que necesita (el desarrollador
  recibe el plan, no la petición cruda; el revisor recibe plan + ficheros tocados, no la
  conversación). No se reenvían bloques grandes a quien solo necesita una sección.
- **Verificación con comandos reales**, no inventados: `node --check` y `node tools/check_imports.mjs`
  para JS, `pytest` de cada venv para Python. Si un venv no existe, se reporta como
  "NO EJECUTADO" — nunca se declara verde algo que no se corrió.
- **Bucle de revisión acotado a 2 ciclos**, con los hallazgos abiertos reportados al final
  si no se cierran (nada de silencio).
- **Puntos de parada claros**: preguntas de producto, riesgo de permisos solo-UI en acciones
  peligrosas, venv ausente, build rota. No pregunta por decisiones técnicas derivables de las
  convenciones.

## Cómo usarlo

En Claude Code, dentro de este repositorio:

```
/feature <descripción de la funcionalidad en lenguaje natural>
```

Ejemplos realistas para este proyecto:

```
/feature Añade un indicador de potencia de láser en la barra superior que muestre los
         vatios en vivo durante una impresión y se atenúe cuando está inactivo

/feature En el panel de Materiales, avisa cuando el material restante baje del umbral
         necesario para el trabajo seleccionado, con un botón para saltar al feeder alterno
```

Qué esperar: el orquestador te hará preguntas de **producto** al principio si algo no es
inferible (a qué app afecta, si debe gatearse por rol, textos visibles), luego trabaja solo
y termina con un resumen. Revísalo: mira los ficheros tocados, el estado de `pytest`/`node`,
y los pendientes de comprobación visual (la UI no tiene test automatizado — hay que mirarla
en el panel con `Start-Viewer.bat` + recarga dura).

## Cómo mantenerlo o extenderlo

Los ficheros son Markdown autónomos; puedes editarlos a mano. Al hacerlo:

- **Añadir un rol nuevo**: crea `agents/<nombre>.md` siguiendo la plantilla de los existentes
  (frontmatter con `name`, `description`, `tools` mínimos, `model`), incrusta las convenciones
  que ese rol necesita, y define una **salida estructurada** (su texto final es el valor que
  recibe el orquestador). Luego engánchalo en una fase de `commands/feature.md`.
- **Cambiar un modelo**: edita el campo `model:` del agente Y la justificación en el roster de
  `commands/feature.md` — deben coincidir (la auditoría lo comprueba).
- **Herramientas mínimas**: un revisor no lleva `Write`; un documentador no lleva `Bash`. No
  des permisos de escritura/ejecución a quien no los use.
- **Regenerarlo desde cero** para otro stack o proyecto: usa la skill `feature-generico`, que
  detecta el stack y las convenciones reales y reescribe comando + agentes adaptados. La skill
  `diseno-orquestadores` es el plano de referencia (anatomía, rúbrica de modelos, checklist);
  `auditor-comandos` audita el resultado.

> Nota: este tooling es independiente del código del HMI. Si haces una pull request del fork,
> decide conscientemente si `.claude/` entra en ella o va aparte — mezclar "tooling de
> desarrollo" con cambios de producto hace la PR más difícil de revisar.
