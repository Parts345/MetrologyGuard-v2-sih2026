import re
import time
from pathlib import Path
import cv2
import numpy as np
import onnxruntime as ort
from rapidocr_onnxruntime import RapidOCR

BUNDLE_DIR = Path(__file__).resolve().parent
WEIGHTS_DIR = BUNDLE_DIR / "weights"

class LegalMetrologyModel:
    def __init__(self, use_gpu: bool = None):
        providers = ort.get_available_providers()
        cuda_present = "CUDAExecutionProvider" in providers
        
        if use_gpu is None:
            self.use_cuda = cuda_present
        else:
            self.use_cuda = use_gpu and cuda_present

        # Discover weights
        det_models = list(WEIGHTS_DIR.glob("*det*.onnx"))
        cls_models = list(WEIGHTS_DIR.glob("*cls*.onnx"))
        rec_models = list(WEIGHTS_DIR.glob("*rec*.onnx"))

        kwargs = {
            "det_use_cuda": self.use_cuda,
            "cls_use_cuda": self.use_cuda,
            "rec_use_cuda": self.use_cuda
        }
        if det_models: kwargs["det_model_path"] = str(det_models[0])
        if cls_models: kwargs["cls_model_path"] = str(cls_models[0])
        if rec_models: kwargs["rec_model_path"] = str(rec_models[0])

        self.engine = RapidOCR(**kwargs)
        self.device = "CUDA (NVIDIA GPU)" if self.use_cuda else "CPU (Standard ONNX)"
        
        # Pre-warm
        dummy = np.zeros((256, 256, 3), dtype=np.uint8)
        self.engine(dummy)

    def _get_box_meta(self, b):
        poly = np.array(b["polygon"], dtype=float)
        x_min, y_min = poly[:, 0].min(), poly[:, 1].min()
        x_max, y_max = poly[:, 0].max(), poly[:, 1].max()
        return {
            "text": b["text"].strip(),
            "conf": b["confidence"],
            "x_min": x_min, "y_min": y_min,
            "x_max": x_max, "y_max": y_max,
            "w": x_max - x_min, "h": y_max - y_min,
            "cx": (x_min + x_max) / 2.0, "cy": (y_min + y_max) / 2.0
        }

    def _parse_declarations(self, raw_boxes):
        boxes = [self._get_box_meta(b) for b in raw_boxes if b["text"].strip()]
        full_text = "\n".join([b["text"] for b in sorted(boxes, key=lambda x: (x["y_min"], x["x_min"]))])

        re_slash_price = re.compile(r'([0-9]{1,4}(?:\.[0-9]{1,2})?)\s*/[-–]')
        re_inline_mrp = re.compile(r'(?:m[rf]p|m\.r\.p|rs\.?|₹)\s*[:\.]?\s*([0-9]{1,4}(?:\.[0-9]{1,2})?)', re.IGNORECASE)
        re_mrp_key = re.compile(r'\b(m[rf]p|m\.r\.p|max(?:imum)?\s*retail\s*price|price)\b', re.IGNORECASE)

        re_net_qty_key = re.compile(r'\b(net\s*(?:wt\.?|weight|qty\.?|quantity)|quantity)\b', re.IGNORECASE)
        re_unit_qty = re.compile(r'\b([0-9]+(?:\.[0-9]+)?)\s*(kg|g|gm|gms|ml|l|ltr|litres?|units?|pcs?|pieces?|n)\b', re.IGNORECASE)

        re_mfd_key = re.compile(r'\b(m[fgd8o0][dg]|pkd|pcd|packed|mfg|mfd)\b', re.IGNORECASE)
        re_exp_key = re.compile(r'\b(exp|use\s*by|best\s*before|expiry)\b', re.IGNORECASE)

        months = r'(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*'
        re_full_date = re.compile(rf'\b([0-3]?[0-9][\s\/\.\-](?:{months}|[0-1]?[0-9])[\s\/\.\-](?:20)?[1-3][0-9])\b', re.IGNORECASE)
        re_short_date = re.compile(rf'\b((?:{months}|[0-1]?[0-9])[\s\/\.\-](?:20)?[1-3][0-9])\b', re.IGNORECASE)

        re_fssai = re.compile(r'\b(1[0-9]{13}|2[0-9]{13})\b')
        re_email = re.compile(r'([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)')
        re_email_no_dot = re.compile(r'([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]{3,}(?:com|in|org|net))\b', re.IGNORECASE)
        re_phone = re.compile(r'\b(?:1800[-\s]?[0-9]{3}[-\s]?[0-9]{3,4}|[0-9]{3,4}[-\s]?[0-9]{7,8}|[6-9][0-9]{9})\b')
        countries = ["India", "Indonesia", "China", "Thailand", "Malaysia", "USA", "United States", "Vietnam"]

        extracted = {
            "MRP": None, "Net_Quantity": None, "Packing_Date": None,
            "Consumer_Care": None, "FSSAI_Lic_No": None, "Country_of_Origin": None,
            "Use_By": None, "Full_Extracted_Text": full_text
        }

        # 1. MRP
        for b in boxes:
            m = re_slash_price.search(b["text"])
            if m:
                v = float(m.group(1))
                if 5.0 <= v <= 2500.0:
                    extracted["MRP"] = f"₹{v:.2f}"
                    break

        if not extracted["MRP"]:
            for b in boxes:
                if any(k in b["text"].lower() for k in ["serve", "sugar", "carb", "protein"]): continue
                m = re_inline_mrp.search(b["text"].replace(" ", ""))
                if m:
                    v = float(m.group(1))
                    if 5.0 <= v <= 2500.0 and v not in [2024.0, 2025.0, 2026.0, 2027.0]:
                        extracted["MRP"] = f"₹{v:.2f}"
                        break

        if not extracted["MRP"]:
            for b in boxes:
                if re_mrp_key.search(b["text"]) and not any(k in b["text"].lower() for k in ["serve", "sugar"]):
                    cands = [o for o in boxes if o != b and ((0 <= o["x_min"] - b["x_max"] <= b["w"] * 2.5 and abs(o["cy"] - b["cy"]) <= b["h"] * 0.9) or (0 <= o["y_min"] - b["y_max"] <= b["h"] * 1.8))]
                    for c in cands:
                        vm = re.search(r'([0-9]{1,4}(?:\.[0-9]{1,2})?)', c["text"])
                        if vm:
                            v = float(vm.group(1))
                            if 5.0 <= v <= 2500.0 and v not in [2024.0, 2025.0, 2026.0, 2027.0]:
                                extracted["MRP"] = f"₹{v:.2f}"
                                break
                if extracted["MRP"]: break

        # 2. Net Quantity
        for b in boxes:
            if re_net_qty_key.search(b["text"]):
                um = re_unit_qty.search(b["text"])
                if um:
                    u = um.group(2).lower()
                    if u in ["gm", "gms"]: u = "g"
                    if u in ["ltr", "litres"]: u = "l"
                    extracted["Net_Quantity"] = f"{um.group(1)} {u}"
                    break

        if not extracted["Net_Quantity"]:
            for b in boxes:
                if any(k in b["text"].lower() for k in ["serve", "sugar", "energy", "100g", "per"]): continue
                um = re_unit_qty.search(b["text"])
                if um:
                    u = um.group(2).lower()
                    if u in ["gm", "gms"]: u = "g"
                    if u in ["ltr", "litres"]: u = "l"
                    extracted["Net_Quantity"] = f"{um.group(1)} {u}"
                    break

        # 3. Dates
        for b in boxes:
            is_mfd = bool(re_mfd_key.search(b["text"]))
            is_exp = bool(re_exp_key.search(b["text"]))
            if is_mfd or is_exp:
                dm = re_full_date.search(b["text"]) or re_short_date.search(b["text"])
                if dm:
                    val = dm.group(1).strip()
                    if is_mfd and not extracted["Packing_Date"]: extracted["Packing_Date"] = val
                    if is_exp and not extracted["Use_By"]: extracted["Use_By"] = val

        if not extracted["Packing_Date"]:
            found_dates = [re_full_date.search(b["text"]).group(1).strip() for b in boxes if not any(k in b["text"].lower() for k in ["lic", "fssai", "phone"]) and re_full_date.search(b["text"])]
            if found_dates:
                extracted["Packing_Date"] = found_dates[0]

        # 4. FSSAI, Consumer Care, Origin
        fssai_matches = re_fssai.findall(full_text.replace(" ", ""))
        if fssai_matches: extracted["FSSAI_Lic_No"] = fssai_matches[0]

        emails = re_email.findall(full_text) or re_email_no_dot.findall(full_text)
        phones = re_phone.findall(full_text)
        contacts = []
        if phones: contacts.append(phones[0].strip())
        if emails: contacts.append(emails[0].strip())
        if contacts: extracted["Consumer_Care"] = "; ".join(contacts)

        for c in countries:
            if re.search(r'\b' + re.escape(c) + r'\b', full_text, re.IGNORECASE):
                extracted["Country_of_Origin"] = c
                break

        return extracted

    def predict(self, image_input):
        if isinstance(image_input, (str, Path)):
            img = cv2.imread(str(image_input))
        elif isinstance(image_input, np.ndarray):
            img = image_input
        else:
            raise ValueError("image_input must be file path or numpy ndarray")

        t0 = time.perf_counter()
        results, elapse = self.engine(img)
        elapsed_ms = (time.perf_counter() - t0) * 1000

        if not results:
            return {"status": "NON_COMPLIANT", "score": "0/6", "compliance_pct": 0.0, "latency_ms": elapsed_ms, "declarations": {}}

        raw_boxes = [{"polygon": b[0], "text": b[1], "confidence": float(b[2])} for b in results]
        preds = self._parse_declarations(raw_boxes)

        rules = {
            "Rule 6(1) MRP": {"passed": bool(preds["MRP"]), "value": preds["MRP"]},
            "Rule 6(2) Net Quantity": {"passed": bool(preds["Net_Quantity"]), "value": preds["Net_Quantity"]},
            "Rule 6(3) Packing Date": {"passed": bool(preds["Packing_Date"]), "value": preds["Packing_Date"]},
            "Rule 6(4) Consumer Care": {"passed": bool(preds["Consumer_Care"]), "value": preds["Consumer_Care"]},
            "Rule 6(5) Country of Origin": {"passed": bool(preds["Country_of_Origin"]), "value": preds["Country_of_Origin"]},
            "FSSAI Food Safety Lic": {"passed": bool(preds["FSSAI_Lic_No"]), "value": preds["FSSAI_Lic_No"]}
        }

        passed_count = sum(1 for r in rules.values() if r["passed"])
        status = "COMPLIANT" if passed_count == 6 else ("PARTIAL" if passed_count >= 3 else "NON_COMPLIANT")

        return {
            "status": status,
            "score": f"{passed_count}/6",
            "compliance_pct": round((passed_count / 6) * 100, 1),
            "device": self.device,
            "latency_ms": round(elapsed_ms, 2),
            "boxes_count": len(raw_boxes),
            "declarations": rules,
            "raw_boxes": raw_boxes
        }
