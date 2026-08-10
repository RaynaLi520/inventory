from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable


EXCEL_EPOCH = datetime(1899, 12, 30, tzinfo=timezone.utc)


def clean(value: Any) -> str:
    if value is None:
        return ""
    return str(value).replace("\t", "").strip()


def number(value: Any, default: float = 0) -> float:
    if value in (None, ""):
        return default
    if isinstance(value, (int, float)):
        return float(value)
    match = re.search(r"-?\d+(?:\.\d+)?", clean(value).replace(",", ""))
    return float(match.group(0)) if match else default


def compact_number(value: float) -> int | float:
    return int(value) if value.is_integer() else value


def excel_date(value: Any) -> str | None:
    serial = number(value)
    if serial <= 0:
        return None
    return (EXCEL_EPOCH + timedelta(days=serial)).date().isoformat()


def normalize_size(value: Any) -> str:
    size = clean(value) or "F"
    return "F" if re.fullmatch(r"(?:free(?:\s*size|\s*尺码)?|均码|one\s*size|os)", size, re.IGNORECASE) else size


def query_sku(row: dict[str, Any]) -> str:
    raw_query = row.get("Query")
    if raw_query:
        try:
            query = json.loads(raw_query) if isinstance(raw_query, str) else raw_query
            sku = clean(query.get("SKU"))
            if sku:
                return sku
        except (TypeError, json.JSONDecodeError):
            pass
    return clean(row.get("C24"))


def extract_rows(payload: dict[str, Any]) -> tuple[list[dict[str, Any]], bool | None]:
    table = payload.get("table", payload)
    rows = table.get("Data")
    if not isinstance(rows, list):
        raise ValueError("The response does not contain table.Data rows")
    return rows, table.get("AllRowLoaded")


def choose_value(rows: Iterable[dict[str, Any]], key: str) -> Any:
    for row in rows:
        value = row.get(key)
        if value not in (None, ""):
            return value
    return None


def normalize_group(sku: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    stock_values = {number(row.get("C15")) for row in rows if row.get("C15") not in (None, "")}
    reserved_values = {number(row.get("C16")) for row in rows if row.get("C16") not in (None, "")}
    if len(stock_values) > 1:
        raise ValueError(f"Conflicting stock quantities for SKU {sku}: {sorted(stock_values)}")
    if len(reserved_values) > 1:
        raise ValueError(f"Conflicting reserved quantities for SKU {sku}: {sorted(reserved_values)}")

    style = clean(choose_value(rows, "C3")) or clean(choose_value(rows, "C2"))
    customer_name = clean(choose_value(rows, "C29"))
    style_note = clean(choose_value(rows, "C28"))
    total = next(iter(stock_values), 0.0)
    reserved_reported = bool(reserved_values)
    reserved = next(iter(reserved_values), 0.0)

    return {
        "sku": sku,
        "brand": clean(choose_value(rows, "C1")),
        "category": "成衣" if clean(choose_value(rows, "C0")) == "1" else clean(choose_value(rows, "C0")),
        "style_no": style,
        "product_name": customer_name or style_note or style,
        "color": clean(choose_value(rows, "C4")),
        "size": normalize_size(choose_value(rows, "C5")),
        "stocked_quantity": compact_number(total),
        "reserved_quantity": compact_number(reserved),
        "available_quantity": compact_number(max(0.0, total - reserved)),
        "reserved_reported": reserved_reported,
        "retail_price": compact_number(number(choose_value(rows, "C23"))),
        "upc": clean(choose_value(rows, "C25")),
        "primary_fabric": clean(choose_value(rows, "C26")),
        "image_path": clean(choose_value(rows, "C22")),
        "source_updated_at": excel_date(choose_value(rows, "C27")),
        "style_note": style_note,
        "customer_product_name": customer_name,
        "source_row_count": len(rows),
    }


def normalize(payload: dict[str, Any], brand: str) -> dict[str, Any]:
    rows, all_rows_loaded = extract_rows(payload)
    selected = [row for row in rows if clean(row.get("C1")).casefold() == brand.casefold()]
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in selected:
        sku = query_sku(row)
        if not sku:
            continue
        grouped.setdefault(sku, []).append(row)

    inventory = [normalize_group(sku, grouped[sku]) for sku in sorted(grouped)]
    total_stock = sum(float(item["stocked_quantity"]) for item in inventory)
    total_reserved = sum(float(item["reserved_quantity"]) for item in inventory)
    return {
        "source": "CoZ Forguncy inventory",
        "brand": brand,
        "all_rows_loaded": all_rows_loaded,
        "source_row_count": len(rows),
        "brand_row_count": len(selected),
        "sku_count": len(inventory),
        "duplicate_row_count": len(selected) - len(inventory),
        "stocked_quantity": compact_number(total_stock),
        "reserved_quantity": compact_number(total_reserved),
        "available_quantity": compact_number(max(0.0, total_stock - total_reserved)),
        "inventory": inventory,
    }


def write_csv(path: Path, inventory: list[dict[str, Any]]) -> None:
    fields = list(inventory[0]) if inventory else ["sku"]
    with path.open("w", encoding="utf-8-sig", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        writer.writerows(inventory)


def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize a Forguncy inventory response for one brand")
    parser.add_argument("response", type=Path, help="GetTableDataWithOffset response JSON")
    parser.add_argument("--brand", default="CoZ", help="Exact brand value to keep (default: CoZ)")
    parser.add_argument("--output", type=Path, help="Optional normalized .json or .csv output")
    args = parser.parse_args()

    with args.response.open(encoding="utf-8-sig") as source:
        result = normalize(json.load(source), args.brand)

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        if args.output.suffix.casefold() == ".csv":
            write_csv(args.output, result["inventory"])
        else:
            args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    summary = {key: value for key, value in result.items() if key != "inventory"}
    json.dump(summary, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
