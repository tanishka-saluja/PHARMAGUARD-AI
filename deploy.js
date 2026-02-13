const hre = require("hardhat");

async function main() {
  console.log("Deploying PharmaGuard NFT contract...");

  const PharmaBatchNFT = await hre.ethers.getContractFactory("PharmaBatchNFT");
  const pharmaBatchNFT = await PharmaBatchNFT.deploy();

  await pharmaBatchNFT.waitForDeployment();

  console.log("✅ PharmaGuard NFT Contract deployed to:", await pharmaBatchNFT.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
