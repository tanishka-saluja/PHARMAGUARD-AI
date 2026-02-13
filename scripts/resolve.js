const hre = require("hardhat");

async function main() {
  const contractAddress = process.env.PHARMA_CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error("Missing PHARMA_CONTRACT_ADDRESS env var");
  }

  const reportId = Number(process.env.REPORT_ID || "0");
  const confirmedFake = String(process.env.CONFIRMED_FAKE || "true").toLowerCase() === "true";

  const contract = await hre.ethers.getContractAt("PharmaBatchNFT", contractAddress);
  const tx = await contract.resolveReport(reportId, confirmedFake);
  const receipt = await tx.wait();

  console.log("Report resolved in tx:", receipt.hash);
  console.log(`Resolved report ${reportId}, confirmedFake=${confirmedFake}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
