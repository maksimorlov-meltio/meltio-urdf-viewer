#!/usr/bin/env node
// Entry gate: every root-absolute asset urdf.html references must be a file
// that is TRACKED BY GIT — not merely present in this working tree.
//
//   node tools/check_entry.mjs
//
// Why this exists: phase C committed an urdf.html whose data-app-entry pointed
// at the esbuild bundle in static/dist/, which .gitignore excludes. The bundle
// existed on the dev machine, so nothing looked broken — but a fresh clone
// served a 404 for the app entry and started with a dead HMI (finding ARQ-1,
// docs/evaluacion-calidad-software.md). "Exists locally" is not the property
// that matters; "ships in the repo" is.
//
// Exits 0 when every reference resolves to a tracked file, 1 with a report.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const HTML = join("apps", "dev-host", "src", "avisualizer", "web", "static", "urdf.html");

// URL prefix -> repo-relative directory. Mirrors the StaticFiles mounts in
// apps/dev-host/src/avisualizer/web/app.py; keep the two in step.
const MOUNTS = [
  ["/static/", "apps/dev-host/src/avisualizer/web/static/"],
  ["/hmi/", "hmi/"],
  ["/viewer/", "viewer/"],
];

const html = readFileSync(join(REPO_ROOT, HTML), "utf8");

// Every <script src="/…"> and <link href="/…"> — the app entry is just the one
// carrying data-app-entry, but the whole shell has the same failure mode.
const refs = [];
for (const m of html.matchAll(/<(script|link)\b[^>]*\b(?:src|href)="(\/[^"]*)"/g)) {
  refs.push({ tag: m[1], url: m[2].replace(/\?.*$/, "") });
}
if (!/<script\b[^>]*\bdata-app-entry\b[^>]*\bsrc="\/[^"]*"/.test(html)) {
  console.error(`entry: no root-absolute data-app-entry <script> in ${HTML}`);
  process.exit(1);
}

// One `git ls-files` for the whole set: cheaper than a spawn per reference, and
// it answers exactly the question we care about (tracked, not just on disk).
const paths = [];
const failures = [];
for (const ref of refs) {
  const mount = MOUNTS.find(([prefix]) => ref.url.startsWith(prefix));
  if (!mount) {
    failures.push(`${ref.url} — no matching mount (${MOUNTS.map((m) => m[0]).join(", ")})`);
    continue;
  }
  paths.push(mount[1] + ref.url.slice(mount[0].length));
}

const tracked = new Set(
  execFileSync("git", ["ls-files", "-z", "--", ...paths], { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\0")
    .filter(Boolean),
);
for (const path of paths) {
  if (!tracked.has(path)) failures.push(`${path} — referenced by ${HTML} but not tracked by git`);
}

if (failures.length) {
  console.error("entry: urdf.html references files a fresh clone will not have:");
  for (const line of failures) console.error(`  - ${line}`);
  console.error("\nRun `npm run build:dev` to point the app entry back at the raw source.");
  process.exit(1);
}
console.log(`entry: ${paths.length} shell references, all tracked.`);
