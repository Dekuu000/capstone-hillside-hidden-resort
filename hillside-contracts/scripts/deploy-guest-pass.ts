import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log(`Deploying GuestPassNFT with ${deployer.address}`);
  console.log(`Network chainId: ${network.chainId}`);

  const GuestPassNFT = await ethers.getContractFactory("GuestPassNFT");
  const contract = await GuestPassNFT.deploy(
    "Hillside Guest Pass",
    "HGPASS",
    ""
  );
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`GuestPassNFT deployed: ${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
