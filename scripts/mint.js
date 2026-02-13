const hre = require("hardhat");

async function main() {
  const contractAddress = "0x010176646A36D172977Cb854D3C9973D823cf679";

  const PharmaBatchNFT = await hre.ethers.getContractAt("PharmaBatchNFT", contractAddress);
  const [signer] = await hre.ethers.getSigners();

  const messageHash = hre.ethers.solidityPackedKeccak256(
    ["string", "string", "uint256", "string"],
    ["Sun Pharma", "PG-2025-001", Math.floor(Date.now() / 1000) + 365*24*60*60, "0x1234abcd..."]
  );
  const signature = await signer.signMessage(hre.ethers.getBytes(messageHash));

  const tx = await PharmaBatchNFT.mintBatch(
    await signer.getAddress(),
    "PG-2025-001",
    "Sun Pharma",
    Math.floor(Date.now() / 1000) + 365*24*60*60,
    "0x1234abcd...",
    "https://i.imgur.com/7pL2f3k.jpg",   // ← your image
    signature
  );

  await tx.wait();
  console.log("✅ Minted with real medicine image! Token ID = 0");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
