const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VerifyInteraction Contract", function () {
    let VerifyInteraction, verifyInteraction, owner, user1, user2;
    
    beforeEach(async () => {
        [owner, user1, user2] = await ethers.getSigners();
        VerifyInteraction = await ethers.getContractFactory("VerifyInteraction");
        verifyInteraction = await VerifyInteraction.deploy();
        await verifyInteraction.deployed();
    });

    it("should register a service successfully", async function () {
        const tx = await verifyInteraction.connect(owner).registerService("Service Metadata");
        const receipt = await tx.wait();
        const event = receipt.events.find(event => event.event === "ServiceRegistered");
        
        expect(event.args.owner).to.equal(owner.address);
        expect(event.args.serviceId).to.equal(1);
    });

    it("should register an interaction with a valid signature", async function () {
        const serviceId = await registerService(owner, "Test Service");

        const message = ethers.utils.solidityKeccak256(
            ["address", "uint256", "string"],
            [user1.address, serviceId, "Record Interaction"]
        );
        const signature = await signMessage(user1, message);
        
        await expect(
            verifyInteraction.connect(owner).registerInteraction(user1.address, serviceId, signature)
        ).to.not.be.reverted;

        const totalInteractions = await verifyInteraction.getTotalInteractions(serviceId);
        expect(totalInteractions).to.equal(1);
    });

    it("should fail to register interaction with an invalid signature", async function () {
        const serviceId = await registerService(owner, "Test Service");

        const fakeMessage = ethers.utils.solidityKeccak256(
            ["address", "uint256", "string"],
            [user2.address, serviceId, "Record Interaction"]
        );
        const fakeSignature = await signMessage(user1, fakeMessage);
        
        await expect(
            verifyInteraction.connect(owner).registerInteraction(user1.address, serviceId, fakeSignature)
        ).to.be.revertedWith("Invalid signature");
    });

    it("should submit feedback after a verified interaction", async function () {
        const serviceId = await registerService(owner, "Test Service");

        const interactionMessage = ethers.utils.solidityKeccak256(
            ["address", "uint256", "string"],
            [user1.address, serviceId, "Record Interaction"]
        );
        const interactionSignature = await signMessage(user1, interactionMessage);
        await verifyInteraction.connect(owner).registerInteraction(user1.address, serviceId, interactionSignature);

        const feedbackMessage = ethers.utils.solidityKeccak256(
            ["address", "uint256", "string"],
            [user1.address, serviceId, "Feedback Filling"]
        );
        const feedbackSignature = await signMessage(user1, feedbackMessage);

        await expect(
            verifyInteraction.connect(owner).submitFeedback(user1.address, serviceId, feedbackSignature, "Great service!")
        ).to.not.be.reverted;

        const feedbackCount = await verifyInteraction.getTotalFeedbacks(serviceId);
        expect(feedbackCount).to.equal(1);
    });

    it("should not allow feedback without verified interaction", async function () {
        const serviceId = await registerService(owner, "Test Service");

        const feedbackMessage = ethers.utils.solidityKeccak256(
            ["address", "uint256", "string"],
            [user1.address, serviceId, "Feedback Filling"]
        );
        const feedbackSignature = await signMessage(user1, feedbackMessage);

        await expect(
            verifyInteraction.connect(owner).submitFeedback(user1.address, serviceId, feedbackSignature, "Great service!")
        ).to.be.revertedWith("Invalid state");
    });

    it("should reward users who submitted feedback", async function () {
        const serviceId = await registerService(owner, "Reward Service");

        const interactionMessage = ethers.utils.solidityKeccak256(
            ["address", "uint256", "string"],
            [user1.address, serviceId, "Record Interaction"]
        );
        const interactionSignature = await signMessage(user1, interactionMessage);
        await verifyInteraction.connect(owner).registerInteraction(user1.address, serviceId, interactionSignature);

        const feedbackMessage = ethers.utils.solidityKeccak256(
            ["address", "uint256", "string"],
            [user1.address, serviceId, "Feedback Filling"]
        );
        const feedbackSignature = await signMessage(user1, feedbackMessage);
        await verifyInteraction.connect(owner).submitFeedback(user1.address, serviceId, feedbackSignature, "Useful feedback");

        const rewardAmount = ethers.utils.parseEther("0.1");

        await expect(
            await verifyInteraction.connect(owner).rewardUsersForFeedback(serviceId, rewardAmount, { value: rewardAmount })
        ).to.changeEtherBalance(user1, rewardAmount);
    });

    async function registerService(account, metadata) {
        const tx = await verifyInteraction.connect(account).registerService(metadata);
        const receipt = await tx.wait();
        const event = receipt.events.find(event => event.event === "ServiceRegistered");
        return event.args.serviceId;
    }

    async function signMessage(signer, messageHash) {
        const messageArray = ethers.utils.arrayify(messageHash);
        return await signer.signMessage(messageArray);
    }
});
