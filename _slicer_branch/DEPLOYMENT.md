# Deployment

How the slicer (`aslicer`) and visualizer (Meltio Orbit / `avisualizer`) are
packaged and shipped. Written to be followed step by step.

## Architecture (target)

```
 GitHub push to main
      │  Actions: build 2 images → push to GHCR → ssh deploy
      ▼
 ┌──────────────── single EC2 box (Ubuntu) ────────────────┐
 │  cloudflared ─ tunnel ─► Cloudflare Access (SSO login)   │
 │       │                                                  │
 │     Caddy ──► orbit   (Meltio Orbit / avisualizer :8080) │
 │          └──► slicer  (aslicer :8765)                    │
 │                                                          │
 │  + a dev stack (hot-reload) for laptop + phone editing   │
 └──────────────────────────────────────────────────────────┘
        Reachable on the internet, but only after SSO login
        restricted to @meltio3d.com accounts.
```

Design rules we hold to (so this scales to a cloud platform and to on-prem
self-hosting later):

- **Apps stay infrastructure-agnostic.** Auth is enforced by the layer in
  front (Cloudflare Access), never hand-rolled into the apps. Data roots are
  config-driven (`MELTIO_ORBIT_ASSETS_ROOT`, `MELTIO_ORBIT_DATABASE_ROOT`).
- **The image is the source of truth.** No hand-editing on the server.
- **Image owner is parameterised** (`IMAGE_OWNER` in `.env`) so an org rename
  is a one-line change.

## Decisions (2026-06-21)

- **Web-only platform.** The visualizer is `avisualizer` (FastAPI web app),
  served in the browser. The desktop Meltio Orbit distribution (WebView2 host,
  PyInstaller EXE build/sign/release scripts, `dist/meltio-orbit-releases/`) is
  **deprecated** — no users need migrating off the EXE. To be removed in a
  later cleanup; "Meltio Orbit" may continue as the product/brand name.
- **C++ slicer-core rebuild targets Linux only**, compiled inside the Docker
  image. No Windows/MSVC build (the desktop app is going away). Revisit with
  CMake only if a Windows target ever returns.
- **One artifact, three modes.** The same `docker compose` stack is local dev,
  the internal AWS server, and on-prem customer self-hosting.
- **Dev moves to WSL2** (repo cloned into the Linux filesystem, VS Code
  Remote-WSL) before the C++ work, so the local toolchain matches prod.
- **Access via Cloudflare Tunnel + Access** (SSO restricted to `@meltio3d.com`),
  not Tailscale, because a real sign-in / user model is wanted. Apps stay
  auth-agnostic so this front layer stays swappable.

## Roadmap

| Phase | What | Who | Status |
|-------|------|-----|--------|
| 1 | Containerize + run locally | Claude builds, you test | **done — test it** |
| 2 | Build & push images to GHCR via GitHub Actions | Claude built, you push | **done — push to test** |
| 3 | EC2 box + Cloudflare Tunnel + Access (the server) | You, with steps | **ready — follow steps** |
| 4 | Auto-deploy on push to main | Claude + you paste secrets | **done** |
| 5 | Dev stack + phone (code-server) + Remote-SSH | Claude + you connect | todo |

---

## Phase 1 — run both services in containers on your laptop

This needs **no AWS, no server, no cost**. It proves the containers work
before anything goes near the cloud.

### 1. Install Docker Desktop

Download and install Docker Desktop for Windows, then launch it and wait until
it says "Engine running". That's the only prerequisite.

### 2. Create your local env file

From the repo root:

```bash
cp .env.example .env
```

The defaults are fine for local testing.

### 3. Build and start both services

```bash
docker compose up --build
```

The first build takes a few minutes (it downloads Python, open3d and the
scientific libraries). Later builds are fast thanks to the pip cache.

When it finishes, open:

- Meltio Orbit (visualizer): http://localhost:8080
- Slicer: http://localhost:8765

Health checks (should each return `{"status":"ok"}`):

- http://localhost:8080/health
- http://localhost:8765/api/health

### 4. Stop

Press `Ctrl+C`, then:

```bash
docker compose down
```

(Your slicer machine profiles persist in the `slicer_profiles` Docker volume.)

### Troubleshooting

- **Orbit build fails on open3d** — confirm the base image is `python:3.11`
  (open3d has no wheels for 3.13/3.14). If import fails at runtime with a
  missing `.so`, add the offending lib to the `apt-get install` line in
  `projects/avisualizer/Dockerfile` (start with `libglu1-mesa`).
- **Port already in use** — something else is on 8080/8765. Change the left
  side of the mapping in `docker-compose.override.yml` (e.g. `"18080:8080"`).
- **Datasets** are never baked into the image (`database/` is in the Orbit
  `.dockerignore`). Locally they're bind-mounted from
  `projects/avisualizer/database/` via `docker-compose.override.yml`, so Orbit
  sees your real sensor data. On the server they'll come from a data volume
  (Phase 3). If Orbit shows no data locally, confirm that folder has datasets.

---

## Phase 2 — build & publish images to GHCR

The workflow `.github/workflows/deploy.yml` builds both images on Linux and
pushes them to GHCR on every push to `main` (and on manual dispatch). Tags:
`:latest` and `:<git-sha>`.

### What you do

1. Commit and push the deployment files to `main` (or open a PR and merge).
2. Open the repo's **Actions** tab and watch the `build-and-publish` run.
3. On success, the images appear under the org's **Packages**:
   `ghcr.io/machine-software/orbit` and `ghcr.io/machine-software/aslicer`.

### Likely one-time hiccups (and fixes)

- **`denied: permission_installation` / push rejected** — org package
  permissions. An org owner sets *Org → Settings → Packages* (or *Actions →
  General → Workflow permissions*) to allow Actions to create/write packages.
  This is the one spot that may need an owner rather than a member.
- **Build fails on a Dockerfile step** — same fix as local; the Linux build is
  the source of truth, so fix the Dockerfile and push again.
- **Package is private** — fine for deployment (the server authenticates).
  Leave it private.

## Phase 3 — the server (EC2 + Cloudflare Tunnel + Access)

Outcome: both apps reachable at `https://orbit.meltio.cloud` and
`https://slicer.meltio.cloud`, behind a Cloudflare SSO login restricted to
`@meltio3d.com`, on a box with no open inbound ports except SSH.

With Cloudflare Tunnel there is **no Caddy** — `cloudflared` routes each
hostname directly to a container and Cloudflare handles TLS + the login.

### Step 0 — publish the images (prerequisite)

The server pulls images from GHCR, so they must exist there first. Merge this
branch to `main`; the `build-and-publish` workflow then pushes
`ghcr.io/machine-software/{orbit,aslicer}`. Confirm under the repo's Packages.
(If an org owner needs to allow Actions to write packages, see Phase 2.)

### Step 1 — launch the EC2 instance

1. AWS Console → EC2 → **Launch instance**.
2. Name: `meltio-services`. AMI: **Ubuntu Server 24.04 LTS**.
3. Instance type: **t3.xlarge** (4 vCPU / 16 GB).
4. Key pair: create one (e.g. `meltio`) and download the `.pem` — that's your
   SSH key.
5. Storage: **50 GB gp3**.
6. Network / security group — **inbound rules: SSH (22) from *My IP* only**.
   Do NOT open 80/443; the tunnel dials out.
7. Launch. Note the public IP (only used for SSH).

### Step 2 — install Docker on the box

SSH in (`ssh -i meltio.pem ubuntu@<public-ip>`) and run:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit   # then SSH back in so the group takes effect
```

### Step 3 — get the compose files + log in to GHCR

```bash
git clone https://github.com/Machine-Software/process-intelligence-repo.git
cd process-intelligence-repo

# Authenticate to pull the (private) images. Use a GitHub Personal Access
# Token with read:packages. Paste it as the password.
docker login ghcr.io -u <your-github-username>
```

### Step 4 — Cloudflare: domain, tunnel, hostnames, login

In the Cloudflare dashboard (one-time):

1. **Add `meltio.cloud` to Cloudflare** (Websites → Add a site) and update the
   nameservers at your registrar. Wait until the zone shows **Active**.
2. **Zero Trust → Networks → Tunnels → Create a tunnel** (type: *Cloudflared*).
   Name it `meltio`. Copy the **tunnel token** it shows.
3. In the tunnel's **Public Hostnames**, add two:
   - `orbit.meltio.cloud`  → Service: `HTTP`  →  `orbit:8080`
   - `slicer.meltio.cloud` → Service: `HTTP`  →  `slicer:8765`
   (These names resolve on the Docker network the containers share.)
4. **Zero Trust → Access → Applications → Add a self-hosted app** for each
   hostname. Policy: **Allow** when *emails ending in* `@meltio3d.com`. This is
   the sign-in gate.

### Step 5 — configure and start the prod stack

On the box, create `.env`:

```bash
cp .env.example .env
# edit .env: set TUNNEL_TOKEN=<token from step 4.2>
nano .env
```

Then pull and start (note the explicit `-f` flags — this skips the local
override and uses the prod overrides):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

Visit `https://orbit.meltio.cloud` — you should get a Cloudflare login, then Orbit.

### Step 6 — load data

The server's `orbit_database` volume starts empty. Either upload datasets
through the Orbit UI, or `scp` data up and copy it into the volume. Slicer
machine profiles persist automatically in the `slicer_profiles` volume.

### Redeploys (manual for now; automated in Phase 4)

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Phase 4 — auto-deploy on push to main

The `deploy` job in `.github/workflows/deploy.yml` runs after the images build:
it SSHes into the server, syncs the compose files, and runs
`docker compose pull && up -d` (then prunes old images). Every push to `main`
now ships automatically (~2-3 min end to end).

**Required GitHub repo secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|-------|
| `SSH_HOST` | the server's public IP |
| `SSH_USER` | `ubuntu` |
| `SSH_PRIVATE_KEY` | a CI deploy key (ed25519); its public half is in the server's `~/.ssh/authorized_keys` |

The deploy key is dedicated to CI and revocable independently of personal keys
(remove its line from `authorized_keys` to revoke). Images are pulled by the
`:latest` tag; to roll back, set `TAG=<git-sha>` in the server's `~/meltio/.env`
and re-run `compose up -d`.

## Phase 5

Documented here as each is built. Not yet implemented.
