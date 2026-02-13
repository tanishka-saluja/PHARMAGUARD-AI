"""Federated learning aggregation utilities for PharmaGuard.

Implements:
- secure clipping,
- weighted FedAvg,
- optional differential privacy noise,
- model hash generation for on-chain anchoring.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import random
from dataclasses import dataclass
from typing import Dict, List, Sequence


@dataclass
class ClientUpdate:
    client_id: str
    num_examples: int
    weights: List[float]


@dataclass
class AggregationConfig:
    clipping_norm: float = 2.0
    noise_stddev: float = 0.0


class SecureFederatedAggregator:
    def __init__(self, config: AggregationConfig | None = None):
        self.config = config or AggregationConfig()

    def aggregate(self, updates: Sequence[ClientUpdate]) -> List[float]:
        if not updates:
            raise ValueError("No client updates supplied")

        dim = len(updates[0].weights)
        if dim == 0:
            raise ValueError("Empty model update vector")

        clipped: List[ClientUpdate] = []
        for update in updates:
            if len(update.weights) != dim:
                raise ValueError("All updates must have same dimension")
            clipped.append(
                ClientUpdate(
                    client_id=update.client_id,
                    num_examples=update.num_examples,
                    weights=self._clip(update.weights),
                )
            )

        total_examples = sum(max(1, u.num_examples) for u in clipped)

        agg = [0.0 for _ in range(dim)]
        for update in clipped:
            weight = max(1, update.num_examples) / total_examples
            for i in range(dim):
                agg[i] += update.weights[i] * weight

        if self.config.noise_stddev > 0:
            agg = [value + random.gauss(0.0, self.config.noise_stddev) for value in agg]

        return agg

    def model_hash(self, aggregated_weights: Sequence[float]) -> str:
        payload = json.dumps([round(x, 8) for x in aggregated_weights], separators=(",", ":"))
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _clip(self, vector: Sequence[float]) -> List[float]:
        norm = math.sqrt(sum(v * v for v in vector))
        if norm <= self.config.clipping_norm or norm == 0:
            return list(vector)

        scale = self.config.clipping_norm / norm
        return [v * scale for v in vector]


def load_updates(path: str) -> List[ClientUpdate]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    updates: List[ClientUpdate] = []
    for row in data:
        updates.append(
            ClientUpdate(
                client_id=row["client_id"],
                num_examples=int(row["num_examples"]),
                weights=[float(v) for v in row["weights"]],
            )
        )
    return updates


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Secure federated aggregator")
    parser.add_argument("--updates", required=True, help="Path to JSON updates list")
    parser.add_argument("--output", required=True, help="Path to output JSON")
    parser.add_argument("--clip", type=float, default=2.0)
    parser.add_argument("--noise", type=float, default=0.0)

    args = parser.parse_args()

    updates = load_updates(args.updates)
    aggregator = SecureFederatedAggregator(
        AggregationConfig(clipping_norm=args.clip, noise_stddev=args.noise)
    )

    merged = aggregator.aggregate(updates)
    model_hash = aggregator.model_hash(merged)

    payload = {
        "weights": merged,
        "model_hash": model_hash,
        "num_clients": len(updates),
    }

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


if __name__ == "__main__":
    main()
