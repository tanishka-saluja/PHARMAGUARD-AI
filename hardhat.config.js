require("@nomicfoundation/hardhat-toolbox");

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1,
      },
      viaIR: true,
      debug: {
        revertStrings: "strip",
      },
    },
  },
  networks: {
    hardhat: {},
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
      accounts,
      timeout: 180000,
    },
    amoy: {
      url: process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology/",
      accounts,
      timeout: 180000,
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
      accounts,
      timeout: 180000,
    },
    polygonZkEvmCardona: {
      url: process.env.POLYGON_ZKEVM_CARDONA_RPC_URL || "https://rpc.cardona.zkevm-rpc.com",
      accounts,
      timeout: 180000,
    },
    polygonZkEvm: {
      url: process.env.POLYGON_ZKEVM_RPC_URL || "https://zkevm-rpc.com",
      accounts,
      timeout: 180000,
    },
    agglayerCdk: {
      url: process.env.AGG_LAYER_CDK_RPC_URL || "",
      accounts,
      timeout: 180000,
    },
  },
};
