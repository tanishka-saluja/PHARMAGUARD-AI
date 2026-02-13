# PharmaGuard India (Government-Grade Build)

PharmaGuard India is a counterfeit-medicine prevention and response stack designed for real public-sector use:

- tamper-evident pharma traceability on-chain,
- regulator/lab/manufacturer role controls,
- anti-misuse citizen reporting with staking and slashing,
- offline-first field workflow,
- federated AI model update anchoring.

This repository has been upgraded from prototype logic to a policy-driven architecture intended for CDSCO/state-drug-control workflows.

## What Is Now Production-Oriented

### 1) Security and governance hardening (smart contract)

`contracts/PharmaBatchNFT.sol` now includes:
- role separation: `REGULATOR_ROLE`, `MANUFACTURER_ROLE`, `LAB_ROLE`, `INSPECTOR_ROLE`
- regulator-managed onboarding for manufacturers/labs
- emergency pause/unpause controls
- signed batch mint payload validation (prevents forged mint metadata)
- quarantine controls for regulator interventions
- lab attestations and federated model hash updates
- anti-abuse reporter controls:
  - severity-based stake requirements
  - cooldown and max-open-report throttling
  - nullifier replay protection
  - reputation-based severity-3 gating
  - slashing and auto-blocking for repeated abuse
- O(1)-style dashboard counters (no full-chain scans needed for key metrics)

### 2) Real ops scripts

Under `scripts/`:
- `deploy.js`: deploy + optional role bootstrap + initial bounty funding
- `mint.js`: compliant signed mint flow
- `report.js`: severity-based suspicious report submission
- `resolve.js`: regulator decision workflow
- `quarantine.js`: regulator quarantine command
- `submitQueuedReports.js`: flush offline queue to chain

### 3) Mobile app upgraded to operations console

`mobile-app/App.js` supports:
- on-chain verification with offline fallback cache
- compliance snapshot reads per batch
- reporter profile lookup (reputation/open reports/blocked status)
- government dashboard snapshot (`getDashboardSummary`, high-risk IDs)
- structured offline report queue for later secure submission
- on-device TensorFlow MobileNet image classification for packaging-risk signals
- server-driven awareness blog feed with emergency alert highlighting and local cache fallback

### 4) Advanced AI and federated module

`ai-service/` adds:
- `risk_engine.py`: multimodal risk scoring pipeline (model + OCR + QR + visual checks)
- `federated_aggregator.py`: clipped federated aggregation + optional DP noise + model hash output

## Folder, Language, and File Extension Map

This section documents the source/config/docs structure and how each file type is used in code.
Excluded from this map: generated/vendor folders (`node_modules/`, `mobile-app/node_modules/`, `artifacts/`, `cache/`, `mobile-app/.expo/`, `ai-service/__pycache__/`).

### Extensions Used

| Extension | Language / Format | Where Used | Role in This Project |
| --- | --- | --- | --- |
| `.sol` | Solidity | `contracts/` | Smart contract logic for traceability, role control, anti-misuse, and dashboard counters. |
| `.js` | JavaScript (Node.js + React Native) | root scripts, backend feed, mobile app | Deployment/reporting automation, awareness API server, and mobile UI/business logic. |
| `.py` | Python | `ai-service/` | AI risk scoring and federated model aggregation utilities. |
| `.json` | JSON | config/content/data | App/build config, awareness feed payloads, package manifests, and lock metadata. |
| `.md` | Markdown | root and `docs/` | Architecture, production planning, policy notes, and API documentation. |
| `.env` | Environment file | root | Local secrets and runtime environment variables. |
| `.example` | Environment template | root | Safe template for required env keys (`.env.example`). |
| `.txt` | Plain text requirements | `ai-service/requirements.txt` | Python dependency list for AI service setup. |
| `.png` | Static image assets | `mobile-app/assets/` | App icon/splash/favicons for Expo mobile client. |
| `.gitignore` | Git ignore rules | root + mobile app | Prevents committing local/build/generated artifacts. |

### Folder-Level Functionality

| Folder | Main Extensions | Runtime / Stack | Functionality in Code |
| --- | --- | --- | --- |
| `contracts/` | `.sol` | EVM (Hardhat toolchain) | Pharma blockchain contract (`PharmaBatchNFT`) with verification, reporting, slashing, and governance rules. |
| `scripts/` | `.js` | Node.js + Hardhat + Ethers | Operational flows: deploy, mint, report, resolve, quarantine, and submit offline queue reports. |
| `test/` | `.js` | Hardhat test runner | Contract behavior tests (mint/verify/report/resolve/slash paths). |
| `ai-service/` | `.py`, `.txt`, `.md` | Python | AI scoring and federated learning support modules with setup docs. |
| `awareness-feed/` | `.js`, `.json` | Node.js HTTP server | Public awareness content API and local feed source. |
| `mobile-app/` | `.js`, `.json`, `.png`, `.gitignore` | React Native + Expo | Field app UI: verification, AI inference, queueing, awareness feed, and console mode UX. |
| `mobile-app/content/` | `.js` | React Native | Awareness post seed content and fallback data. |
| `mobile-app/services/` | `.js` | React Native + TensorFlow.js | MobileNet model boot, image classification, and risk scoring helper logic. |
| `mobile-app/shims/` | `.js` | Metro bundler shim | Compatibility shim for `react-native-fs` resolution under TensorFlow RN package path. |
| `docs/` | `.md` | Documentation | Production plan, research/regulatory mapping, misuse model, awareness API spec. |
| `ignition/modules/` | `.js` | Hardhat Ignition | Starter module template; not primary deployment path in current flow. |

### File-Level Usage Map

| Path | Extension | Used For |
| --- | --- | --- |
| `.env` | `.env` | Local private keys, RPC URLs, admin keys, and runtime flags. |
| `.env.example` | `.example` | Template for required environment variables. |
| `.gitignore` | `.gitignore` | Root git exclusions. |
| `README.md` | `.md` | Main project overview and runbook. |
| `hardhat.config.js` | `.js` | Solidity compiler + network definitions (`sepolia`, `amoy`, etc.). |
| `package.json` | `.json` | Root scripts/dependencies for Hardhat, scripts, and awareness server commands. |
| `package-lock.json` | `.json` | Root dependency lockfile. |
| `contracts/PharmaBatchNFT.sol` | `.sol` | Core smart contract (roles, verification, reporting, bounty, anti-abuse, dashboard). |
| `scripts/deploy.js` | `.js` | Contract deployment and optional role/bootstrap setup. |
| `scripts/mint.js` | `.js` | Mint compliant pharma batch entries on-chain. |
| `scripts/report.js` | `.js` | Submit suspicious-batch reports with policy-compatible fields. |
| `scripts/resolve.js` | `.js` | Regulator resolution of reports (confirm fake / reject / penalties). |
| `scripts/quarantine.js` | `.js` | Quarantine/unquarantine high-risk token batches. |
| `scripts/submitQueuedReports.js` | `.js` | Push offline-collected reports from JSON queue to chain. |
| `test/Lock.js` | `.js` | Hardhat test cases for pharma contract behavior. |
| `ai-service/README.md` | `.md` | AI module usage notes and context. |
| `ai-service/requirements.txt` | `.txt` | Python package requirements for AI scripts. |
| `ai-service/risk_engine.py` | `.py` | Multimodal risk-scoring pipeline utilities. |
| `ai-service/federated_aggregator.py` | `.py` | Federated aggregation with clipping/noise options and model hash output. |
| `awareness-feed/server.js` | `.js` | Local API server exposing awareness feed endpoints. |
| `awareness-feed/feed.json` | `.json` | Awareness blog/article dataset consumed by mobile app/API. |
| `docs/PRODUCTION_PLAN_INDIA.md` | `.md` | Rollout plan for production-grade India deployment. |
| `docs/RESEARCH_AND_REGULATION_MAP.md` | `.md` | Research/regulatory references mapped to design decisions. |
| `docs/SECURITY_AND_MISUSE_MODEL.md` | `.md` | Threat model and anti-misuse controls. |
| `docs/AWARENESS_FEED_API.md` | `.md` | Awareness service API contract and examples. |
| `ignition/modules/Lock.js` | `.js` | Default Hardhat ignition sample module kept for reference. |
| `mobile-app/.gitignore` | `.gitignore` | Mobile app-specific git exclusions. |
| `mobile-app/package.json` | `.json` | Expo/React Native dependencies and scripts. |
| `mobile-app/package-lock.json` | `.json` | Mobile dependency lockfile. |
| `mobile-app/app.json` | `.json` | Expo app config (permissions, plugins, metadata). |
| `mobile-app/index.js` | `.js` | Mobile app entry point registration. |
| `mobile-app/App.js` | `.js` | Main mobile UI + blockchain calls + console-mode UX + queue + awareness logic. |
| `mobile-app/metro.config.js` | `.js` | Metro resolver setup (including TensorFlow-related shim aliasing). |
| `mobile-app/content/awarenessPosts.js` | `.js` | Local fallback awareness content definitions. |
| `mobile-app/services/mobileNetService.js` | `.js` | TensorFlow MobileNet init/classify/score helper service. |
| `mobile-app/shims/react-native-fs.js` | `.js` | Stub shim for optional RN filesystem import path. |
| `mobile-app/assets/icon.png` | `.png` | App icon asset. |
| `mobile-app/assets/adaptive-icon.png` | `.png` | Android adaptive icon foreground asset. |
| `mobile-app/assets/splash-icon.png` | `.png` | App splash screen asset. |
| `mobile-app/assets/favicon.png` | `.png` | Web/favicon asset for Expo web context. |

## Quick Start

### 1) Install

```bash
npm install
cd mobile-app && npm install
```

### 2) Configure

```bash
cp .env.example .env
```

### 3) Compile and test

```bash
npm run compile
npm test
```

### 4) Deploy and run flows

```bash
npm run deploy:sepolia
PHARMA_CONTRACT_ADDRESS=<addr> npm run mint:sepolia
PHARMA_CONTRACT_ADDRESS=<addr> npm run report:sepolia
PHARMA_CONTRACT_ADDRESS=<addr> npm run resolve:sepolia

# optional Polygon testnet path
npm run deploy:amoy
```

### 5) Run awareness feed server (official alerts)

```bash
npm run awareness:server
```

Server endpoints:
- `GET /api/awareness` returns awareness posts for mobile app
- `POST /api/awareness` publishes alerts (requires `x-admin-key` header)

Example publish call:

```bash
curl -X POST http://localhost:8787/api/awareness \
  -H "Content-Type: application/json" \
  -H "x-admin-key: change-me-in-production" \
  -d '{
    "mode": "append",
    "post": {
      "title": "Emergency Recall: Suspected Counterfeit Antipyretic",
      "summary": "Do not consume batch AP-2026-991 pending lab clearance.",
      "details": [
        "Retail inspections found label inconsistencies.",
        "Patients should verify all strips from this batch."
      ],
      "action": "Verify in PharmaGuard and report suspicious stock immediately.",
      "emergency": true,
      "tags": ["recall", "urgent", "field-alert"]
    }
  }'
```

## Chain Strategy (Important)

Polygon docs currently note that zkEVM network is sunsetting in 2026. For production continuity, default operational routing should prioritize long-horizon networks (e.g., Polygon PoS and/or a dedicated Polygon CDK chain), while using zkEVM paths only where lifecycle risk is accepted.

## Government Deployment Documents

- `docs/PRODUCTION_PLAN_INDIA.md`
- `docs/RESEARCH_AND_REGULATION_MAP.md`
- `docs/SECURITY_AND_MISUSE_MODEL.md`
- `docs/AWARENESS_FEED_API.md`

## Current Boundaries (still to complete in next cycles)

- Replace baseline MobileNet generic classifier with a fine-tuned pharma-specific TFLite model
- Replace simulated identity nullifier flow with integrated OVSE-compliant verifier gateway
- Add SIEM integration and CERT-In incident automation playbooks
- Add external key custody/multisig policy integration for regulator operations
