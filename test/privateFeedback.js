const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PrivateFeedback Contract", function () {
    let privateFeedback, owner, user1, user2;
    
    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();
        const PrivateFeedback = await ethers.getContractFactory("PrivateFeedback");
        privateFeedback = await PrivateFeedback.deploy();
        await privateFeedback.deployed();
    });

    async function getMessageHash(address, serviceId, action) {
        return await ethers.utils.solidityKeccak256(["address", "uint256", "string"], [address, serviceId, action]);
    }

    it("Should register a new service", async function () {
        const metadata_p1 = ethers.utils.parseUnits("12345", "wei");
        const metadata_p2 = ethers.utils.parseUnits("67890", "wei");

        const tx = await privateFeedback.connect(owner).registerService(metadata_p1, metadata_p2);
        const receipt = await tx.wait();

        expect(receipt.events[0].args.owner).to.equal(owner.address);
        expect(receipt.events[0].args.serviceId).to.equal(1);
    });

    it("Should record an interaction", async function () {
        const metadata_p1 = 12345;
        const metadata_p2 = 67890;
        await privateFeedback.connect(owner).registerService(metadata_p1, metadata_p2);

        // Create a message and sign it
        const messageHash = await getMessageHash(user1.address, 1, "Record Interaction");
        const signature = await user1.signMessage(ethers.utils.arrayify(messageHash));
        const { v, r, s } = ethers.utils.splitSignature(signature);

        await expect(privateFeedback.connect(user1).registerInteraction(1, v, r, s))
            .to.not.be.reverted;
    });

    it("Should allow verified feedback filling", async function () {
        await privateFeedback.connect(owner).registerService(12345, 67890);

        // Register interaction
        const messageHash = await getMessageHash(user1.address, 1, "Record Interaction");
        const signature = await user1.signMessage(ethers.utils.arrayify(messageHash));
        const { v, r, s } = ethers.utils.splitSignature(signature);
        await privateFeedback.connect(user1).registerInteraction(1, v, r, s);

        // Verify feedback filling
        const feedbackMessageHash = await getMessageHash(user1.address, 1, "Feedback Filling");
        const feedbackSignature = await user1.signMessage(ethers.utils.arrayify(feedbackMessageHash));
        const isVerified = await privateFeedback.verifyFeedbackFilling(user1.address, 1, feedbackSignature);

        expect(isVerified).to.equal(true);
    });

    it("Should submit feedback after verification", async function () {
        await privateFeedback.connect(owner).registerService(12345, 67890);

        // Register interaction
        const messageHash = await getMessageHash(user1.address, 1, "Record Interaction");
        const signature = await user1.signMessage(ethers.utils.arrayify(messageHash));
        const { v, r, s } = ethers.utils.splitSignature(signature);
        await privateFeedback.connect(user1).registerInteraction(1, v, r, s);

        // Verify and submit feedback
        const feedbackMessageHash = await getMessageHash(user1.address, 1, "Feedback Filling");
        const feedbackSignature = await user1.signMessage(ethers.utils.arrayify(feedbackMessageHash));
        await privateFeedback.connect(owner).submitFeedback(user1.address, 1, feedbackSignature, 1122, 3344);

        const feedback = await privateFeedback.getFeedback(1);
        expect(feedback[0]).to.equal(1122);
        expect(feedback[1]).to.equal(3344);
    });

    it("Should reward users with feedback", async function () {
        await privateFeedback.connect(owner).registerService(12345, 67890);

        // Register interaction and feedback
        const messageHash = await getMessageHash(user1.address, 1, "Record Interaction");
        const signature = await user1.signMessage(ethers.utils.arrayify(messageHash));
        const { v, r, s } = ethers.utils.splitSignature(signature);
        await privateFeedback.connect(user1).registerInteraction(1, v, r, s);

        const feedbackMessageHash = await getMessageHash(user1.address, 1, "Feedback Filling");
        const feedbackSignature = await user1.signMessage(ethers.utils.arrayify(feedbackMessageHash));
        await privateFeedback.connect(owner).submitFeedback(user1.address, 1, feedbackSignature, 1122, 3344);

        const rewardAmount = ethers.utils.parseEther("0.01");
        const initialBalance = await user1.getBalance();

        await privateFeedback.connect(owner).rewardUsersForFeedback(1, rewardAmount, { value: rewardAmount });
        const finalBalance = await user1.getBalance();

        expect(finalBalance.sub(initialBalance)).to.equal(rewardAmount);
    });
});
