#!/usr/bin/env python3
"""Create or update a sign-in credential in database/credentials.json.

Credentials are stored as PBKDF2-HMAC-SHA256 records, separate from the public
roles/users document (database/permissions.json). The password is never stored
in clear text. The role/name shown after sign-in come from the permissions
document (matched by username), so add the user there too.

Usage
-----
    # Prompts for the password (not echoed):
    python set_password.py --username operator1

    # Non-interactive (e.g. provisioning script); avoid shell history leaks:
    python set_password.py --username operator1 --password "s3cret"

    # Remove a credential:
    python set_password.py --username operator1 --delete

The store path defaults to ../database/credentials.json relative to this file;
override with --store.
"""
from __future__ import annotations

import argparse
import getpass
import json
from pathlib import Path

from avisualizer.web.app import CREDENTIALS_STORE, _hash_password


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--username", required=True, help="Sign-in username.")
    parser.add_argument("--password", default=None, help="Password (omit to be prompted, not echoed).")
    parser.add_argument("--delete", action="store_true", help="Remove this username's credential.")
    parser.add_argument("--store", type=Path, default=CREDENTIALS_STORE, help="Path to credentials.json.")
    args = parser.parse_args()

    store: Path = args.store
    try:
        credentials = json.loads(store.read_text(encoding="utf-8")) if store.exists() else {}
    except (OSError, ValueError):
        credentials = {}
    if not isinstance(credentials, dict):
        credentials = {}

    if args.delete:
        if credentials.pop(args.username, None) is None:
            print(f"No credential for '{args.username}'.")
            return 1
    else:
        password = args.password if args.password is not None else getpass.getpass("Password: ")
        if not password:
            parser.error("password must not be empty")
        credentials[args.username] = _hash_password(password)

    store.parent.mkdir(parents=True, exist_ok=True)
    store.write_text(json.dumps(credentials, indent=2), encoding="utf-8")
    action = "Removed" if args.delete else "Saved"
    print(f"{action} credential for '{args.username}' in {store}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
