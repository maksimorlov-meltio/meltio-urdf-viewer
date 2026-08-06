#!/usr/bin/env python3
"""Regenerate database/error_codes.json from CSV exports of the master sheet.

The master fault-code list lives in a Google Sheet (one tab of Errors, one tab
of Warnings). Export each tab as CSV, then run this importer to (re)build the
catalog the console pulls from /api/error-codes.

Usage
-----
    python import_error_codes.py --errors errors.csv --warnings warnings.csv \
        --out ../database/error_codes.json

Each CSV is expected to have a header row and these columns (extra columns are
ignored; order does not matter as long as the headers match, case-insensitive):

    code, description, cause, engine_action, remediation

`remediation` may hold several steps separated by '-', '•', or newlines. `code`
must look like `200.5.4` / `10F.0.0`. Rows without a valid code are skipped.

This writes FLAT per-code entries (one row = one entry). The runtime resolver
also understands compressed `codePrefix` families (see error_codes.json), but
flat entries are simplest to generate and fully supported.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path

CODE_RE = re.compile(r"^[0-9A-Fa-f]{2,3}\.\d+\.\d+$")
MODULE_NAMES = {
    "200": "Engine / Master Controller (ECU)",
    "103": "Module detection / Laser Control Unit (LCU)",
    "106": "Process control / Head Control Unit (HCU)",
    "108": "Protection glass / load cell",
    "10F": "Argon flow / pressure",
    "11F": "Oxygen sensors / inert bubble (IGC)",
}


def _norm(header: str) -> str:
    return re.sub(r"[^a-z]", "", (header or "").lower())


def _split_steps(text: str) -> list[str]:
    if not text:
        return []
    # Split on bullet markers / dashes at step boundaries, then tidy.
    parts = re.split(r"\s*(?:•|(?<!\w)-\s)|\n+", text)
    steps = [p.strip(" -•\t") for p in parts if p and p.strip(" -•\t")]
    return steps


def _title_from(description: str) -> str:
    # Sheet descriptions are "CAPS TITLE: detail" — take the CAPS prefix as title.
    head = (description or "").split(":", 1)[0].strip()
    if head and head.upper() == head and len(head) > 3:
        return head.title()
    return (description or "").strip()[:80] or "Fault"


def _load(path: Path, cls: str) -> list[dict]:
    rows: list[dict] = []
    with path.open(newline="", encoding="utf-8-sig") as fh:
        reader = csv.reader(fh)
        header = next(reader, None)
        if not header:
            return rows
        cols = {_norm(h): i for i, h in enumerate(header)}

        def cell(row: list[str], key: str) -> str:
            i = cols.get(key)
            return row[i].strip() if i is not None and i < len(row) else ""

        for row in reader:
            code = cell(row, "code")
            if not CODE_RE.match(code):
                continue
            desc = cell(row, "description")
            rows.append({
                "code": code,
                "class": cls,
                "module": code.split(".", 1)[0],
                "title": _title_from(desc),
                "description": desc,
                "cause": cell(row, "cause"),
                "engineAction": cell(row, "engineaction"),
                "remediation": _split_steps(cell(row, "remediation")),
            })
    return rows


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--errors", type=Path, help="CSV export of the Errors tab")
    ap.add_argument("--warnings", type=Path, help="CSV export of the Warnings tab")
    ap.add_argument("--out", type=Path, required=True, help="destination error_codes.json")
    args = ap.parse_args()

    codes: list[dict] = []
    if args.errors:
        codes += _load(args.errors, "error")
    if args.warnings:
        codes += _load(args.warnings, "warning")

    doc = {
        "version": 1,
        "source": "M600 / Engine V4 error-code sheet",
        "modules": MODULE_NAMES,
        "codes": codes,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(doc, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(codes)} codes to {args.out}")


if __name__ == "__main__":
    main()
