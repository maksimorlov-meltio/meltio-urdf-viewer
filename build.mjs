// Light build for the avisualizer viewer (tooling only — no logic changes).
//
// Bundles static/urdf_viewer.js and its relative ES-module graph (modules/, sim/)
// into a single minified, content-hashed file under static/dist/, then rewrites
// urdf.html's app-entry <script> to point at it. The hash IS the cache-buster,
// so the manual "?v=N" is no longer needed.
//
// Three.js stays VENDORED: `three` and `three/addons/*` are marked external, so
// the bundle keeps its bare imports and the browser resolves them through the
// existing importmap in urdf.html (-> static/vendor/). Nothing about three is
// re-bundled or transformed.
//
//   node build.mjs         build the hashed bundle + point urdf.html at it
//   node build.mjs --dev    point urdf.html back at the raw source (for editing)
import { build } from "esbuild";
import { readFile, writeFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Phase C layout: build.mjs lives at the repo root; the dev-host static tree
// holds the entry, and /hmi + /viewer resolve to the root partitions.
const REPO_ROOT = path.dirname(fileURLToPath(import.meta.url));
const STATIC = "apps/dev-host/src/avisualizer/web/static";
const ENTRY = path.join(STATIC, "urdf_viewer.js");
const OUTDIR = path.join(STATIC, "dist");
const HTML = path.join(STATIC, "urdf.html");
const DEV = process.argv.includes("--dev");

// Rewrite the single `data-app-entry` <script src="…">, dropping any ?v= query.
async function setEntrySrc(src) {
  const html = await readFile(HTML, "utf8");
  const re = /(<script\b[^>]*\bdata-app-entry\b[^>]*\bsrc=")[^"]*(")/;
  // Fail only when the marker is genuinely absent — NOT when the replacement is a
  // no-op. Rebuilding with unchanged source produces the same content hash, so the
  // src is already correct; that must be a clean no-op, not a fatal error.
  if (!re.test(html)) {
    throw new Error("could not find the data-app-entry <script> in urdf.html");
  }
  const next = html.replace(re, `$1${src}$2`);
  if (next !== html) await writeFile(HTML, next);
}

if (DEV) {
  await setEntrySrc("/static/urdf_viewer.js");
  console.log("dev: urdf.html app-entry -> raw source /static/urdf_viewer.js");
  process.exit(0);
}

// Strip ?query suffixes from relative imports (e.g. ./sim/printSimulation.js?v=11)
// so esbuild can resolve them to the real file. Leaves the `three` externals alone.
// Resolve the root-absolute specifiers the browser resolves via the /hmi and
// /viewer FastAPI mounts (see app.py): "/hmi/x.js" -> <repo>/hmi/x.js.
const rootAbsolute = {
  name: "root-absolute",
  setup(b) {
    b.onResolve({ filter: /^\/(hmi|viewer)\// }, (args) => ({
      path: path.join(REPO_ROOT, args.path.replace(/\?.*$/, "")),
    }));
  },
};

const stripQuery = {
  name: "strip-query",
  setup(b) {
    b.onResolve({ filter: /\?/ }, (args) => {
      if (/^three(\/|$)/.test(args.path)) return undefined;
      const clean = args.path.replace(/\?.*$/, "");
      return { path: path.resolve(path.dirname(args.importer), clean) };
    });
  },
};

await rm(OUTDIR, { recursive: true, force: true });
await mkdir(OUTDIR, { recursive: true });

const result = await build({
  entryPoints: [ENTRY],
  bundle: true,
  format: "esm",
  target: ["es2022"],
  minify: true,
  sourcemap: false,
  charset: "utf8",
  legalComments: "none",
  external: ["three", "three/addons/*"],
  plugins: [rootAbsolute, stripQuery],
  entryNames: "[name]-[hash]",
  outdir: OUTDIR,
  metafile: true,
});

const outFile = Object.keys(result.metafile.outputs).find(
  (f) => f.endsWith(".js") && !f.endsWith(".map"),
);
if (!outFile) throw new Error("esbuild produced no .js output");
const base = path.basename(outFile);
await setEntrySrc(`/static/dist/${base}`);
console.log(`built: static/dist/${base} -> urdf.html app-entry updated`);
