from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET

import openpyxl
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SEED_PATH = ROOT / "assets" / "seed-data.js"
SOURCE_XLSX = Path(r"C:\Users\31837\Desktop\fabric-import-template-2_2.0.xlsx")
IMAGE_DIR = ROOT / "assets" / "fabric-images"


def text(value) -> str:
    if value is None:
        return ""
    return str(value).strip()


def number(value) -> float:
    match = re.search(r"\d+(?:\.\d+)?", text(value))
    return float(match.group(0)) if match else 0.0


def parse_gsm(value) -> float:
    return number(value)


def parse_width_cm(value) -> float | str:
    width = number(value)
    return round(width, 1) if width else ""


def meters_per_kg(width_cm, weight_text) -> float:
    width = float(width_cm or 0) / 100
    gsm = parse_gsm(weight_text)
    if not width or not gsm:
        return 0.0
    return 1000 / width / gsm


def rounded(value: float | None, digits: int = 2) -> float | str:
    if value is None:
        return ""
    return round(float(value), digits)


def safe_filename(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "-", text(value)).strip("-") or "fabric"


def image_id_from_formula(value) -> str:
    match = re.search(r"ID_[A-Z0-9]+", text(value))
    return match.group(0) if match else ""


def load_cell_image_map() -> dict[str, str]:
    rel_ns = {"rel": "http://schemas.openxmlformats.org/package/2006/relationships"}
    img_ns = {
        "etc": "http://www.wps.cn/officeDocument/2017/etCustomData",
        "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
        "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
        "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    }

    with ZipFile(SOURCE_XLSX) as archive:
        rel_root = ET.fromstring(archive.read("xl/_rels/cellimages.xml.rels"))
        rels = {
            rel.attrib["Id"]: "xl/" + rel.attrib["Target"]
            for rel in rel_root.findall("rel:Relationship", rel_ns)
            if rel.attrib.get("Target", "").startswith("media/")
        }

        image_root = ET.fromstring(archive.read("xl/cellimages.xml"))
        image_map: dict[str, str] = {}
        for cell_image in image_root.findall("etc:cellImage", img_ns):
            name_node = cell_image.find(".//xdr:cNvPr", img_ns)
            blip_node = cell_image.find(".//a:blip", img_ns)
            if name_node is None or blip_node is None:
                continue
            image_id = name_node.attrib.get("name", "")
            rel_id = blip_node.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed", "")
            if image_id and rel_id in rels:
                image_map[image_id] = rels[rel_id]
        return image_map


def extract_fabric_images(row, fabric_id: str, row_index: int, image_map: dict[str, str]) -> list[str]:
    image_ids = []
    for cell_value in row[12:15]:
        image_id = image_id_from_formula(cell_value)
        if image_id and image_id in image_map and image_id not in image_ids:
            image_ids.append(image_id)

    if not image_ids:
        return []

    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    urls: list[str] = []
    with ZipFile(SOURCE_XLSX) as archive:
        for index, image_id in enumerate(image_ids, start=1):
            source_path = image_map[image_id]
            output_name = f"{safe_filename(fabric_id)}-{row_index}-{index}.jpg"
            output_path = IMAGE_DIR / output_name
            with archive.open(source_path) as image_file:
                with Image.open(image_file) as image:
                    image = image.convert("RGB")
                    image.thumbnail((1600, 1600))
                    image.save(output_path, "JPEG", quality=82, optimize=True)
            urls.append(f"assets/fabric-images/{output_name}")
    return urls


def split_price_segments(raw: str) -> list[str]:
    raw = text(raw).replace("\r", "\n")
    parts: list[str] = []
    for line in raw.split("\n"):
        line = line.strip()
        if not line:
            continue
        pieces = re.split(r"[，,；;]+", line)
        parts.extend(piece.strip() for piece in pieces if piece.strip())
    return parts


def extract_contextual_price(segment: str, unit: str) -> float | None:
    source = text(segment)
    if not source:
        return None

    if unit == "kg":
        patterns = [
            r"(\d+(?:\.\d+)?)\s*元\s*(?:/|每|一|\d*)?\s*(?:kg|KG|公斤)",
            r"(\d+(?:\.\d+)?)\s*(?:/|每|一)\s*(?:kg|KG|公斤)",
        ]
    else:
        patterns = [
            r"(\d+(?:\.\d+)?)\s*(?:元)?\s*(?:/|每|一)?\s*(?:米|m|M)",
            r"(?:米|m|M)\D{0,6}(\d+(?:\.\d+)?)",
        ]

    for pattern in patterns:
        match = re.search(pattern, source)
        if match:
            return float(match.group(1))

    # In the factory meter-price column, some cells omit the unit after the
    # supplier name. Use the first value there as the meter price.
    if unit == "m":
        match = re.search(r"\d+(?:\.\d+)?", source)
        if match:
            return float(match.group(0))

    return None


def parse_supplier_quotes(raw: str, unit: str, source_label: str, fallback_supplier: str) -> list[dict]:
    quotes: list[dict] = []
    current_supplier = fallback_supplier
    ignore_labels = ("纸管", "空差", "加工费", "坯布")
    generic_labels = {"总价", "成品价格", "普通", "高牢度"}
    option_labels = {"素色", "印花", "浅色", "中色", "深色"}
    material_labels = {"再生涤纶"}

    for segment in split_price_segments(raw):
        label = current_supplier
        variant = ""
        body = segment
        if "：" in segment or ":" in segment:
            before, after = re.split(r"[:：]", segment, maxsplit=1)
            before = before.strip()
            after = after.strip()
            if before and not re.search(r"\d", before):
                if not after:
                    current_supplier = before
                    continue
                if before in option_labels or before in material_labels:
                    label = current_supplier
                    variant = before
                else:
                    label = before
                    current_supplier = before
                body = after
                if any(word in label for word in ignore_labels):
                    continue
                if label in generic_labels:
                    label = fallback_supplier

        for material_label in material_labels:
            if body.startswith(material_label):
                label = current_supplier
                variant = material_label
                body = body[len(material_label):].strip()
                break

        if any(word in body for word in ignore_labels):
            continue

        price = extract_contextual_price(body, unit)
        if price is None:
            continue

        quotes.append({
            "supplier": label or fallback_supplier,
            "variant": variant,
            "rmbPerKg": price if unit == "kg" else "",
            "rmbPerM": price if unit == "m" else "",
            "source": source_label,
            "note": segment,
        })

    return quotes


def merge_quotes(quotes: list[dict], width_cm, weight_text) -> list[dict]:
    merged: dict[str, dict] = {}

    for quote in quotes:
        supplier = text(quote.get("supplier")) or "报价"
        variant = text(quote.get("variant"))
        key = f"{supplier}__{variant}"
        item = merged.setdefault(key, {
            "supplier": supplier,
            "variant": variant,
            "source": "",
            "rmbPerKg": "",
            "rmbPerM": "",
            "note": "",
        })

        incoming_m = quote.get("rmbPerM")
        incoming_kg = quote.get("rmbPerKg")
        if item["rmbPerM"] == "" or (incoming_m != "" and float(incoming_m) < float(item["rmbPerM"])):
            item["rmbPerM"] = incoming_m
            item["rmbPerKg"] = incoming_kg
        elif item["rmbPerKg"] == "" and incoming_kg != "":
            item["rmbPerKg"] = incoming_kg
        if quote.get("source"):
            sources = [part for part in item["source"].split(" / ") if part]
            if quote["source"] not in sources:
                sources.append(quote["source"])
            item["source"] = " / ".join(sources)
        if quote.get("note"):
            item["note"] = "; ".join(part for part in [item["note"], text(quote["note"])] if part)

    mpk = meters_per_kg(width_cm, weight_text)
    results: list[dict] = []
    for item in merged.values():
        kg = item["rmbPerKg"]
        meter = item["rmbPerM"]
        if meter == "" and kg != "" and mpk:
            meter = float(kg) / mpk
            item["source"] = f'{item["source"]} / 按门幅克重换算'
        if kg == "" and meter != "" and mpk:
            kg = float(meter) * mpk
        if meter == "":
            continue
        results.append({
            "supplier": item["supplier"],
            "variant": item["variant"],
            "rmbPerKg": rounded(kg, 2) if kg != "" else "",
            "rmbPerM": rounded(meter, 2),
            "source": item["source"],
            "note": item["note"],
        })

    results.sort(key=lambda item: float(item["rmbPerM"]))
    return results


def load_seed() -> dict:
    raw = SEED_PATH.read_text(encoding="utf-8").strip()
    raw = re.sub(r"^window\.COSTING_SEED\s*=\s*", "", raw)
    raw = raw[:-1] if raw.endswith(";") else raw
    return json.loads(raw)


def existing_fabric_map(seed: dict) -> dict[str, dict]:
    items = {}
    for fabric in seed.get("fabrics", []):
        key = text(fabric.get("rowKey")) or text(fabric.get("id"))
        if key:
            items[key] = fabric
        if text(fabric.get("id")):
            items.setdefault(text(fabric.get("id")), fabric)
    return items


def read_fabrics(existing: dict[str, dict] | None = None) -> list[dict]:
    existing = existing or {}
    import_date = datetime.now().date().isoformat()
    image_map = load_cell_image_map()
    if IMAGE_DIR.exists():
      for old_image in IMAGE_DIR.glob("*.jpg"):
          old_image.unlink()
    wb = openpyxl.load_workbook(SOURCE_XLSX, read_only=True, data_only=False)
    ws = wb["Fabrics"]
    rows = ws.iter_rows(min_row=2, values_only=True)
    fabrics: list[dict] = []

    for row_index, row in enumerate(rows, start=2):
        fabric_id = text(row[0])
        if not fabric_id:
            continue

        row_key = f"{fabric_id}__row{row_index}"
        previous = existing.get(row_key) or existing.get(fabric_id) or {}
        width_cm = parse_width_cm(row[6])
        weight = text(row[5])
        market_reference_quotes = []
        actual_meter_quotes = parse_supplier_quotes(text(row[18]), "m", "实际价格", "实际报价")
        market_reference_quotes += actual_meter_quotes or parse_supplier_quotes(text(row[17]), "kg", "价格", "实际报价")

        quotes = []
        factory_meter_quotes = parse_supplier_quotes(text(row[20]), "m", "工厂定做米价", "工厂报价")
        quotes += factory_meter_quotes or parse_supplier_quotes(text(row[19]), "kg", "工厂定做价格", "工厂报价")
        supplier_quotes = merge_quotes(quotes, width_cm, weight)
        market_reference_quotes = merge_quotes(market_reference_quotes, width_cm, weight)
        best = supplier_quotes[0] if supplier_quotes else {}

        sample_bits = []
        if text(row[15]):
            sample_bits.append(f"挑拨米样：{text(row[15])}")
        if text(row[16]):
            sample_bits.append(f"是否收到：{text(row[16])}")

        match = text(row[2])
        if not match and fabric_id.upper().startswith("GU-"):
            match = "GU 原始面料"

        fabrics.append({
            "rowKey": row_key,
            "excelOrder": row_index,
            "createdAt": previous.get("createdAt") or import_date,
            "id": fabric_id,
            "name": text(row[1]),
            "composition": text(row[3]),
            "construction": text(row[4]),
            "weight": weight,
            "widthCm": width_cm,
            "colorway": text(row[7]),
            "mill": best.get("supplier", ""),
            "rmbPerKg": best.get("rmbPerKg", ""),
            "rmbPerM": best.get("rmbPerM", ""),
            "bestSupplier": best.get("supplier", ""),
            "supplierQuotes": supplier_quotes,
            "marketReferenceQuotes": market_reference_quotes,
            "images": extract_fabric_images(row, fabric_id, row_index, image_map),
            "style": text(row[11]),
            "sampleStatus": "；".join(sample_bits),
            "rawPrice": text(row[17]),
            "actualPrice": text(row[18]),
            "factoryKgPrice": text(row[19]),
            "factoryMPrice": text(row[20]),
            "match": match,
        })
    return fabrics


def main() -> None:
    seed = load_seed()
    seed["source"] = "fabric-import-template-2_2.0"
    seed["warning"] = "面料库已按最新报价导入；同一面料优先使用最低 RMB/m，较高供应商报价作为备选显示。"
    seed["fabrics"] = read_fabrics(existing_fabric_map(seed))

    SEED_PATH.write_text(
        "window.COSTING_SEED = " + json.dumps(seed, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    priced = [item for item in seed["fabrics"] if item.get("rmbPerM") != ""]
    print(json.dumps({
        "fabrics": len(seed["fabrics"]),
        "priced": len(priced),
        "source": str(SOURCE_XLSX),
        "seed": str(SEED_PATH),
        "cheapest": priced[:5],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
