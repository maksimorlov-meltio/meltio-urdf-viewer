"""Auth seam: identity from the front layer, with provisioning."""

from __future__ import annotations

from meltio_platform import auth
from meltio_platform.auth import ACCESS_EMAIL_HEADER
from meltio_platform.models import Org


def test_me_requires_authentication(client) -> None:
    # No Cloudflare Access header and no dev fallback configured → 401.
    response = client.get("/api/me")
    assert response.status_code == 401


def test_me_provisions_user_and_org(client) -> None:
    response = client.get(
        "/api/me", headers={ACCESS_EMAIL_HEADER: "Alice@Meltio3d.com"}
    )
    assert response.status_code == 200
    data = response.json()
    # Email is normalised; the org is derived from the email domain.
    assert data["email"] == "alice@meltio3d.com"
    assert data["displayName"] == "alice"
    assert data["org"]["slug"] == "meltio3d.com"


def test_provisioning_is_idempotent(client) -> None:
    first = client.get(
        "/api/me", headers={ACCESS_EMAIL_HEADER: "bob@meltio3d.com"}
    ).json()
    second = client.get(
        "/api/me", headers={ACCESS_EMAIL_HEADER: "bob@meltio3d.com"}
    ).json()
    assert first["id"] == second["id"]
    assert first["org"]["id"] == second["org"]["id"]


def test_org_creation_recovers_from_race(session, monkeypatch) -> None:
    """A concurrent request can win the org insert between our SELECT and INSERT;
    _get_or_create_org must recover instead of raising the unique violation."""
    domain = "race.com"
    # Simulate the winning request having already committed the org.
    session.add(Org(name=domain, slug=domain))
    session.commit()

    # Force our existence check to miss once, so we attempt a conflicting insert.
    real_scalar = session.scalar
    calls = {"n": 0}

    def flaky_scalar(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return None  # pretend the org isn't there yet
        return real_scalar(*args, **kwargs)

    monkeypatch.setattr(session, "scalar", flaky_scalar)
    org = auth._get_or_create_org(session, domain)
    assert org is not None
    assert org.slug == domain


def test_same_domain_shares_org(client) -> None:
    one = client.get(
        "/api/me", headers={ACCESS_EMAIL_HEADER: "carol@meltio3d.com"}
    ).json()
    two = client.get(
        "/api/me", headers={ACCESS_EMAIL_HEADER: "dave@meltio3d.com"}
    ).json()
    assert one["id"] != two["id"]
    assert one["org"]["id"] == two["org"]["id"]
