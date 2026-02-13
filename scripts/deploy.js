const hre = require("hardhat");

async function maybeRegisterStakeholder(contract, envKey, registerFn, argsBuilder) {
  const address = process.env[envKey];
  if (!address) {
    return;
  }

  const args = argsBuilder(address);
  const tx = await contract[registerFn](...args);
  await tx.wait();
  console.log(`${registerFn} -> ${address}`);
}

async function main() {
  console.log(`Deploying PharmaBatchNFT on network: ${hre.network.name}`);

  const PharmaBatchNFT = await hre.ethers.getContractFactory("PharmaBatchNFT");
  const contract = await PharmaBatchNFT.deploy();
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("PharmaBatchNFT deployed at:", contractAddress);

  await maybeRegisterStakeholder(
    contract,
    "MANUFACTURER_ADDRESS",
    "registerManufacturer",
    (address) => [
      address,
      process.env.MANUFACTURER_LICENSE_NO || "MANU-LIC-001",
      process.env.MANUFACTURER_LEGAL_NAME || "Default Manufacturer",
      true,
    ]
  );

  await maybeRegisterStakeholder(
    contract,
    "LAB_ADDRESS",
    "registerLab",
    (address) => [address, process.env.LAB_ACCREDITATION_ID || "NABL-LAB-001", true]
  );

  if (process.env.INSPECTOR_ADDRESS) {
    const tx = await contract.setInspector(process.env.INSPECTOR_ADDRESS, true);
    await tx.wait();
    console.log("setInspector ->", process.env.INSPECTOR_ADDRESS);
  }

  const initialBountyEth = Number(process.env.INITIAL_BOUNTY_ETH || "0");
  if (initialBountyEth > 0) {
    const tx = await contract.fundBountyPool({
      value: hre.ethers.parseEther(initialBountyEth.toString()),
    });
    await tx.wait();
    console.log(`Funded bounty pool with ${initialBountyEth} ETH`);
  }

  console.log("Set this before running scripts:");
  console.log(`PHARMA_CONTRACT_ADDRESS=${contractAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
