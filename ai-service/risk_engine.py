"""Counterfeit medicine risk engine for field and lab workflows.

This module is designed for real deployments where connectivity may be limited.
It combines:
- optional ONNX image model inference,
- OCR consistency checks,
- QR payload consistency checks,
- and rule-based signals for packaging anomalies.

Only cryptographic hashes and model outputs should go on-chain. Raw media stays off-chain.
"""

from __future__ import annotations

import argparse
import json
import math
import os
from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional, Tuple

# Optional dependencies. Engine still works in reduced mode if they are unavailable.
try:
    import cv2  # type: ignore
except Exception:  # pragma: no cover
    cv2 = None

try:
    import numpy as np  # type: ignore
except Exception:  # pragma: no cover
    np = None

try:
    import onnxruntime as ort  # type: ignore
except Exception:  # pragma: no cover
    ort = None

try:
    import pytesseract  # type: ignore
except Exception:  # pragma: no cover
    pytesseract = None

try:
    from pyzbar.pyzbar import decode as decode_qr  # type: ignore
except Exception:  # pragma: no cover
    decode_qr = None


@dataclass
class ExpectedBatchProfile:
    product_name: str
    batch_number: str
    manufacturer_name: str
    expected_tokens: List[str]
    expected_qr_fields: Dict[str, str]


@dataclass
class RiskAssessment:
    risk_score_0_to_100: float
    decision: str
    confidence: float
    signals: Dict[str, float]
    notes: List[str]


@dataclass
class RiskEngineConfig:
    model_weight: float = 0.45
    ocr_weight: float = 0.25
    qr_weight: float = 0.2
    visual_weight: float = 0.1
    high_risk_threshold: float = 70.0
    review_threshold: float = 45.0


class CounterfeitRiskEngine:
    def __init__(self, model_path: Optional[str] = None, config: Optional[RiskEngineConfig] = None):
        self.config = config or RiskEngineConfig()
        self.session = None

        if model_path and ort is not None and os.path.exists(model_path):
            self.session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])

    def assess(
        self,
        image_path: Optional[str],
        expected: ExpectedBatchProfile,
        packaging_notes: str = "",
    ) -> RiskAssessment:
        signals: Dict[str, float] = {}
        notes: List[str] = []

        # 1) Model signal (0 clean, 1 counterfeit probability)
        model_signal = self._model_signal(image_path)
        signals["model_counterfeit_probability"] = model_signal

        # 2) OCR mismatch signal (0 good, 1 bad)
        ocr_signal, ocr_notes = self._ocr_mismatch_signal(image_path, expected)
        signals["ocr_mismatch"] = ocr_signal
        notes.extend(ocr_notes)

        # 3) QR mismatch signal (0 good, 1 bad)
        qr_signal, qr_notes = self._qr_mismatch_signal(image_path, expected)
        signals["qr_mismatch"] = qr_signal
        notes.extend(qr_notes)

        # 4) Visual quality anomaly signal (0 good, 1 suspicious)
        visual_signal, visual_notes = self._visual_quality_signal(image_path, packaging_notes)
        signals["visual_anomaly"] = visual_signal
        notes.extend(visual_notes)

        weighted = (
            model_signal * self.config.model_weight
            + ocr_signal * self.config.ocr_weight
            + qr_signal * self.config.qr_weight
            + visual_signal * self.config.visual_weight
        )

        risk_score = round(weighted * 100.0, 2)

        if risk_score >= self.config.high_risk_threshold:
            decision = "HIGH_RISK_COUNTERFEIT"
        elif risk_score >= self.config.review_threshold:
            decision = "REVIEW_REQUIRED"
        else:
            decision = "LIKELY_AUTHENTIC"

        # Confidence: lower confidence when many signals unavailable.
        available_signals = sum(1 for _, v in signals.items() if v >= 0)
        confidence = round(0.4 + min(0.6, available_signals * 0.15), 3)

        return RiskAssessment(
            risk_score_0_to_100=risk_score,
            decision=decision,
            confidence=confidence,
            signals=signals,
            notes=notes,
        )

    def _model_signal(self, image_path: Optional[str]) -> float:
        if not image_path or not self.session or np is None or cv2 is None:
            return 0.35

        image = cv2.imread(image_path)
        if image is None:
            return 0.35

        resized = cv2.resize(image, (224, 224))
        inp = resized.astype("float32") / 255.0
        inp = np.transpose(inp, (2, 0, 1))[None, :, :, :]

        input_name = self.session.get_inputs()[0].name
        output_name = self.session.get_outputs()[0].name

        output = self.session.run([output_name], {input_name: inp})[0]
        # Assume model outputs counterfeit probability in [0,1].
        value = float(output.ravel()[0])
        return min(1.0, max(0.0, value))

    def _ocr_mismatch_signal(
        self,
        image_path: Optional[str],
        expected: ExpectedBatchProfile,
    ) -> Tuple[float, List[str]]:
        if not image_path or pytesseract is None or cv2 is None:
            return 0.4, ["OCR unavailable; using conservative fallback"]

        image = cv2.imread(image_path)
        if image is None:
            return 0.5, ["Image unreadable for OCR"]

        text = pytesseract.image_to_string(image)
        normalized = (text or "").lower()

        required_tokens = [token.lower() for token in expected.expected_tokens if token.strip()]
        if not required_tokens:
            return 0.2, []

        missing = [token for token in required_tokens if token not in normalized]
        mismatch_ratio = len(missing) / len(required_tokens)

        notes = []
        if missing:
            notes.append(f"OCR missing expected terms: {', '.join(missing[:6])}")

        return min(1.0, mismatch_ratio), notes

    def _qr_mismatch_signal(
        self,
        image_path: Optional[str],
        expected: ExpectedBatchProfile,
    ) -> Tuple[float, List[str]]:
        if not image_path or decode_qr is None or cv2 is None:
            return 0.35, ["QR decoder unavailable; using conservative fallback"]

        image = cv2.imread(image_path)
        if image is None:
            return 0.5, ["Image unreadable for QR"]

        qr_payloads = decode_qr(image)
        if not qr_payloads:
            return 0.8, ["No QR payload detected"]

        payload_text = qr_payloads[0].data.decode("utf-8", errors="ignore")
        payload_lower = payload_text.lower()

        expected_fields = expected.expected_qr_fields or {}
        if not expected_fields:
            return 0.15, []

        mismatches = 0
        notes = []
        for key, value in expected_fields.items():
            if str(value).lower() not in payload_lower:
                mismatches += 1
                notes.append(f"QR mismatch for field '{key}'")

        mismatch_ratio = mismatches / max(1, len(expected_fields))
        return min(1.0, mismatch_ratio), notes

    def _visual_quality_signal(self, image_path: Optional[str], packaging_notes: str) -> Tuple[float, List[str]]:
        note_terms = ["tamper", "blur", "seal", "smudge", "broken", "mismatch", "spelling"]
        notes_hits = sum(1 for t in note_terms if t in packaging_notes.lower())
        note_score = min(1.0, notes_hits / 4.0)

        if not image_path or cv2 is None:
            return max(0.25, note_score), []

        image = cv2.imread(image_path)
        if image is None:
            return max(0.4, note_score), ["Image unreadable for visual quality"]

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        blur_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())

        # Low variance can indicate blurred/low-quality prints or recaptured labels.
        blur_risk = 0.7 if blur_var < 55 else 0.2
        visual_signal = max(blur_risk, note_score)

        notes: List[str] = []
        if blur_var < 55:
            notes.append("Packaging image appears unusually blurred")

        return min(1.0, visual_signal), notes


def parse_expected_profile(path: str) -> ExpectedBatchProfile:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    return ExpectedBatchProfile(
        product_name=data.get("product_name", ""),
        batch_number=data.get("batch_number", ""),
        manufacturer_name=data.get("manufacturer_name", ""),
        expected_tokens=data.get("expected_tokens", []),
        expected_qr_fields=data.get("expected_qr_fields", {}),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Counterfeit medicine risk engine")
    parser.add_argument("--image", dest="image_path", default=None, help="Path to packaging image")
    parser.add_argument("--expected-json", required=True, help="Path to expected batch profile JSON")
    parser.add_argument("--model", default=None, help="Optional ONNX model path")
    parser.add_argument("--notes", default="", help="Inspector packaging notes")
    parser.add_argument("--output", default="", help="Optional output JSON path")

    args = parser.parse_args()

    expected = parse_expected_profile(args.expected_json)
    engine = CounterfeitRiskEngine(model_path=args.model)
    result = engine.assess(args.image_path, expected, args.notes)

    payload = asdict(result)
    as_json = json.dumps(payload, indent=2)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(as_json)
    else:
        print(as_json)


if __name__ == "__main__":
    main()
