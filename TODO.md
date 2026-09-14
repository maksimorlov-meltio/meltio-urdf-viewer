# TODO — lo que hay que tener en cuenta en cada cambio

Lista corta y recurrente para quien añade o modifica funcionalidad en este repo.
**No repite** lo que ya está escrito: cada punto enlaza al documento que manda.
Si algo de aquí contradice a [`CONTRIBUTING.md`](CONTRIBUTING.md),
[`AGENTS.md`](AGENTS.md) o [`apps/dev-host/ARCHITECTURE.md`](apps/dev-host/ARCHITECTURE.md),
**mandan ellos y esta lista es el bug**.

Sale de la tanda de refactorización que llevó `main` desde `319406e` (el recuento
exacto y qué cerró cada PR están en `docs/evaluacion-calidad-software.md` §8.3,
que es donde se actualiza). Ninguna regla de aquí es preferencia estética: todas
nacieron de algo que se rompió, y el porqué va escrito al lado, porque una regla
sin motivo se salta.

---

## 0. Antes de escribir código

**Para una funcionalidad completa, usa `/feature`.** El repo tiene un comando
orquestador propio en [`.claude/`](.claude/README.md) que encadena siete
subagentes con las convenciones de ESTE repositorio incrustadas: brief →
arquitecto → diseño UX → backend → frontend → revisor adversarial → docs.

```
/feature <describe la funcionalidad>
```

No es obligatorio, pero se escribió precisamente para no tener que recordar de
memoria la mitad de esta lista. Para un arreglo de tres líneas es exagerado;
para algo que toca UI + backend + contrato, ahorra la revisión.

**Decide dónde va antes de empezar.** [`AGENTS.md`](AGENTS.md) lo resuelve en
cuatro líneas. Lo que la escena muestra → `viewer/`. Estado de hardware o de
UI → `hmi/`. **Nada nuevo al god-file** (`urdf_viewer.js`, ~12k líneas y
bajando): deshacerlo es el trabajo en curso, no le añadas.

---

## 1. Mientras escribes

| | Regla | Por qué existe |
|---|---|---|
| **Fronteras** | `hmi/` nunca importa `three`; `viewer/` nunca toca el DOM fuera de `overlays/`; el número de `export let` por fichero está congelado | Las comprueba la puerta 4. La tercera es nueva: los live bindings son andamiaje de migración, no forma objetivo |
| **Elemento + listener** | Si borras un elemento del DOM, borra su `addEventListener` en el mismo cambio | Un listener sobre un elemento que no existe **mata el módulo entero** al cargar |
| **Nombres del URDF** | Si renombras un link o un joint en `M600_PRO.urdf`, arregla las constantes del código en el mismo cambio | No lanza nada: la puerta deja de abrirse y el tambor de aparecer. El URDF se despliega como configuración de máquina y el código que depende de él como software, así que pueden ir a ritmos distintos. La puerta 9 lo contrasta |
| **Comentarios** | Al borrar código, reescribe los comentarios que nombran lo borrado | `gen_dom_contract` escanea texto: un comentario que menciona `window.X` mantiene `X` en el contrato generado después de borrar el último uso real. Pasó tres veces |
| **Contrato primero** | Comando de máquina nuevo → decláralo en `contract.json` **antes** de emitirlo | Uno no declarado es un 400. Y su `permission` se compara contra el `rank` en el servidor: elegirlo mal es un cambio de autorización real |
| **Regenerar** | ¿Tocaste un `getElementById`, una clave de `deps` o un `window.X` en `hmi/`/`viewer/`? → `node tools/gen_dom_contract.mjs`. ¿Una ruta? → `gen_http_contract.py` | Son generados y la puerta los compara contra una generación fresca. El host C# construye contra ellos |
| **Cache-buster** | Solo `urdf_viewer.css`, `hmi/permissions.js` y `hmi/error_codes.js` llevan `?v=N`. Si tocas uno, súbelo | Los imports ES ya no lo necesitan. Olvidarlo hace que tu cambio «no haga nada» |
| **Python** | Los cambios de backend **necesitan reiniciar el servidor** | JS y CSS recargan solos; Python no. Un «sigue roto» suele ser un servidor sin reiniciar |
| **Tamaño** | ~400 líneas de diff propio por PR, generados aparte | Es la cadencia que el repo demuestra. Un PR más grande no se revisa: se aprueba |

---

## 2. Los tests, que es donde este repo es exigente

**Un módulo estrena test cuando alguien lo toca.** No se escriben suites
especulativas; el test se escribe como defensa del arreglo que estás haciendo.

**Y se verifica por mutación.** Ésta es la disciplina que distingue a este repo
y que no estaba escrita en ninguna parte hasta ahora:

> Después de escribir un test, **rompe a propósito el código que arregla y
> comprueba que el test muere.** Si sigue verde, el test no prueba nada.

No es teoría. En la última tanda **un test sobrevivió a su mutante**: contaba
nodos del DOM, y la capa de toasts satura en 3, así que el contador no bajaba
nunca; hubo que reescribirlo para que asertara sobre los títulos. Otro dejaba
pasar un `restore` que añadía en vez de reemplazar, lo que habría duplicado el
historial del operador en cada recarga, en silencio y con todo en verde.

**Antes de mutar, commitea.** Los scripts de mutación revierten con
`git checkout <fichero>`, que apunta a HEAD y **se lleva por delante el trabajo
sin commitear**. Aprendido perdiéndolo.

---

## 3. Si el cambio no debe cambiar nada

Mover código, borrar algo que crees muerto, partir una función: captura la
**huella del DOM** antes y compárala después.

```powershell
node tools/check_boot.mjs --footprint antes.txt
# ...el cambio...
node tools/check_boot.mjs --expect-footprint antes.txt
```

**No lo intentes con capturas de pantalla**: dos capturas del mismo código ya
difieren (el reloj de la topbar avanza, swiftshader no es determinista). La
huella sí lo es — pero solo ve etiquetas que aparecen, desaparecen o cambian de
texto, no un número que cambia de valor.

---

## 4. Antes de abrir el PR

```powershell
bash gate.sh                                                        # las nueve puertas
node tools/check_boot.mjs                                           # con el visor levantado
.\.venv\Scripts\python.exe -m pytest apps/dev-host/tests tests/smoke
.\venv311\Scripts\python.exe -m pytest _slicer_branch/projects/platform/tests
```

**Las nueve puertas no arrancan la aplicación.** Parsean, lintan y montan
módulos aislados: un módulo que lanza al arrancar las pasa las nueve y se lleva
el HMI por delante. Eso es exactamente lo que hizo `515877b` — dos días de
merges verdes sobre una app muerta. El boot check es el único que la ejecuta.

Y si tocaste algo que la página carga, el ciclo del artefacto, porque los
chequeos estáticos no bastan (un `@import` en la CSS, y los `@font-face` que
escondía, se escaparon de todos y solo aparecieron al cargar desde una carpeta):

```powershell
node tools/gen_artifact.mjs --out .\artifact
.\.venv\Scripts\python.exe tools/serve_artifact.py .\artifact http://127.0.0.1:8090 8098
node tools/check_boot.mjs --url http://127.0.0.1:8098/index.html
```

**Actualiza el documento canónico en el mismo cambio** que altera
comportamiento, comandos, endpoints o tokens de UI. Un documento que miente es
peor que ninguno: convierte la revisión en arqueología.

---

## 5. Lo que no se hace nunca

- **No añadas un botón de parada de emergencia a la UI.** El E-stop es hardware,
  y la electrónica vigila a este software: si el software muere, ella cancela y
  tira la seguridad. Un botón que parece un E-stop y puede ser rechazado por un
  `rank` o colgarse en la red es **peor que ninguno**. `stopPrint` es una parada
  de proceso *recuperable*, y por eso sí pide operador.
- **No renombres ni dividas el job `viewer pytest`.** Contiene el boot check. Un
  contexto requerido que deja de reportarse bloquea *todos* los merges, y hace
  falta un admin que aquí no hay.
- **No siembres `KNOWN_DEAD`** en `check_dead_lookups`. Se limpia primero y se
  aprieta el trinquete después: es el único orden en el que la puerta demuestra
  algo en vez de limitarse a acusar.
- **No añadas una décima puerta** si puedes ensanchar una de las nueve. Una
  nueva cuesta renumerar nueve `echo`, el mensaje final de `gate.sh` y un paso
  en `ci.yml`.
- **No importes a través de la frontera viewer↔slicer en Python.** Solo HTTP y
  `postMessage`.
- **No comitees a la rama `release`.** La publica el workflow.
- **No uses `gh pr merge --delete-branch` sobre una pila de PRs**: GitHub
  *cierra* los PRs cuya rama base desaparece, no los reapunta.

---

## 6. Lo que hay pendiente ahora mismo

Contexto, no deberes. El detalle está en `docs/evaluacion-calidad-software.md` §8.3:

- **El faseado de `boot()`** (fases 5.1–5.2). La secuencia ya está rediseñada y
  medida; falta ejecutarla. Envolver la cola `10505-11662` en una función es un
  diff de tres líneas bajo `git diff -w`; después, partirla en once fases por las
  costuras que el fichero ya tiene, sin reordenar nada.
- **Después de eso, y solo después, se retoma la extracción del god-file.**
