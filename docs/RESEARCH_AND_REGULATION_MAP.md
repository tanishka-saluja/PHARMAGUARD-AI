# Research and Regulation Mapping

This document ties implementation choices to standards, policy documents, and technical research.

## A) India regulatory inputs and implications

1. CDSCO guidance on identification/verification of spurious drugs
- Source: [CDSCO consumer page](https://cdsco.gov.in/opencms/opencms/en/consumer/Spurious-Drugs/)
- Source PDF: [Guidance for Identification and Verification of Spurious Drugs (26 Feb 2024)](https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2018/UploadGazetteFiles/1.%20Guidance%20for%20Identification%20and%20Verification%20of%20Spurious%20Drugs_26.02.2024.pdf)
- Implementation tie-in: batch compliance fields + packaging hash + custody checkpoints + regulator quarantine.

2. CDSCO Gazette/Rules update channel
- Source: [CDSCO Gazette Notifications](https://cdsco.gov.in/opencms/opencms/en/Notifications/Gazette-Notifications/)
- Implementation tie-in: parameterized policy controls in contract (stake, cooldown, abuse thresholds) to adapt as rules evolve.

3. UIDAI offline verification and Aadhaar ecosystem constraints
- Source: [UIDAI OVSE FAQ](https://uidai.gov.in/en/283-faqs/aadhaar-online-services/offline-paperless-kyc/10731-what-is-offline-verification-seeking-entities-ovse.html)
- Source: [Aadhaar paperless offline eKYC](https://uidai.gov.in/en/ecosystem/authentication-devices-documents/about-aadhaar-paperless-offline-e-kyc.html)
- Implementation tie-in: nullifier-based identity signaling, no Aadhaar number storage on-chain.

4. Cyber incident governance for critical digital systems
- Source: [CERT-In Directions (28 Apr 2022) under Section 70B](https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf)
- Implementation tie-in: incident telemetry and response integration listed as next-phase deliverable.

## B) Supply-chain traceability standards

1. GS1 EPCIS
- Source: [GS1 EPCIS standard](https://www.gs1.org/standards/epcis)
- Implementation tie-in: chain custody events are structured to support an EPCIS export bridge.

2. GS1 Digital Link
- Source: [GS1 Digital Link](https://www.gs1.org/standards/gs1-digital-link)
- Implementation tie-in: QR payload normalization roadmap for regulator and consumer tooling interoperability.

## C) AI/ML evidence base

1. Federated learning baseline
- Source: [McMahan et al. 2017, AISTATS (PMLR)](https://proceedings.mlr.press/v54/mcmahan17a.html)
- Tie-in: federated aggregation path and model-hash anchoring.

2. Secure aggregation for FL
- Source: [Practical Secure Aggregation (Google Research publication)](https://research.google/pubs/practical-secure-aggregation-for-federated-learning-on-user-held-data/)
- Tie-in: secure aggregation design and clipping/noise controls in `ai-service/federated_aggregator.py`.

3. FL deployment challenges and architecture concerns
- Source: [Kairouz et al., Advances and Open Problems in Federated Learning](https://arxiv.org/abs/1912.04977)
- Tie-in: staged rollout with drift checks and governance.

4. Edge vision model baseline for mobile constraints
- Source: [MobileNetV2 (CVPR 2018)](https://openaccess.thecvf.com/content_cvpr_2018/html/Sandler_MobileNetV2_Inverted_Residuals_CVPR_2018_paper.html)
- Tie-in: target architecture for final on-device packaging model.

5. Pharmaceutical image-based authenticity/quality testing examples
- Source: [PubMed 32924760](https://pubmed.ncbi.nlm.nih.gov/32924760/)
- Tie-in: practical viability of low-cost digital image workflows for medicine quality checks.

## D) Blockchain architecture decision note

1. Polygon zkEVM lifecycle risk
- Source docs: [Polygon zkEVM docs](https://docs.polygon.technology/zkEVM/get-started/)
- Source update: [Polygon zkEVM next chapter announcement](https://polygon.technology/blog/polygon-zkevm-is-entering-its-next-chapter)
- Current implication: production routing should prioritize long-lived options (Polygon PoS and/or CDK chain), with zkEVM reserved for controlled contexts.

## E) Security governance references

1. NIST AI RMF
- Source: [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)

2. OWASP MASVS
- Source: [OWASP MASVS](https://mas.owasp.org/)

These are used for hardening checkpoints in `docs/SECURITY_AND_MISUSE_MODEL.md`.
