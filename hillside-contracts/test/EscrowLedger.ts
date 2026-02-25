import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe("EscrowLedger", function () {
  it("locks funds and emits aligned EscrowLocked event", async function () {
    const [payer, recipient] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("EscrowLedger");
    const escrow = await factory.deploy();
    await escrow.waitForDeployment();

    const bookingId = ethers.keccak256(ethers.toUtf8Bytes("booking-001"));
    const amount = ethers.parseEther("0.01");

    await expect(
      escrow.connect(payer).lock(bookingId, recipient.address, { value: amount })
    )
      .to.emit(escrow, "EscrowLocked")
      .withArgs(bookingId, amount, payer.address, ethers.ZeroAddress, anyValue);
  });
});
