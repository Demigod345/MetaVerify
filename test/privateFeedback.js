const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PrivateFeedback Contract", function () {
  let PrivateFeedback, privateFeedback, owner, user1, user2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    PrivateFeedback = await ethers.getContractFactory("PrivateFeedback");
    privateFeedback = await PrivateFeedback.deploy();
    await privateFeedback.deployed();
  });

  describe("Service Registration", function () {
    it("Should register a new service", async function () {
      await expect(privateFeedback.connect(owner).registerService(12345, 67890))
        .to.emit(privateFeedback, "ServiceRegistered")
        .withArgs(owner.address, 1);
    });
  });

  describe("Interaction and Feedback", function () {
    beforeEach(async function () {
      await privateFeedback.connect(owner).registerService(12345, 67890);
    });

    it("Should register an interaction", async function () {
      const serviceId = 1;
      const timestamp = Math.floor(Date.now() / 1000);

      const domain = {
        name: "PrivateFeedback",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: privateFeedback.address,
      };

      const types = {
        Interaction: [
          { name: "user", type: "address" },
          { name: "serviceId", type: "uint256" },
          { name: "timestamp", type: "uint256" },
        ],
      };

      const value = {
        user: user1.address,
        serviceId: serviceId,
        timestamp: timestamp,
      };

      const signature = await user1._signTypedData(domain, types, value);
      const { v, r, s } = ethers.utils.splitSignature(signature);

      await expect(
        privateFeedback
          .connect(user1)
          .registerInteraction(serviceId, v, r, s, timestamp)
      ).to.not.be.reverted;
    });

    it("Should submit feedback", async function () {
      const serviceId = 1;
      const timestamp = Math.floor(Date.now() / 1000);

      // First, register an interaction
      const interactionSignature = await user1._signTypedData(
        {
          name: "PrivateFeedback",
          version: "1",
          chainId: (await ethers.provider.getNetwork()).chainId,
          verifyingContract: privateFeedback.address,
        },
        {
          Interaction: [
            { name: "user", type: "address" },
            { name: "serviceId", type: "uint256" },
            { name: "timestamp", type: "uint256" },
          ],
        },
        {
          user: user1.address,
          serviceId: serviceId,
          timestamp: timestamp,
        }
      );
      const {
        v: iv,
        r: ir,
        s: is,
      } = ethers.utils.splitSignature(interactionSignature);
      await privateFeedback
        .connect(user1)
        .registerInteraction(serviceId, iv, ir, is, timestamp);

      // Now, submit feedback
      const feedbackSignature = await user1._signTypedData(
        {
          name: "PrivateFeedback",
          version: "1",
          chainId: (await ethers.provider.getNetwork()).chainId,
          verifyingContract: privateFeedback.address,
        },
        {
          Feedback: [
            { name: "user", type: "address" },
            { name: "serviceId", type: "uint256" },
            { name: "timestamp", type: "uint256" },
            { name: "feedback_p1", type: "uint256" },
            { name: "feedback_p2", type: "uint256" },
          ],
        },
        {
          user: user1.address,
          serviceId: serviceId,
          timestamp: timestamp,
          feedback_p1: 9876,
          feedback_p2: 5432,
        }
      );
      const {
        v: fv,
        r: fr,
        s: fs,
      } = ethers.utils.splitSignature(feedbackSignature);

      await expect(
        privateFeedback
          .connect(user1)
          .submitFeedback(serviceId, fv, fr, fs, timestamp, 9876, 5432)
      ).to.not.be.reverted;
    });
  });

  describe("Reward Distribution", function () {
    beforeEach(async function () {
      await privateFeedback.connect(owner).registerService(12345, 67890);
    });

    it("Should distribute rewards to users who provided feedback", async function () {
      const serviceId = 1;
      const timestamp = Math.floor(Date.now() / 1000);

      // Register interaction and submit feedback for user1
      const interactionSignature = await user1._signTypedData(
        {
          name: "PrivateFeedback",
          version: "1",
          chainId: (await ethers.provider.getNetwork()).chainId,
          verifyingContract: privateFeedback.address,
        },
        {
          Interaction: [
            { name: "user", type: "address" },
            { name: "serviceId", type: "uint256" },
            { name: "timestamp", type: "uint256" },
          ],
        },
        {
          user: user1.address,
          serviceId: serviceId,
          timestamp: timestamp,
        }
      );
      const {
        v: iv,
        r: ir,
        s: is,
      } = ethers.utils.splitSignature(interactionSignature);
      await privateFeedback
        .connect(user1)
        .registerInteraction(serviceId, iv, ir, is, timestamp);

      const feedbackSignature = await user1._signTypedData(
        {
          name: "PrivateFeedback",
          version: "1",
          chainId: (await ethers.provider.getNetwork()).chainId,
          verifyingContract: privateFeedback.address,
        },
        {
          Feedback: [
            { name: "user", type: "address" },
            { name: "serviceId", type: "uint256" },
            { name: "timestamp", type: "uint256" },
            { name: "feedback_p1", type: "uint256" },
            { name: "feedback_p2", type: "uint256" },
          ],
        },
        {
          user: user1.address,
          serviceId: serviceId,
          timestamp: timestamp,
          feedback_p1: 9876,
          feedback_p2: 5432,
        }
      );
      const {
        v: fv,
        r: fr,
        s: fs,
      } = ethers.utils.splitSignature(feedbackSignature);
      await privateFeedback
        .connect(user1)
        .submitFeedback(serviceId, fv, fr, fs, timestamp, 9876, 5432);

      // Distribute rewards
      const rewardAmount = ethers.utils.parseEther("0.1");
      const initialBalance = await ethers.provider.getBalance(user1.address);

      await expect(
        privateFeedback
          .connect(owner)
          .rewardUsersForFeedback(serviceId, rewardAmount, {
            value: rewardAmount,
          })
      ).to.not.be.reverted;

      const finalBalance = await ethers.provider.getBalance(user1.address);
      expect(finalBalance.sub(initialBalance)).to.equal(rewardAmount);
    });

    it("Should revert if insufficient funds are provided", async function () {
      const serviceId = 1;
      const rewardAmount = ethers.utils.parseEther("0.1");
      const timestamp = Math.floor(Date.now() / 1000);

      // Register interaction and submit feedback for user1
      const interactionSignature = await user1._signTypedData(
        {
          name: "PrivateFeedback",
          version: "1",
          chainId: (await ethers.provider.getNetwork()).chainId,
          verifyingContract: privateFeedback.address,
        },
        {
          Interaction: [
            { name: "user", type: "address" },
            { name: "serviceId", type: "uint256" },
            { name: "timestamp", type: "uint256" },
          ],
        },
        {
          user: user1.address,
          serviceId: serviceId,
          timestamp: timestamp,
        }
      );
      const {
        v: iv,
        r: ir,
        s: is,
      } = ethers.utils.splitSignature(interactionSignature);
      await privateFeedback
        .connect(user1)
        .registerInteraction(serviceId, iv, ir, is, timestamp);

      const feedbackSignature = await user1._signTypedData(
        {
          name: "PrivateFeedback",
          version: "1",
          chainId: (await ethers.provider.getNetwork()).chainId,
          verifyingContract: privateFeedback.address,
        },
        {
          Feedback: [
            { name: "user", type: "address" },
            { name: "serviceId", type: "uint256" },
            { name: "timestamp", type: "uint256" },
            { name: "feedback_p1", type: "uint256" },
            { name: "feedback_p2", type: "uint256" },
          ],
        },
        {
          user: user1.address,
          serviceId: serviceId,
          timestamp: timestamp,
          feedback_p1: 9876,
          feedback_p2: 5432,
        }
      );
      const {
        v: fv,
        r: fr,
        s: fs,
      } = ethers.utils.splitSignature(feedbackSignature);
      await privateFeedback
        .connect(user1)
        .submitFeedback(serviceId, fv, fr, fs, timestamp, 9876, 5432);
      await expect(
        privateFeedback
          .connect(owner)
          .rewardUsersForFeedback(serviceId, rewardAmount, {
            value: ethers.utils.parseEther("0.05"), // Providing less than the specified reward amount
          })
      ).to.be.revertedWith("Insufficient funds");
    });
  });
});
