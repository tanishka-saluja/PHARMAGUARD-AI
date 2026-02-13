const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");

function payloadHashForMint({
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
  const coder = ethers.AbiCoder.defaultAbiCoder();
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

  return ethers.keccak256(encoded);
}

describe("PharmaBatchNFT", function () {
  async function deployFixture() {
    const [owner, reporter, lab] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("PharmaBatchNFT");
    const pharma = await Factory.deploy();
    await pharma.waitForDeployment();

    await pharma.registerManufacturer(owner.address, "LIC-001", "Owner Manufacturer", true);
    await pharma.registerLab(lab.address, "NABL-001", true);

    return { pharma, owner, reporter, lab };
  }

  async function mintSampleBatch(pharma, signer, toAddress) {
    const nowTs = Math.floor(Date.now() / 1000);
    const mfgDate = nowTs - 24 * 60 * 60;
    const expiryTs = nowTs + 365 * 24 * 60 * 60;

    const batchNumber = "PG-TEST-001";
    const manufacturerName = "Owner Manufacturer";
    const productName = "Amoxicillin 500";
    const apiHash = "api-hash";
    const packagingHash = ethers.keccak256(ethers.toUtf8Bytes("packaging-v1"));

    const network = await ethers.provider.getNetwork();
    const payloadHash = payloadHashForMint({
      batchNumber,
      manufacturerName,
      productName,
      mfgDate,
      expiryTs,
      apiHash,
      packagingHash,
      to: toAddress,
      contractAddress: await pharma.getAddress(),
      chainId: Number(network.chainId),
    });

    const signature = await signer.signMessage(ethers.getBytes(payloadHash));

    const tx = await pharma
      .connect(signer)
      .mintBatchWithCompliance(
        toAddress,
        batchNumber,
        manufacturerName,
        productName,
        mfgDate,
        expiryTs,
        apiHash,
        packagingHash,
        "ipfs://test-token",
        signature
      );

    await tx.wait();
  }

  it("mints and verifies a clean batch", async function () {
    const { pharma, owner } = await loadFixture(deployFixture);
    await mintSampleBatch(pharma, owner, owner.address);

    const [isValid, risk] = await pharma.verifyBatch(0);
    expect(isValid).to.equal(true);
    expect(risk).to.equal("No model attestation yet");
  });

  it("flags severity-3 report as high risk and resolves as fake", async function () {
    const { pharma, owner, reporter } = await loadFixture(deployFixture);
    await mintSampleBatch(pharma, owner, owner.address);

    const minStake = await pharma.minStakeWei();
    const mediumStake = await pharma.mediumStakeWei();
    const highStake = await pharma.highStakeWei();
    const baseReward = await pharma.baseRewardWei();
    const falseSlash = await pharma.falseReportSlashBps();

    await pharma.setPolicyParameters(
      minStake,
      mediumStake,
      highStake,
      baseReward,
      falseSlash,
      1,
      5,
      0
    );

    await pharma.fundBountyPool({ value: ethers.parseEther("1") });

    const identityNullifier = ethers.keccak256(ethers.toUtf8Bytes("reporter-1:batch-0:nonce-1"));

    await pharma
      .connect(reporter)
      .reportSuspiciousBatch(
        0,
        identityNullifier,
        "ipfs://fake-proof",
        "Seal mismatch and blurry print",
        3,
        { value: highStake }
      );

    const [isValidAfterReport, riskAfterReport] = await pharma.verifyBatch(0);
    expect(isValidAfterReport).to.equal(false);
    expect(riskAfterReport).to.equal("High-risk batch");

    await pharma.resolveReport(0, true);

    const report = await pharma.reports(0);
    expect(report.status).to.equal(1);

    const profile = await pharma.reporterProfiles(reporter.address);
    expect(profile.reportsConfirmed).to.equal(1);
    expect(profile.reputation).to.be.gt(0);

    const [ids] = await pharma.getHighRiskBatchIds(0, 10);
    expect(ids.map(Number)).to.include(0);
  });

  it("slashes stake and reputation on false report", async function () {
    const { pharma, owner, reporter } = await loadFixture(deployFixture);
    await mintSampleBatch(pharma, owner, owner.address);

    const mediumStake = await pharma.mediumStakeWei();
    const slashBps = await pharma.falseReportSlashBps();

    const identityNullifier = ethers.keccak256(ethers.toUtf8Bytes("reporter-2:batch-0:nonce-1"));

    await pharma
      .connect(reporter)
      .reportSuspiciousBatch(
        0,
        identityNullifier,
        "ipfs://weak-proof",
        "Packaging looked odd",
        2,
        { value: mediumStake }
      );

    await pharma.resolveReport(0, false);

    const report = await pharma.reports(0);
    expect(report.status).to.equal(2);

    const profile = await pharma.reporterProfiles(reporter.address);
    expect(profile.reputation).to.be.lt(0);

    const expectedSlash = (mediumStake * slashBps) / 10_000n;
    const pool = await pharma.bountyPoolWei();
    expect(pool).to.equal(expectedSlash);
  });

  it("rejects duplicate open report by same reporter on same batch", async function () {
    const { pharma, owner, reporter } = await loadFixture(deployFixture);
    await mintSampleBatch(pharma, owner, owner.address);

    const minStake = await pharma.minStakeWei();

    await pharma
      .connect(reporter)
      .reportSuspiciousBatch(
        0,
        ethers.keccak256(ethers.toUtf8Bytes("dup-1")),
        "ipfs://evidence-1",
        "Suspicious print quality",
        1,
        { value: minStake }
      );

    await expect(
      pharma
        .connect(reporter)
        .reportSuspiciousBatch(
          0,
          ethers.keccak256(ethers.toUtf8Bytes("dup-2")),
          "ipfs://evidence-2",
          "Second immediate report",
          1,
          { value: minStake }
        )
    ).to.be.reverted;
  });
});
