const hre = require("hardhat");

function envOrDefault(name, fallback) {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

function buildMintPayloadHash({
  batchNumber,
  manufacturerName,
  productName,
  mfgDate,
  expiryTs,
  apiHash,
  packagingHash,
  to,
  contractAddress,
  chainId,
}) {
  const coder = hre.ethers.AbiCoder.defaultAbiCoder();
  const encoded = coder.encode(
    [
      "string",
      "string",
      "string",
      "uint64",
      "uint64",
      "string",
      "bytes32",
      "address",
      "address",
      "uint256",
    ],
    [
      batchNumber,
      manufacturerName,
      productName,
      mfgDate,
      expiryTs,
      apiHash,
      packagingHash,
      to,
      contractAddress,
      chainId,
    ]
  );
  return hre.ethers.keccak256(encoded);
}

async function main() {
  const contractAddress = process.env.PHARMA_CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error("Missing PHARMA_CONTRACT_ADDRESS env var");
  }

  const [signer] = await hre.ethers.getSigners();
  const to = envOrDefault("MINT_TO", await signer.getAddress());

  const contract = await hre.ethers.getContractAt("PharmaBatchNFT", contractAddress);

  const manufacturerName = envOrDefault("MANUFACTURER", "Sun Pharma");
  const productName = envOrDefault("PRODUCT_NAME", "Amoxicillin 500mg");
  const batchNumber = envOrDefault("BATCH_NUMBER", `PG-${Date.now()}`);
  const apiHash = envOrDefault("API_HASH", "api-hash-placeholder");
  const tokenURI = envOrDefault("TOKEN_URI", "ipfs://medicine-metadata-placeholder");

  const nowTs = Math.floor(Date.now() / 1000);
  const mfgDate = Number(envOrDefault("MFG_DATE", `${nowTs - 7 * 24 * 60 * 60}`));
  const expiryTs = Number(envOrDefault("EXPIRY_TS", `${nowTs + 365 * 24 * 60 * 60}`));
  const packagingHash = envOrDefault(
    "PACKAGING_HASH",
    hre.ethers.keccak256(hre.ethers.toUtf8Bytes(`${batchNumber}:${tokenURI}`))
  );

  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  const payloadHash = buildMintPayloadHash({
    batchNumber,
    manufacturerName,
    productName,
    mfgDate,
    expiryTs,
    apiHash,
    packagingHash,
    to,
    contractAddress,
    chainId,
  });

  const manufacturerSignature = await signer.signMessage(hre.ethers.getBytes(payloadHash));

  const tx = await contract.mintBatchWithCompliance(
    to,
    batchNumber,
    manufacturerName,
    productName,
    mfgDate,
    expiryTs,
    apiHash,
    packagingHash,
    tokenURI,
    manufacturerSignature
  );

  const receipt = await tx.wait();
  let mintedTokenId = null;
  for (const log of receipt.logs || []) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === "BatchMinted") {
        mintedTokenId = parsed.args.tokenId?.toString?.() ?? String(parsed.args.tokenId);
        break;
      }
    } catch {
      // Skip logs from other contracts/topics.
    }
  }

  console.log("Mint tx hash:", receipt.hash);
  if (mintedTokenId !== null) {
    console.log("Minted tokenId:", mintedTokenId);
  }
  console.log("Minted batch:", batchNumber);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
