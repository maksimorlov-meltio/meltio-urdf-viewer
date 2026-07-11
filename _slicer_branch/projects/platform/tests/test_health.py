"""Smoke tests for the platform scaffold and health probes."""

from __future__ import annotations


def test_health_ok(client) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_index_served(client) -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert "Meltio platform" in response.text


def test_health_db_ok(client) -> None:
    response = client.get("/health/db")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
