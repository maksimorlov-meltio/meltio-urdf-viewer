"""Serve a generated artefact the way a .NET host would, to verify it.

    node tools/gen_artifact.mjs --out .\artifact
    .\.venv\Scripts\python.exe tools/serve_artifact.py .\artifact http://127.0.0.1:8090 8098
    node tools/check_boot.mjs --url http://127.0.0.1:8098/index.html

Static files come from the artefact folder; /api/*, /assets/* and /slicer are
forwarded to a backend that implements contract-http.json. That split IS the
consuming architecture: a WebView2 virtual host over the release submodule,
plus the host's own implementation of those routes.

This exists because two artefact defects — an @import and a set of @font-face
URLs pointing at /static/ — were invisible to every static check and only
showed up when the thing was loaded from a folder for real. Being able to
repeat that in one command is the difference between finding the third one and
shipping it.

The proxy is deliberately dumb (no streaming, no websockets): it is a
verification harness, never a runtime.
"""
import sys, urllib.request, urllib.error
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial

ROOT = sys.argv[1]
BACKEND = sys.argv[2]          # e.g. http://127.0.0.1:8090
PORT = int(sys.argv[3])
FORWARD = ("/api/", "/assets/", "/slicer")


class Handler(SimpleHTTPRequestHandler):
    def _forwarded(self):
        return self.path.startswith(FORWARD)

    def _proxy(self, body=None):
        url = BACKEND + self.path
        req = urllib.request.Request(url, data=body, method=self.command)
        for header in ("Content-Type", "Accept"):
            if header in self.headers:
                req.add_header(header, self.headers[header])
        try:
            with urllib.request.urlopen(req, timeout=30) as upstream:
                payload = upstream.read()
                self.send_response(upstream.status)
                ctype = upstream.headers.get("Content-Type")
                if ctype:
                    self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
        except urllib.error.HTTPError as err:
            payload = err.read()
            self.send_response(err.code)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except Exception as err:                      # noqa: BLE001
            self.send_error(502, str(err))

    def do_GET(self):
        if self._forwarded():
            return self._proxy()
        return super().do_GET()

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        return self._proxy(self.rfile.read(length) if length else b"")

    def log_message(self, *args):
        pass


ThreadingHTTPServer(("127.0.0.1", PORT), partial(Handler, directory=ROOT)).serve_forever()
