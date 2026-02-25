import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log(`Deploying EscrowLedger with ${deployer.address}`);
  console.log(`Network chainId: ${network.chainId}`);

  const EscrowLedger = await ethers.getContractFactory("EscrowLedger");
  const escrowLedger = await EscrowLedger.deploy();
  await escrowLedger.waitForDeployment();

  const address = await escrowLedger.getAddress();
  console.log(`EscrowLedger deployed: ${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
