from __future__ import annotations

import argparse
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("seed", type=Path)
    parser.add_argument("url")
    parser.add_argument("anon_key")
    args = parser.parse_args()

    source = args.seed.read_text(encoding="utf-8")
    prefix = "window.BUNDLE_SEED = "
    if not source.startswith(prefix) or not source.rstrip().endswith(";"):
        raise ValueError("Invalid bundle seed")
    bundles = json.loads(source[len(prefix):].strip()[:-1])

    headers = {"apikey": args.anon_key, "Authorization": f"Bearer {args.anon_key}"}
    with urllib.request.urlopen(urllib.request.Request(args.url, headers=headers), timeout=30) as response:
        row = json.load(response)[0]
    document = row["data"]
    existing = document["state"].get("bundles") or []
    custom = [bundle for bundle in existing if not str(bundle.get("id", "")).startswith("IMPORT-")]
    document["state"]["bundles"] = custom + bundles

    body = json.dumps({"data": document, "updated_at": datetime.now(timezone.utc).isoformat()}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        args.url.replace("&select=data", ""),
        data=body,
        method="PATCH",
        headers={**headers, "Content-Type": "application/json", "Prefer": "return=representation"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        updated = json.load(response)[0]["data"]["state"]["bundles"]
    print(json.dumps({"total": len(updated), "imported": sum(str(bundle.get("id", "")).startswith("IMPORT-") for bundle in updated), "custom": len(custom)}))


if __name__ == "__main__":
    main()
