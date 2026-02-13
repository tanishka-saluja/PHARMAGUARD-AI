const hre = require("hardhat");

async function main() {
  const contractAddress = process.env.PHARMA_CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error("Missing PHARMA_CONTRACT_ADDRESS env var");
  }

  const tokenId = Number(process.env.TOKEN_ID || "0");
  const quarantined = String(process.env.QUARANTINED || "true").toLowerCase() === "true";
  const reasonCode = process.env.REASON_CODE || "CDSCO_ALERT_MATCH";

  const contract = await hre.ethers.getContractAt("PharmaBatchNFT", contractAddress);
  const tx = await contract.setBatchQuarantine(tokenId, quarantined, reasonCode);
  const receipt = await tx.wait();

  console.log("Quarantine update tx:", receipt.hash);
  console.log(`Batch ${tokenId} quarantine=${quarantined}, reason=${reasonCode}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
