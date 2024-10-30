const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VerifyInteraction Contract", function () {
  let VerifyInteraction, verifyInteraction;
  let owner, user;
  let serviceId;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners(2);

    // Deploy the contract
    VerifyInteraction = await ethers.getContractFactory("VerifyInteraction");
    verifyInteraction = await VerifyInteraction.deploy();
    await verifyInteraction.deployed();
  });

  describe("Service Registration", function () {
    it("Should register a new service", async function () {
      const metadata = "Service Metadata";
      const tx = await verifyInteraction.connect(owner).registerService(metadata);
      const receipt = await tx.wait();

      // Extract service ID from emitted event
      const event = receipt.events.find((e) => e.event === "ServiceRegistered");
      serviceId = event.args.serviceId.toNumber();
        // serviceId = 1;
      // Verify service ownership and metadata
      const services = await verifyInteraction.getServicesByOwner(owner.address);
      expect(services.length).to.equal(1);
      expect(services[0].serviceId).to.equal(serviceId);
      expect(services[0].metadata).to.equal(metadata);
    });
  });

  describe("Interaction Registration", function () {
    beforeEach(async function () {
      // Register a service
      const metadata = "Service Metadata";
      const tx = await verifyInteraction.connect(owner).registerService(metadata);
      const receipt = await tx.wait();
      serviceId = receipt.events[0].args.serviceId.toNumber();
    });

    it("Should register an interaction with a valid signature", async function () {
      // Prepare message and signature
      const messageHash = await verifyInteraction.getMessageHash(user.address, serviceId, "Record Interaction");
      const signature = await user.signMessage(ethers.utils.arrayify(messageHash));

      // Register interaction
      await expect(
        verifyInteraction.connect(owner).registerInteraction(user.address, serviceId, signature)
      ).to.not.be.reverted;

    });

    it("Should reject interaction with an invalid signature", async function () {
      const fakeSignature = "0x" + "1".repeat(130); // Invalid signature
      await expect(
        verifyInteraction.connect(owner).registerInteraction(user.address, serviceId, fakeSignature)
      ).to.be.revertedWith("Invalid signature");
    });
  });

  describe("Feedback Verification and Submission", function () {
    beforeEach(async function () {
      // Register a service
      const metadata = "Service Metadata";
      const tx = await verifyInteraction.connect(owner).registerService(metadata);
      const receipt = await tx.wait();
      serviceId = receipt.events[0].args.serviceId.toNumber();

      // Register an interaction
      const message = await verifyInteraction.getMessageHash(user.address, serviceId, "Record Interaction");
      const signature = await user.signMessage(ethers.utils.arrayify(message));
      await verifyInteraction.connect(owner).registerInteraction(user.address, serviceId, signature);
    });

    it("Should verify feedback filling with correct signature", async function () {
      const feedbackMessage = await verifyInteraction.getMessageHash(user.address, serviceId, "Feedback Filling");
      const feedbackSignature = await user.signMessage(ethers.utils.arrayify(feedbackMessage));

      const isVerified = await verifyInteraction.verifyFeedbackFilling(user.address, serviceId, feedbackSignature);
      expect(isVerified).to.be.true;
    });

    it("Should allow feedback submission after verification", async function () {
      const feedbackMessage = await verifyInteraction.getMessageHash(user.address, serviceId, "Feedback Filling");
      const feedbackSignature = await user.signMessage(ethers.utils.arrayify(feedbackMessage));

      const feedback = "Great service!";
      await verifyInteraction
        .connect(owner)
        .submitFeedback(user.address, serviceId, feedbackSignature, feedback);

      const feedbacks = await verifyInteraction.getFeedbackByService(serviceId);
      expect(feedbacks.length).to.equal(1);
      expect(feedbacks[0]).to.equal(feedback);
    });
  });
});
