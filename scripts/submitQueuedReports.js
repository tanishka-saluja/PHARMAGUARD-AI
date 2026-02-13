const fs = require("fs");
const hre = require("hardhat");

function toNullifier(base) {
  return hre.ethers.keccak256(hre.ethers.toUtf8Bytes(base));
}

async function requiredStake(contract, severity) {
  if (severity === 1) return contract.minStakeWei();
  if (severity === 2) return contract.mediumStakeWei();
  return contract.highStakeWei();
}

async function main() {
  const contractAddress = process.env.PHARMA_CONTRACT_ADDRESS;
  const queuePath = process.env.REPORT_QUEUE_PATH;

  if (!contractAddress) {
    throw new Error("Missing PHARMA_CONTRACT_ADDRESS env var");
  }
  if (!queuePath) {
    throw new Error("Missing REPORT_QUEUE_PATH env var");
  }

  const raw = fs.readFileSync(queuePath, "utf-8");
  const queue = JSON.parse(raw);
  if (!Array.isArray(queue) || queue.length === 0) {
    console.log("No queued reports found.");
    return;
  }

  const contract = await hre.ethers.getContractAt("PharmaBatchNFT", contractAddress);

  const results = [];
  for (const item of queue) {
    const tokenId = Number(item.tokenId);
    const severity = Number(item.severity || 2);
    const reason = item.reason || "Suspicious packaging";
    const evidenceURI = item.evidenceURI || "ipfs://queued-evidence";
    const aadhaarSimId = item.aadhaarSimId || "offline-device";
    const nonce = item.nonce || `${Date.now()}`;

    const stake = await requiredStake(contract, severity);
    const nullifier = toNullifier(`${aadhaarSimId}:${tokenId}:${nonce}`);

    try {
      const tx = await contract.reportSuspiciousBatch(
        tokenId,
        nullifier,
        evidenceURI,
        reason,
        severity,
        { value: stake }
      );
      const receipt = await tx.wait();
      results.push({ tokenId, status: "submitted", txHash: receipt.hash });
      console.log(`Submitted report for token ${tokenId}: ${receipt.hash}`);
    } catch (error) {
      results.push({ tokenId, status: "failed", error: error.message });
      console.error(`Failed for token ${tokenId}:`, error.message);
    }
  }

  const outputPath = process.env.REPORT_QUEUE_RESULT_PATH || "./queued-report-results.json";
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log("Saved results to", outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
