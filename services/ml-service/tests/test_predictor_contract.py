import unittest
import sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from model_bundle.predictor import LegalMetrologyModel


def polygon(y: int):
    return [[0, y], [300, y], [300, y + 20], [0, y + 20]]


class StubEngine:
    def __init__(self, rows):
        self.rows = rows

    def __call__(self, _image):
        return self.rows, 0.0


def predictor_with(rows):
    # Bypass heavyweight OCR initialisation while retaining the supplied parse
    # and rule-evaluation methods for deterministic contract tests.
    model = LegalMetrologyModel.__new__(LegalMetrologyModel)
    model.engine = StubEngine(rows)
    model.device = "CPU (Standard ONNX)"
    return model


class PredictorContractTests(unittest.TestCase):
    def test_full_declaration_set_is_compliant(self):
        rows = [
            (polygon(0), "MRP Rs 120", 0.99),
            (polygon(25), "Net Qty 500 g", 0.99),
            (polygon(50), "MFD 01/01/2026", 0.99),
            (polygon(75), "1800-123-1234", 0.99),
            (polygon(100), "Made in India", 0.99),
            # Keep the label and number in separate OCR boxes, matching the
            # token boundary expected by the supplied parser.
            (polygon(125), "FSSAI", 0.99),
            (polygon(150), "12345678901234", 0.99),
        ]
        result = predictor_with(rows).predict(np.zeros((20, 20, 3), dtype=np.uint8))
        self.assertEqual(result["status"], "COMPLIANT")
        self.assertEqual(result["score"], "6/6")
        self.assertEqual(result["boxes_count"], 7)

    def test_missing_declarations_are_partial_or_non_compliant(self):
        rows = [(polygon(0), "MRP Rs 120", 0.99), (polygon(25), "Net Qty 500 g", 0.99)]
        result = predictor_with(rows).predict(np.zeros((20, 20, 3), dtype=np.uint8))
        self.assertEqual(result["status"], "NON_COMPLIANT")
        self.assertEqual(result["score"], "2/6")

    def test_empty_ocr_is_non_compliant(self):
        result = predictor_with([]).predict(np.zeros((20, 20, 3), dtype=np.uint8))
        self.assertEqual(result["status"], "NON_COMPLIANT")
        self.assertEqual(result["score"], "0/6")


if __name__ == "__main__":
    unittest.main()
