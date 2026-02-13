# AI Service (Production Module)

This module is designed for real-world counterfeit detection workflows:

- `risk_engine.py`: multimodal risk scoring from image/model/OCR/QR and inspector notes.
- `federated_aggregator.py`: secure federated model aggregation with clipping + optional DP noise.

## 1) Risk scoring

Input files:
- packaging image (optional but recommended)
- expected batch profile JSON
- optional ONNX model

Example:

```bash
python risk_engine.py \
  --image ./sample.jpg \
  --expected-json ./expected_batch.json \
  --notes "seal mismatch and blurry print" \
  --output ./risk_output.json
```

Expected profile format:

```json
{
  "product_name": "Amoxicillin 500mg",
  "batch_number": "PG-2026-001",
  "manufacturer_name": "Sun Pharma",
  "expected_tokens": ["amoxicillin", "pg-2026-001", "sun pharma"],
  "expected_qr_fields": {
    "batch": "PG-2026-001",
    "manufacturer": "Sun Pharma"
  }
}
```

## 2) Federated aggregation

Input format (`updates.json`):

```json
[
  {"client_id": "clinic-a", "num_examples": 200, "weights": [0.1, 0.4, 0.9]},
  {"client_id": "clinic-b", "num_examples": 150, "weights": [0.2, 0.5, 0.85]}
]
```

Run aggregation:

```bash
python federated_aggregator.py \
  --updates ./updates.json \
  --output ./aggregated_model.json \
  --clip 2.0 \
  --noise 0.01
```

The output includes `model_hash` that can be anchored on-chain via `updateFederatedModel`.
