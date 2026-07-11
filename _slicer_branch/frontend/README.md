# frontend/

The platform's SPA now lives **with the platform** at
[`projects/platform/frontend/`](../projects/platform/frontend/) — inside the
image build context, and so it travels with the platform on any future repo
split. It's a static Vite + React build served by the platform service (no SSR;
zero runtime cost on a customer box).

This top-level folder is kept only as a pointer. Shared, cross-project code
still goes in [`../libs/`](../libs/).
