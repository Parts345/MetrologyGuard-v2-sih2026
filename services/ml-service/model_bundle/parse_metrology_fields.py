import json
import re
from pathlib import Path
import pandas as pd
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
CACHE_PATH = DATA_DIR / "ocr_extracted_cache.json"
OUTPUT_PATH = DATA_DIR / "extracted_metrology_predictions.csv"

def get_box_meta(b):
    poly = np.array(b["polygon"], dtype=float)
    x_min, y_min = poly[:, 0].min(), poly[:, 1].min()
    x_max, y_max = poly[:, 0].max(), poly[:, 1].max()
    return {
        "text": b["text"].strip(),
        "conf": b["confidence"],
        "x_min": x_min, "y_min": y_min,
        "x_max": x_max, "y_max": y_max,
        "w": x_max - x_min,
        "h": y_max - y_min,
        "cx": (x_min + x_max) / 2.0,
        "cy": (y_min + y_max) / 2.0
    }

RE_SLASH_PRICE = re.compile(r'([0-9]{1,4}(?:\.[0-9]{1,2})?)\s*/[-–]')
RE_INLINE_MRP = re.compile(r'(?:m[rf]p|m\.r\.p|rs\.?|₹)\s*[:\.]?\s*([0-9]{1,4}(?:\.[0-9]{1,2})?)', re.IGNORECASE)
RE_MRP_KEY = re.compile(r'\b(m[rf]p|m\.r\.p|max(?:imum)?\s*retail\s*price|price)\b', re.IGNORECASE)

RE_NET_QTY_KEY = re.compile(r'\b(net\s*(?:wt\.?|weight|qty\.?|quantity)|quantity)\b', re.IGNORECASE)
RE_UNIT_QTY = re.compile(r'\b([0-9]+(?:\.[0-9]+)?)\s*(kg|g|gm|gms|ml|l|ltr|litres?|units?|pcs?|pieces?|n)\b', re.IGNORECASE)

RE_MFD_KEY = re.compile(r'\b(m[fgd8o0][dg]|pkd|pcd|packed|mfg|mfd)\b', re.IGNORECASE)
RE_EXP_KEY = re.compile(r'\b(exp|use\s*by|best\s*before|expiry)\b', re.IGNORECASE)

MONTHS = r'(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*'
RE_FULL_DATE = re.compile(rf'\b([0-3]?[0-9][\s\/\.\-](?:{MONTHS}|[0-1]?[0-9])[\s\/\.\-](?:20)?[1-3][0-9])\b', re.IGNORECASE)
RE_SHORT_DATE = re.compile(rf'\b((?:{MONTHS}|[0-1]?[0-9])[\s\/\.\-](?:20)?[1-3][0-9])\b', re.IGNORECASE)

RE_FSSAI = re.compile(r'\b(1[0-9]{13}|2[0-9]{13})\b')
RE_EMAIL = re.compile(r'([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)')
RE_EMAIL_NO_DOT = re.compile(r'([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]{3,}(?:com|in|org|net))\b', re.IGNORECASE)
RE_PHONE = re.compile(r'\b(?:1800[-\s]?[0-9]{3}[-\s]?[0-9]{3,4}|[0-9]{3,4}[-\s]?[0-9]{7,8}|[6-9][0-9]{9})\b')
COUNTRIES = ["India", "Indonesia", "China", "Thailand", "Malaysia", "USA", "United States", "Vietnam"]

def extract_product_fields(raw_boxes):
    boxes = [get_box_meta(b) for b in raw_boxes if b["text"].strip()]
    full_text = "\n".join([b["text"] for b in sorted(boxes, key=lambda x: (x["y_min"], x["x_min"]))])
    
    extracted = {
        "MRP": None,
        "Net_Quantity": None,
        "Packing_Date": None,
        "Consumer_Care": None,
        "FSSAI_Lic_No": None,
        "Country_of_Origin": None,
        "Use_By": None,
        "Full_Extracted_Text": full_text
    }

    # 1. MRP Extraction
    for b in boxes:
        m = RE_SLASH_PRICE.search(b["text"])
        if m:
            val = float(m.group(1))
            if 5.0 <= val <= 2500.0:
                extracted["MRP"] = f"₹{val:.2f}"
                break

    if not extracted["MRP"]:
        for b in boxes:
            txt_clean = b["text"].replace(" ", "")
            if any(k in b["text"].lower() for k in ["serve", "sugar", "carb", "protein", "energy"]):
                continue
            m = RE_INLINE_MRP.search(txt_clean)
            if m:
                val = float(m.group(1))
                if 5.0 <= val <= 2500.0 and val not in [2024.0, 2025.0, 2026.0, 2027.0]:
                    extracted["MRP"] = f"₹{val:.2f}"
                    break

    if not extracted["MRP"]:
        for b in boxes:
            if RE_MRP_KEY.search(b["text"]) and not any(k in b["text"].lower() for k in ["serve", "sugar"]):
                candidates = []
                for other in boxes:
                    if other == b: continue
                    dx = other["x_min"] - b["x_max"]
                    dy = abs(other["cy"] - b["cy"])
                    dy_down = other["y_min"] - b["y_max"]
                    dx_align = abs(other["cx"] - b["cx"])
                    
                    if 0 <= dx <= b["w"] * 2.5 and dy <= b["h"] * 0.9:
                        candidates.append(other)
                    elif 0 <= dy_down <= b["h"] * 1.8 and dx_align <= b["w"] * 1.5:
                        candidates.append(other)
                
                for cand in candidates:
                    val_match = re.search(r'([0-9]{1,4}(?:\.[0-9]{1,2})?)', cand["text"])
                    if val_match:
                        val = float(val_match.group(1))
                        if 5.0 <= val <= 2500.0 and val not in [2024.0, 2025.0, 2026.0, 2027.0]:
                            extracted["MRP"] = f"₹{val:.2f}"
                            break
            if extracted["MRP"]:
                break

    # 2. Net Quantity
    for b in boxes:
        if RE_NET_QTY_KEY.search(b["text"]):
            unit_m = RE_UNIT_QTY.search(b["text"])
            if unit_m:
                u = unit_m.group(2).lower()
                if u in ["gm", "gms"]: u = "g"
                if u in ["ltr", "litres"]: u = "l"
                extracted["Net_Quantity"] = f"{unit_m.group(1)} {u}"
                break
            for other in boxes:
                dx = other["x_min"] - b["x_max"]
                dy = abs(other["cy"] - b["cy"])
                if 0 <= dx <= b["w"] * 2.0 and dy <= b["h"] * 0.9:
                    unit_m = RE_UNIT_QTY.search(other["text"])
                    if unit_m:
                        u = unit_m.group(2).lower()
                        if u in ["gm", "gms"]: u = "g"
                        if u in ["ltr", "litres"]: u = "l"
                        extracted["Net_Quantity"] = f"{unit_m.group(1)} {u}"
                        break
        if extracted["Net_Quantity"]:
            break

    if not extracted["Net_Quantity"]:
        for b in boxes:
            txt_lower = b["text"].lower()
            if any(k in txt_lower for k in ["serve", "sugar", "energy", "protein", "fat", "100g", "per", "sodium"]):
                continue
            unit_m = RE_UNIT_QTY.search(b["text"])
            if unit_m:
                u = unit_m.group(2).lower()
                if u in ["gm", "gms"]: u = "g"
                if u in ["ltr", "litres"]: u = "l"
                extracted["Net_Quantity"] = f"{unit_m.group(1)} {u}"
                break

    # 3. Dates
    for b in boxes:
        is_mfd = bool(RE_MFD_KEY.search(b["text"]))
        is_exp = bool(RE_EXP_KEY.search(b["text"]))
        if is_mfd or is_exp:
            d_m = RE_FULL_DATE.search(b["text"]) or RE_SHORT_DATE.search(b["text"])
            if d_m:
                val = d_m.group(1).strip()
                if is_mfd and not extracted["Packing_Date"]: extracted["Packing_Date"] = val
                if is_exp and not extracted["Use_By"]: extracted["Use_By"] = val
            else:
                for other in boxes:
                    dx = other["x_min"] - b["x_max"]
                    dy = abs(other["cy"] - b["cy"])
                    dy_down = other["y_min"] - b["y_max"]
                    if (0 <= dx <= b["w"] * 3.0 and dy <= b["h"] * 0.9) or (0 <= dy_down <= b["h"] * 2.0 and abs(other["cx"] - b["cx"]) <= b["w"] * 1.5):
                        cand_d = RE_FULL_DATE.search(other["text"]) or RE_SHORT_DATE.search(other["text"])
                        if cand_d:
                            val = cand_d.group(1).strip()
                            if is_mfd and not extracted["Packing_Date"]: extracted["Packing_Date"] = val
                            if is_exp and not extracted["Use_By"]: extracted["Use_By"] = val
                            break

    if not extracted["Packing_Date"]:
        found_dates = []
        for b in boxes:
            if any(k in b["text"].lower() for k in ["lic", "fssai", "phone", "email", "consumer"]):
                continue
            m = RE_FULL_DATE.search(b["text"])
            if m:
                found_dates.append(m.group(1).strip())
        if found_dates:
            extracted["Packing_Date"] = found_dates[0]
            if len(found_dates) > 1 and not extracted["Use_By"]:
                extracted["Use_By"] = found_dates[1]

    # 4. FSSAI
    fssai_matches = RE_FSSAI.findall(full_text.replace(" ", ""))
    if fssai_matches:
        extracted["FSSAI_Lic_No"] = fssai_matches[0]

    # 5. Consumer Care
    emails = RE_EMAIL.findall(full_text)
    if not emails:
        emails = RE_EMAIL_NO_DOT.findall(full_text)
    phones = RE_PHONE.findall(full_text)
    contacts = []
    if phones: contacts.append(phones[0].strip())
    if emails: contacts.append(emails[0].strip())
    if contacts: extracted["Consumer_Care"] = "; ".join(contacts)

    # 6. Country of Origin
    for c in COUNTRIES:
        if re.search(r'\b' + re.escape(c) + r'\b', full_text, re.IGNORECASE):
            extracted["Country_of_Origin"] = c
            break

    return extracted


if __name__ == "__main__":
    assert CACHE_PATH.exists(), f"Missing OCR cache at {CACHE_PATH}"
    with open(CACHE_PATH, "r", encoding="utf-8") as f:
        ocr_data = json.load(f)

    rows = []
    for pid, data in ocr_data.items():
        preds = extract_product_fields(data["detections"])
        preds["Product_ID"] = pid
        preds["Split"] = data["split"]
        rows.append(preds)

    df_preds = pd.DataFrame(rows)
    df_preds.to_csv(OUTPUT_PATH, index=False)
    print(f"Extracted updated predictions -> {OUTPUT_PATH}")
