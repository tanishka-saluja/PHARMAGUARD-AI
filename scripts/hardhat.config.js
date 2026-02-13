require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.20",
  networks: {
    sepolia: {
      url: "https://sepolia.drpc.org",           // very fast public RPC
      accounts: ["0xbc10471c7a3c4b19258371ed67717bfbe4beb1089c86180899e7b7789c05f294"],
      timeout: 180000,                           // 3 minutes timeout
      gasPrice: "auto"
    }
  }
};
