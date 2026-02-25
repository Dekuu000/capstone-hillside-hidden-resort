import "@nomicfoundation/hardhat-toolbox";
import { HardhatUserConfig } from "hardhat/config";
import * as dotenv from "dotenv";

dotenv.config();

const sharedAccounts = process.env.DEPLOYER_PRIVATE_KEY
  ? [process.env.DEPLOYER_PRIVATE_KEY]
  : [];

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: sharedAccounts,
      chainId: 11155111,
    },
    amoy: {
      url: process.env.POLYGON_RPC_URL_AMOY || "",
      accounts: sharedAccounts,
      chainId: 80002,
    },
  },
};

export default config;
