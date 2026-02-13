# Security and Misuse Model

## Threat classes addressed now

1. Report spam / griefing
- Controls: stake lock, cooldown, max open reports, duplicate open-report prevention.

2. Fraudulent high-severity escalation
- Controls: severity-3 reputation gate + higher stake requirement.

3. Identity replay attacks
- Controls: one-time nullifier usage for report submissions.

4. Unauthorized operational actions
- Controls: strict role-based permissions for regulator/manufacturer/lab/inspector.

5. Panic and emergency abuse propagation
- Controls: pause/unpause and quarantine switches under regulator role.

6. Economic abuse of bounty pool
- Controls: configurable slashing, bounded reward from pool, admin withdrawal role.

## Residual risks (next phase)

1. Key compromise risk for privileged roles
- Planned control: multisig/timelock and hardware-backed key custody.

2. Coordinated collusion among low-value wallets
- Planned control: cross-report graph analytics and anomaly scoring service.

3. Off-chain evidence tampering before upload
- Planned control: client-side signed evidence package with timestamp authority integration.

4. App reverse engineering and local tampering
- Planned control: MASVS-aligned hardening checklist and runtime protections.

## Operational policy defaults

- never store Aadhaar number on-chain
- use hashed/nullified identity tokens only
- preserve alternate-ID flow to avoid exclusion
- keep raw images off-chain; store references/hashes only
