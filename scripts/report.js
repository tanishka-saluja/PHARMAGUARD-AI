const hre = require("hardhat");

function toNullifier(base) {
  return hre.ethers.keccak256(hre.ethers.toUtf8Bytes(base));
}

async function main() {
  const contractAddress = process.env.PHARMA_CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error("Missing PHARMA_CONTRACT_ADDRESS env var");
  }

  const tokenId = Number(process.env.TOKEN_ID || "0");
  const severity = Number(process.env.SEVERITY || "2");
  const aadhaarSimId = process.env.AADHAAR_SIM_ID || "demo-aadhaar-0001";
  const evidenceURI = process.env.EVIDENCE_URI || "ipfs://evidence-placeholder";
  const reason = process.env.REASON || "Suspicious hologram and packaging mismatch";
  const nonce = process.env.REPORT_NONCE || `${Date.now()}`;

  const contract = await hre.ethers.getContractAt("PharmaBatchNFT", contractAddress);

  const minStakeWei = await contract.minStakeWei();
  const mediumStakeWei = await contract.mediumStakeWei();
  const highStakeWei = await contract.highStakeWei();

  let requiredStake = minStakeWei;
  if (severity === 2) {
    requiredStake = mediumStakeWei;
  } else if (severity === 3) {
    requiredStake = highStakeWei;
  }

  const identityNullifier = toNullifier(`${aadhaarSimId}:${tokenId}:${nonce}`);

  const tx = await contract.reportSuspiciousBatch(
    tokenId,
    identityNullifier,
    evidenceURI,
    reason,
    severity,
    { value: requiredStake }
  );

  const receipt = await tx.wait();
  let parsedReportId = null;
  for (const log of receipt.logs || []) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === "SuspiciousBatchReported") {
        parsedReportId = parsed.args.reportId?.toString?.() ?? String(parsed.args.reportId);
        break;
      }
    } catch {
      // Skip unrelated logs
    }
  }

  console.log("Report submitted in tx:", receipt.hash);
  if (parsedReportId !== null) {
    console.log("Report ID:", parsedReportId);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
