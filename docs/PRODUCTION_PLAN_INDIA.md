# Production Plan for Indian Government Use (36-40 Hour Sprint)

## Goal

Deliver a non-toy, operationally meaningful counterfeit-medicine platform that supports:
- CDSCO/state regulator supervision,
- supply-chain traceability,
- safe citizen reports,
- constrained-connectivity field operations.

## Workstream A: Regulatory Traceability Core (Blockchain)

### Completed in codebase
- role-based governance and regulator controls
- signed mint payload verification
- high-risk and quarantine lifecycle
- dashboard counters and high-risk batch pagination

### Next implementation window
1. Integrate EPCIS event export bridge (GS1-compatible event schema)
2. Add multisig/timelock operation guard for high-impact regulator actions
3. Add dispute window and second-review role for severity-3 report resolution

## Workstream B: Anti-Misuse and Public Safety

### Completed in codebase
- stake-slash model
- nullifier replay protection
- cooldown, open-report caps
- automatic reporter blocking thresholds

### Next implementation window
1. Add independent appeal state machine for rejected reports
2. Add anomaly monitor for collusion patterns (same wallet clusters / repeated timing signatures)
3. Add on-chain penalty escalations tied to repeat abuse count

## Workstream C: AI and Federated Intelligence

### Completed in codebase
- multimodal risk engine scaffold
- secure federated aggregation utility
- on-chain model hash anchoring path

### Next implementation window
1. Train and integrate production TFLite classifier for packaging anomalies
2. Add secure model registry with signed model cards and evaluator metadata
3. Add drift detection metrics and retraining trigger policy

## Workstream D: Government Operations

### Completed in app
- dashboard metrics and high-risk retrieval
- compliance snapshot
- reporter profile insight
- offline queue capture

### Next implementation window
1. Build web regulator console with district-wise heatmaps
2. Add escalation workflow to drug inspectors and testing labs
3. Add immutable incident timeline export for legal evidentiary packs

## Success Criteria for This Sprint

- Every field action maps to a regulator/lab/manufacturer/public function
- No direct Aadhaar number persistence in app or contract
- All punitive/reward operations are auditable and role-gated
- Offline operation preserves eventual on-chain integrity
