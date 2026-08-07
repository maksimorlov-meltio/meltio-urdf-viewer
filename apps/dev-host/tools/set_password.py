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

    # Bootstrap a fresh install: create the first user AND its password. The
    # store does not exist in a fresh clone (database/ is gitignored), and the
    # permissions UI needs an `admin.users` session to open — so without this
    # there is no way in:
    python set_password.py --create --username admin --role role_admin

The store path defaults to the app's database/permissions.json; override with
--store. `--create` writes the built-in roles (Operator / Operator+ / Meltio
Support / Administrator) if the document has none yet.
"""
from __future__ import annotations

import argparse
import binascii
import getpass
import hashlib
import json
import secrets
from pathlib import Path

from avisualizer.web.app import DEFAULT_PERMISSIONS_DOC, PERMISSIONS_STORE
from avisualizer.web.services.atomic_file import write_text_atomic


# app.py's _hash_password is nested inside create_app(); replicate the exact
# algorithm (same params) rather than instantiating a whole app to reach it.
def _hash_password(password: str, salt_hex: str) -> str:
    salt = binascii.unhexlify(salt_hex)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000)
    return binascii.hexlify(dk).decode()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--username", required=True, help="Sign-in username.")
    parser.add_argument("--password", default=None, help="Password (omit to be prompted, not echoed).")
    parser.add_argument("--delete", action="store_true", help="Remove this username's credential.")
    parser.add_argument("--create", action="store_true",
                        help="Create the user (and the built-in roles) if missing. Use to bootstrap a fresh install.")
    parser.add_argument("--role", default="role_admin",
                        help="Role id for --create (default: role_admin, the only role that can open the permissions UI).")
    parser.add_argument("--store", type=Path, default=PERMISSIONS_STORE, help="Path to permissions.json.")
    args = parser.parse_args()

    store: Path = args.store
    try:
        doc = json.loads(store.read_text(encoding="utf-8")) if store.exists() else {}
    except (OSError, ValueError):
        doc = {}
    if not isinstance(doc, dict):
        doc = {}
    if args.create and not doc.get("roles"):
        doc["roles"] = json.loads(json.dumps(DEFAULT_PERMISSIONS_DOC["roles"]))
    users = doc.get("users")
    if not isinstance(users, list):
        users = []
        doc["users"] = users
    if not users and not args.create:
        print(f"No users found in {store} — bootstrap one with --create (see --help).")
        return 1

    match = None
    for user in users:
        if isinstance(user, dict) and str(user.get("username", "")).strip().lower() == args.username.lower():
            match = user
            break
    if match is None and args.create:
        if args.delete:
            parser.error("--create and --delete are mutually exclusive")
        known_roles = {r.get("id") for r in doc.get("roles", []) if isinstance(r, dict)}
        if args.role not in known_roles:
            print(f"No role '{args.role}' in {store}. Known roles: {', '.join(sorted(map(str, known_roles)))}")
            return 1
        match = {
            "id": f"u_{args.username.strip().lower()}",
            "name": args.username.strip(),
            "username": args.username.strip(),
            "roleId": args.role,
        }
        users.append(match)
        print(f"Created user '{args.username}' with role '{args.role}'.")
    if match is None:
        known = ", ".join(str(u.get("username", "?")) for u in users if isinstance(u, dict))
        print(f"No user '{args.username}' in {store}. Known usernames: {known} (or pass --create)")
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

    # Atomic, same as the server's own writer (SEG-4). This is the SECOND,
    # uncoordinated writer of the authorization store: it can run while the
    # console is up, so a plain write_text would let the running server read a
    # half-written document and authorise against it.
    write_text_atomic(store, json.dumps(doc, indent=2, ensure_ascii=False))
    action = "Removed" if args.delete else "Saved"
    print(f"{action} credential for '{args.username}' in {store}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
