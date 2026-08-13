from __future__ import annotations

import argparse
import json
import re
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path


ROW_PATTERN = re.compile(
    r'"C0"\s*:\s*"(?P<style>[^"]*)"\s*,\s*'
    r'"C1"\s*:\s*"(?P<color>[^"]*)"\s*,\s*'
    r'"C2"\s*:\s*"(?P<source>[^"]*)"'
)


def clean(value: str) -> str:
    return value.strip().replace("\t", "")


def safe_skc(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9+_-]+", "-", value.upper()).strip("-")
    return normalized or "SKC"


def read_config(path: Path) -> tuple[str, str]:
    source = path.read_text(encoding="utf-8-sig")
    url = re.search(r'url:\s*"([^"]+)"', source)
    key = re.search(r'anonKey:\s*"([^"]+)"', source)
    if not url or not key:
        raise ValueError("Supabase config is incomplete")
    return url.group(1).rstrip("/"), key.group(1)


def source_rows(path: Path, started_at: datetime) -> list[dict[str, str]]:
    raw = path.read_text(encoding="utf-8-sig")
    rows: list[dict[str, str]] = []
    for index, match in enumerate(ROW_PATTERN.finditer(raw)):
        style = clean(match.group("style"))
        color = clean(match.group("color"))
        source_name = clean(match.group("source"))
        if not style or not color or not source_name:
            continue
        extension = Path(source_name).suffix.lower().lstrip(".") or "jpg"
        stamp = (started_at + timedelta(seconds=index)).strftime("%Y%m%d%H%M%S")
        rows.append({
            "style": style,
            "color": color,
            "sourceName": source_name,
            "imageName": f"{safe_skc(style)}_{stamp}.{extension}",
            "status": "pending-source-download",
        })
    return rows


def write_browser_catalog(path: Path, rows: list[dict[str, str]]) -> None:
    payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    path.write_text(f"window.COZ_IMAGE_CATALOG = {payload};\n", encoding="utf-8")


def request_json(url: str, key: str, method: str = "GET", body: dict | None = None):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("apikey", key)
    request.add_header("Authorization", f"Bearer {key}")
    request.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(request, timeout=30) as response:
        content = response.read()
        return json.loads(content) if content else None


def product_key(style: str, color: str) -> str:
    return f"{style.strip().lower()}\0{color.strip().lower()}"


def update_cloud(url: str, key: str, rows: list[dict[str, str]]) -> tuple[int, int]:
    records = request_json(f"{url}/rest/v1/inventory_platform_state?id=eq.default&select=data", key)
    if not records:
        raise ValueError("Cloud inventory state was not found")
    document = records[0]["data"]
    state = document["state"]
    mappings = document.get("colorMappings") or {}
    for entry in rows:
        code = str(mappings.get(entry["color"]) or "").strip().upper()
        if not code:
            continue
        extension = Path(entry["imageName"]).suffix
        timestamp = Path(entry["imageName"]).stem.rsplit("_", 1)[-1]
        entry["imageName"] = f"{safe_skc(entry['style'])}-{code}_{timestamp}{extension}"
    catalog_by_key = {product_key(row["style"], row["color"]): row for row in rows}
    matched = 0
    for product in state.get("products", []):
        style = product.get("sourceBaseSku") or product.get("style") or product.get("originalStyle") or product.get("baseSku") or ""
        entry = catalog_by_key.get(product_key(style, product.get("color") or ""))
        if not entry:
            continue
        code = str(mappings.get(product.get("color")) or product.get("colorCode") or "").strip().upper()
        if code:
            extension = Path(entry["imageName"]).suffix
            timestamp = Path(entry["imageName"]).stem.rsplit("_", 1)[-1]
            entry["imageName"] = f"{safe_skc(style)}-{code}_{timestamp}{extension}"
        product["imageSourceName"] = entry["sourceName"]
        product["imageName"] = entry["imageName"]
        product["imageSyncStatus"] = "available" if product.get("image") else entry["status"]
        matched += 1
    state["imageCatalog"] = rows
    request_json(
        f"{url}/rest/v1/inventory_platform_state?id=eq.default",
        key,
        method="PATCH",
        body={"data": document, "updated_at": datetime.now().astimezone().isoformat()},
    )
    return matched, len(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Import CoZ style image metadata into the inventory catalog")
    parser.add_argument("response", type=Path)
    parser.add_argument("--output", type=Path, default=Path("assets/image-catalog.js"))
    parser.add_argument("--config", type=Path, default=Path("assets/supabase-config.js"))
    parser.add_argument("--cloud", action="store_true")
    args = parser.parse_args()
    started_at = datetime.now().replace(microsecond=0)
    rows = source_rows(args.response, started_at)
    if not rows:
        raise ValueError("No complete C0/C1/C2 image rows were found")
    if args.cloud:
        url, key = read_config(args.config)
        matched, total = update_cloud(url, key, rows)
        print(f"cloud_matched={matched} cloud_catalog={total}")
    write_browser_catalog(args.output, rows)
    unique_files = len({row["sourceName"] for row in rows})
    unique_styles = len({row["style"] for row in rows})
    print(f"catalog={len(rows)} files={unique_files} styles={unique_styles}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
