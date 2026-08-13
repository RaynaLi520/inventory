from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl


ALLOWED_SIZES = {"S", "M", "L", "XL", "F"}


def text(value: object) -> str:
    return "" if value is None else str(value).strip()


def normalize_size(value: str) -> str:
    return "F" if value.lower() in {"free size", "free", "f"} else value.upper()


def product_keys(product: dict) -> set[str]:
    return {
        text(product.get(key))
        for key in ("baseSku", "sourceBaseSku", "style", "originalStyle")
        if text(product.get(key))
    }


def can_use_free_size(product: dict) -> bool:
    """Only allow F fallback for genuine one-size components such as accessories."""
    sizes = {text(size).upper() for size in (product.get("sizes") or {}) if text(size)}
    return bool(sizes) and sizes <= {"F"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook", type=Path)
    parser.add_argument("cloud_document", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    with args.cloud_document.open(encoding="utf-8-sig") as handle:
        cloud_document = json.load(handle)
    products = cloud_document["state"]["products"]

    rows = list(openpyxl.load_workbook(args.workbook, read_only=True, data_only=True).active.iter_rows(values_only=True))[1:]
    groups: dict[str, list[list[str]]] = defaultdict(list)
    rejected = Counter()
    for raw in rows:
        row = [text(value) for value in raw]
        if not all(row):
            rejected["incomplete_row"] += 1
            continue
        size = normalize_size(row[5])
        if size not in ALLOWED_SIZES:
            rejected["unsupported_size"] += 1
            continue
        row[5] = size
        groups[row[0]].append(row)

    bundles = []
    for sku, group in groups.items():
        bundle_no = re.sub(r"\s+", "", group[0][1])
        part_codes = [part for part in bundle_no.split("+") if part]
        child_styles = list(dict.fromkeys(row[2] for row in group))
        if len(part_codes) not in (2, 3) or len(child_styles) != len(part_codes):
            rejected["incomplete_components"] += 1
            continue
        if any(row[1].replace(" ", "") != bundle_no or row[3] != group[0][3] or row[4] != group[0][4] or row[5] != group[0][5] for row in group):
            rejected["inconsistent_group"] += 1
            continue

        requested_size = group[0][5]
        matched_products = []
        component_sizes = []
        valid = True
        for row in group:
            candidates = [product for product in products if row[2] in product_keys(product) and text(product.get("color")).casefold() == row[4].casefold()]
            candidates.sort(key=lambda product: text(product.get("sourceOrigin")) != "coz")
            selected = next((product for product in candidates if requested_size in (product.get("sizes") or {})), None)
            component_size = requested_size
            if selected is None:
                selected = next((product for product in candidates if can_use_free_size(product)), None)
                if selected is not None:
                    component_size = "F"
            if selected is None:
                rejected["component_color_size_missing"] += 1
                valid = False
                break
            matched_products.append(selected)
            component_sizes.append(component_size)
        if not valid:
            continue

        season_match = re.search(r"(SS|AW)(\d{2})", child_styles[0], re.IGNORECASE)
        season = f"{season_match.group(1).upper()}{season_match.group(2)}" if season_match else ""
        bundles.append({
            "id": f"IMPORT-{sku}",
            "name": " + ".join(text(product.get("name")) or style for product, style in zip(matched_products, child_styles)),
            "type": "virtual",
            "season": season,
            "color": group[0][4],
            "colorCode": group[0][3],
            "size": requested_size,
            "components": [product["id"] for product in matched_products],
            "componentSkus": [product.get("baseSku") or style for product, style in zip(matched_products, child_styles)],
            "componentSourceSkus": child_styles,
            "componentColors": [text(product.get("color")) for product in matched_products],
            "componentSizes": component_sizes,
            "componentCodes": part_codes,
            "importedSku": sku,
            "importedFrom": args.workbook.name,
            "createdAt": "2026-08-13T00:00:00.000Z",
        })

    bundles.sort(key=lambda bundle: bundle["importedSku"])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("window.BUNDLE_SEED = " + json.dumps(bundles, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(json.dumps({"source_rows": len(rows), "candidate_groups": len(groups), "imported_bundles": len(bundles), "sizes": Counter(bundle["size"] for bundle in bundles), "rejected": rejected}, ensure_ascii=False, default=dict))


if __name__ == "__main__":
    main()
