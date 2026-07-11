"""Web interface for aslicer: a Three.js viewer over a FastAPI backend."""

from __future__ import annotations

from .app import create_app, run

__all__ = ["create_app", "run"]
