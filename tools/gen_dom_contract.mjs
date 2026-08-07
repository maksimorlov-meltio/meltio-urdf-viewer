#!/usr/bin/env node
// Generates contract-dom.json: what the published hmi/ + viewer/ modules need
// from their embedder, beyond the ES imports they carry themselves.
//
//   node tools/gen_dom_contract.mjs [outfile]     (default: contract-dom.json)
//
// Why this exists (finding ARQ-3): the `release` branch ships the module tree
// and `contract.json`, but the modules weld themselves to a DOM they do not
// publish — 200-odd element ids that only exist in the dev-host's urdf.html —
// and take their host/scene edges through an untyped `deps` object of up to 30
// callbacks. Every lookup is guarded with `if (el)`, so an embedder that
// provides none of it gets a tree that loads cleanly and does nothing, in
// silence. This manifest is the missing half of the contract.
//
// It is a STATIC SCAN, not a type system: it reports the literal ids and dep
// keys the source mentions. Computed ids (`getElementById(varName)`) cannot be
// seen and are reported as a count so the number is never mistaken for
// completeness.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const SCAN_ROOTS = ["hmi", "viewer"];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

// `initXxx(nextDeps)` / `createXxx(deps)` / `createXxx({ a, b })` — the entry
// points the embedder calls. The destructured form names its deps inline.
const ENTRY_RE = /export\s+function\s+((?:init|create)[A-Za-z0-9_]*)\s*\(([^)]*)\)/g;
const DOM_ID_RE = /getElementById\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
const DOM_DYNAMIC_RE = /getElementById\(\s*(?!["'`])/g;
const DEP_READ_RE = /\b(?:deps|nextDeps|options)\.([A-Za-z_$][\w$]*)/g;
// `const { a, b } = deps;` — how the factory modules unpack theirs.
const DEP_DESTRUCTURE_RE = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:deps|nextDeps|options)\b/g;

// ── The third edge: the `window` bus ───────────────────────────────────────
// Beyond ES imports and the `deps` object, these modules talk to each other and
// to the assembly through globals. That edge appeared in NO contract, which is
// how an embedder could wire every DOM id and every dep and still get a console
// that shows no faults (window.MeltioErrors) and no notifications
// (window.MeltioNotifications) — silently, since every read is guarded.
//
// The rule is an EXCLUSION list, not a naming convention: anything on `window`
// that is not one of these platform members is app-owned. It fails noisy — a
// platform member used for the first time tomorrow shows up as an app global
// and someone adds it here — which is the correct direction for a manifest
// whose whole purpose is that omissions are invisible at runtime.
const WINDOW_MEMBER_RE = /\bwindow\.([A-Za-z_$][\w$]*)\s*(=(?!=))?/g;
const PLATFORM_MEMBERS = new Set([
  "alert", "CSS", "clearInterval", "clearTimeout", "innerHeight", "innerWidth",
  "localStorage", "location", "setInterval", "setTimeout",
]);

// Names out of a destructuring pattern body, ignoring renames/defaults/comments.
function destructuredKeys(body) {
  return body
    .replace(/\/\/[^\n]*/g, "")
    .split(",")
    .map((part) => part.split(/[:=]/)[0].trim())
    .filter((key) => /^[A-Za-z_$][\w$]*$/.test(key));
}

const modules = {};
const allIds = new Set();
// name -> { readBy: Set, writtenBy: Set }
const globals = new Map();

function noteGlobal(name, file, isWrite) {
  if (!globals.has(name)) globals.set(name, { readBy: new Set(), writtenBy: new Set() });
  const entry = globals.get(name);
  (isWrite ? entry.writtenBy : entry.readBy).add(file);
}

for (const root of SCAN_ROOTS) {
  for (const file of walk(join(REPO_ROOT, root))) {
    const rel = relative(REPO_ROOT, file).split(sep).join("/");
    const src = readFileSync(file, "utf8");

    const domIds = [...src.matchAll(DOM_ID_RE)].map((m) => m[1]);
    const dynamicLookups = [...src.matchAll(DOM_DYNAMIC_RE)].length;
    const deps = new Set([...src.matchAll(DEP_READ_RE)].map((m) => m[1]));
    for (const match of src.matchAll(DEP_DESTRUCTURE_RE)) {
      destructuredKeys(match[1]).forEach((key) => deps.add(key));
    }

    const globalsRead = new Set();
    const globalsWritten = new Set();
    for (const match of src.matchAll(WINDOW_MEMBER_RE)) {
      const name = match[1];
      if (PLATFORM_MEMBERS.has(name)) continue;
      const isWrite = Boolean(match[2]);
      (isWrite ? globalsWritten : globalsRead).add(name);
      noteGlobal(name, rel, isWrite);
    }

    const entries = [];
    for (const match of src.matchAll(ENTRY_RE)) {
      entries.push(match[1]);
      // Destructured signature: `createCalendarUi({ escapeHtml, onOpen })`.
      //
      // Strip comments FIRST, then take the first brace group. Both halves are
      // load-bearing, and each covers a real signature in this tree:
      //
      //  - last `}` is wrong for a default: `initPrintFlowState({ a, b } = {})`
      //    ends at the default's brace, so the tail read as `b } = {` and the
      //    LAST key of every such signature was silently dropped. Reporting one
      //    dep of two is worse than reporting none — a host reads a short list
      //    as complete.
      //  - first `}` is wrong without the strip: createMovePanelUi's parameter
      //    list opens with a comment containing `{ x, y, z, probe }`, whose
      //    brace would close the group before the first real key.
      const params = match[2].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      const open = params.indexOf("{");
      const close = open === -1 ? -1 : params.indexOf("}", open);
      if (open !== -1 && close !== -1) {
        destructuredKeys(params.slice(open + 1, close)).forEach((key) => deps.add(key));
      }
    }

    if (!domIds.length && !deps.size && !entries.length
        && !globalsRead.size && !globalsWritten.size) continue;
    domIds.forEach((id) => allIds.add(id));
    modules[rel] = {
      entryPoints: entries.sort(),
      requiredDomIds: [...new Set(domIds)].sort(),
      injectedDeps: [...deps].sort(),
      ...(dynamicLookups ? { computedDomLookups: dynamicLookups } : {}),
      ...(globalsRead.size ? { globalsRead: [...globalsRead].sort() } : {}),
      ...(globalsWritten.size ? { globalsWritten: [...globalsWritten].sort() } : {}),
    };
  }
}

const out = {
  $comment:
    "Companion to contract.json for embedders of the published hmi/ + viewer/ tree. "
    + "requiredDomIds are element ids the module looks up by literal string; every lookup "
    + "is guarded, so a missing element is a SILENT no-op, not an error. injectedDeps are "
    + "the keys each initXxx/createXxx entry point reads off its dependency object. "
    + "globals are the window-bus names the tree uses; providedBy 'embedder' means NO "
    + "published module ever assigns it, so the host must, or the feature is a silent no-op. "
    + "Generated by tools/gen_dom_contract.mjs — a static scan, do not hand-edit.",
  contractVersion: 2,
  totals: {
    modules: Object.keys(modules).length,
    domIds: allIds.size,
    globals: globals.size,
  },
  domIds: [...allIds].sort(),
  globals: Object.fromEntries(
    [...globals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, { readBy, writtenBy }]) => [name, {
        providedBy: writtenBy.size ? [...writtenBy].sort() : "embedder",
        readBy: [...readBy].sort(),
      }]),
  ),
  modules: Object.fromEntries(Object.entries(modules).sort(([a], [b]) => a.localeCompare(b))),
};

const outfile = resolve(REPO_ROOT, process.argv[2] || "contract-dom.json");
writeFileSync(outfile, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(
  `contract-dom: ${out.totals.modules} modules, ${out.totals.domIds} DOM ids -> `
  + relative(REPO_ROOT, outfile).split(sep).join("/"),
);
