"""Direct-to-S3 upload support for large sensor CSVs.

The browser uploads the (often >100 MB) ``Sensors.csv`` straight to S3 with a
presigned ``PUT`` URL, bypassing the Cloudflare 100 MB edge limit and the
tunnel. The processing endpoints then reference the object by key and the server
downloads it once (cached locally), so a dataset's many views don't re-upload
the file.

Storage is configured via environment variables so the same code targets AWS S3
in the cloud and a MinIO endpoint on-prem:

* ``AV_S3_BUCKET``       — bucket name; when unset, S3 uploads are disabled and
                           the app falls back to the legacy multipart upload.
* ``AV_S3_REGION``       — bucket region (e.g. ``eu-north-1``).
* ``AV_S3_ENDPOINT_URL`` — optional; set to a MinIO endpoint for on-prem.
* ``AV_S3_PREFIX``       — key prefix for uploads (default ``uploads/``).
* ``AV_S3_URL_EXPIRY``   — presigned URL lifetime in seconds (default 900).
"""

from __future__ import annotations

import os
import re
import tempfile
import threading
import uuid
from pathlib import Path

# boto3 is imported lazily so the app still starts (with S3 disabled) if it or
# its credentials are unavailable.


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def s3_enabled() -> bool:
    """True when a bucket is configured (otherwise the legacy path is used)."""
    return bool(_env("AV_S3_BUCKET"))


def _bucket() -> str:
    return _env("AV_S3_BUCKET")


def _prefix() -> str:
    return _env("AV_S3_PREFIX", "uploads/")


def _expiry() -> int:
    try:
        return int(_env("AV_S3_URL_EXPIRY", "900"))
    except ValueError:
        return 900


_client = None
_client_lock = threading.Lock()


def _get_client():
    """Lazily build a cached boto3 S3 client (thread-safe)."""
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                import boto3  # imported here so a missing dep doesn't break startup
                from botocore.config import Config

                region = _env("AV_S3_REGION")
                endpoint = _env("AV_S3_ENDPOINT_URL")
                # Virtual-hosted + SigV4 + the *regional* endpoint, so presigned
                # PUTs go straight to e.g. bucket.s3.eu-north-1.amazonaws.com.
                # The global host (bucket.s3.amazonaws.com) 307-redirects for
                # newer regions, which a browser PUT can't follow (CORS + body).
                kwargs: dict[str, object] = {
                    "config": Config(
                        signature_version="s3v4",
                        s3={"addressing_style": "virtual"},
                    )
                }
                if region:
                    kwargs["region_name"] = region
                if endpoint:
                    kwargs["endpoint_url"] = endpoint
                elif region:
                    kwargs["endpoint_url"] = f"https://s3.{region}.amazonaws.com"
                _client = boto3.client("s3", **kwargs)
    return _client


def _safe_name(filename: str) -> str:
    """A conservative, path-free object-name suffix derived from ``filename``."""
    name = Path(filename or "Sensors.csv").name
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("_")
    return name or "Sensors.csv"


def presign_put(filename: str) -> dict[str, str]:
    """Create a unique key and a presigned ``PUT`` URL for the browser to use."""
    key = f"{_prefix()}{uuid.uuid4().hex}/{_safe_name(filename)}"
    url = _get_client().generate_presigned_url(
        "put_object",
        Params={"Bucket": _bucket(), "Key": key},
        ExpiresIn=_expiry(),
    )
    return {"key": key, "url": url}


def _valid_key(key: str) -> bool:
    """Guard: only accept keys under our prefix, no traversal."""
    return bool(key) and key.startswith(_prefix()) and ".." not in key


# Local cache of downloaded objects so a dataset's multiple view requests reuse
# a single download for the lifetime of the process.
_cache_dir = Path(tempfile.gettempdir()) / "avisualizer_s3_cache"
_downloads: dict[str, Path] = {}
_downloads_lock = threading.Lock()


def download_to_temp(key: str) -> Path:
    """Download object ``key`` to a local file, caching by key. Raises on bad key."""
    if not _valid_key(key):
        raise ValueError(f"Invalid upload key: {key!r}")
    with _downloads_lock:
        cached = _downloads.get(key)
        if cached is not None and cached.exists():
            return cached
        _cache_dir.mkdir(parents=True, exist_ok=True)
        local = _cache_dir / f"{uuid.uuid4().hex}.csv"
        _get_client().download_file(_bucket(), key, str(local))
        _downloads[key] = local
        return local


def delete(key: str) -> None:
    """Best-effort delete of the S3 object and its local cache entry."""
    if not _valid_key(key):
        return
    try:
        _get_client().delete_object(Bucket=_bucket(), Key=key)
    except Exception:  # pragma: no cover - cleanup is best-effort
        pass
    with _downloads_lock:
        local = _downloads.pop(key, None)
    if local is not None:
        local.unlink(missing_ok=True)
