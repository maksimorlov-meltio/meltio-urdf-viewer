#!/usr/bin/env python3
"""Set or clear a user's sign-in password in database/permissions.json.

The backend stores per-user PBKDF2-HMAC-SHA256 credentials (`salt` +
`passwordHash`) inside the roles/users permissions document; login
(POST /api/auth/login) validates against them. The password is never stored in
clear text, and the fields are stripped before the document is served to the
browser. The user entry itself (id, name, roleId, ...) is managed from the
permissions UI — this tool only sets the password of an EXISTING user.

Usage
-----
    # Prompts for the password (not echoed):
    python set_password.py --username operator1

    # Non-interactive (e.g. provisioning script); avoid shell history leaks:
    python set_password.py --username operator1 --password "s3cret"

    # Remove a user's credential (they can no longer sign in):
    python set_password.py --username operator1 --delete

The store path defaults to the app's database/permissions.json; override with
--store.
"""
from __future__ import annotations

import argparse
import binascii
import getpass
import hashlib
import json
import secrets
from pathlib import Path

from avisualizer.web.app import PERMISSIONS_STORE


# app.py's _hash_password is nested inside create_app(); replicate the exact
# algorithm (same params) rather than instantiating a whole app to reach it.
def _hash_password(password: str, salt_hex: str) -> str:
    salt = binascii.unhexlify(salt_hex)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000)
    return binascii.hexlify(dk).decode()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--username", required=True, help="Sign-in username (must already exist in the users list).")
    parser.add_argument("--password", default=None, help="Password (omit to be prompted, not echoed).")
    parser.add_argument("--delete", action="store_true", help="Remove this username's credential.")
    parser.add_argument("--store", type=Path, default=PERMISSIONS_STORE, help="Path to permissions.json.")
    args = parser.parse_args()

    store: Path = args.store
    try:
        doc = json.loads(store.read_text(encoding="utf-8")) if store.exists() else {}
    except (OSError, ValueError):
        doc = {}
    users = doc.get("users") if isinstance(doc, dict) else None
    if not isinstance(users, list) or not users:
        print(f"No users found in {store} — create the user from the permissions UI first.")
        return 1

    match = None
    for user in users:
        if isinstance(user, dict) and str(user.get("username", "")).strip().lower() == args.username.lower():
            match = user
            break
    if match is None:
        known = ", ".join(str(u.get("username", "?")) for u in users if isinstance(u, dict))
        print(f"No user '{args.username}' in {store}. Known usernames: {known}")
        return 1

    if args.delete:
        removed = match.pop("salt", None) is not None or match.pop("passwordHash", None) is not None
        if not removed:
            print(f"User '{args.username}' has no credential to remove.")
            return 1
    else:
        password = args.password if args.password is not None else getpass.getpass("Password: ")
        if not password:
            parser.error("password must not be empty")
        salt_hex = secrets.token_hex(16)
        match["salt"] = salt_hex
        match["passwordHash"] = _hash_password(password, salt_hex)

    store.parent.mkdir(parents=True, exist_ok=True)
    store.write_text(json.dumps(doc, indent=2, ensure_ascii=False), encoding="utf-8")
    action = "Removed" if args.delete else "Saved"
    print(f"{action} credential for '{args.username}' in {store}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
