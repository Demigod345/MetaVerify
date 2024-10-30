const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VerifyInteraction Contract with Multiple Users", function () {
    let verifyInteraction, owner, user1, user2, user3, serviceId, user1Signature, user2Signature;

    before(async function () {
        // Deploy the contract
        const VerifyInteraction = await ethers.getContractFactory("VerifyInteraction");
        verifyInteraction = await VerifyInteraction.deploy();
        await verifyInteraction.deployed();

        // Get signers
        [owner, user1, user2, user3] = await ethers.getSigners();
    });

    describe("Service Registration", function () {
        it("Should register a service by owner", async function () {
            const tx = await verifyInteraction.connect(owner).registerService("Service Metadata");
            const receipt = await tx.wait();

            // Check event
            const event = receipt.events.find((e) => e.event === "ServiceRegistered");
            serviceId = event.args.serviceId;
            expect(event.args.owner).to.equal(owner.address);
        });
    });

    describe("Interaction Registration", function () {
        it("Should allow user1 and user2 to register interaction with valid signatures", async function () {
            const registerInteraction = async (user, serviceId) => {
                const messageHash = ethers.utils.solidityKeccak256(
                    ["address", "uint256", "string"],
                    [user.address, serviceId, "Record Interaction"]
                );

                const signature = await user.signMessage(ethers.utils.arrayify(messageHash));
                return { messageHash, signature };
            };

            // Register interaction for user1
            const { signature: sig1 } = await registerInteraction(user1, serviceId);
            user1Signature = sig1;
            await expect(
                verifyInteraction.connect(owner).registerInteraction(user1.address, serviceId, sig1)
            ).to.not.be.reverted;

            // Register interaction for user2
            const { signature: sig2 } = await registerInteraction(user2, serviceId);
            user2Signature = sig2;
            await expect(
                verifyInteraction.connect(owner).registerInteraction(user2.address, serviceId, sig2)
            ).to.not.be.reverted;

            const totalInteractions = await verifyInteraction.getTotalInteractions(serviceId);
            expect(totalInteractions).to.equal(2);
        });

        it("Should reject interaction registration with an invalid signature", async function () {
            const fakeSignature = "0x" + "0".repeat(130);
            await expect(
                verifyInteraction.connect(owner).registerInteraction(user1.address, serviceId, fakeSignature)
            ).to.be.revertedWith("Invalid signature");
        });
    });

    describe("Feedback Submission by Multiple Users", function () {
        it("Should verify feedback filling signatures for multiple users", async function () {
            const verifyFeedbackFilling = async (user, serviceId) => {
                const feedbackMessageHash = ethers.utils.solidityKeccak256(
                    ["address", "uint256", "string"],
                    [user.address, serviceId, "Feedback Filling"]
                );
                const feedbackSignature = await user.signMessage(ethers.utils.arrayify(feedbackMessageHash));
                return feedbackSignature;
            };

            // Verify for user1
            const user1FeedbackSignature = await verifyFeedbackFilling(user1, serviceId);
            const verified1 = await verifyInteraction.verifyFeedbackFilling(user1.address, serviceId, user1FeedbackSignature);
            expect(verified1).to.be.true;

            // Verify for user2
            const user2FeedbackSignature = await verifyFeedbackFilling(user2, serviceId);
            const verified2 = await verifyInteraction.verifyFeedbackFilling(user2.address, serviceId, user2FeedbackSignature);
            expect(verified2).to.be.true;
        });

        it("Should allow multiple users to submit feedback", async function () {
            // Submit feedback for user1
            const user1FeedbackMessageHash = ethers.utils.solidityKeccak256(
                ["address", "uint256", "string"],
                [user1.address, serviceId, "Feedback Filling"]
            );
            const user1FeedbackSignature = await user1.signMessage(ethers.utils.arrayify(user1FeedbackMessageHash));
            await verifyInteraction.connect(owner).submitFeedback(user1.address, serviceId, user1FeedbackSignature, "User1 Feedback");

            // Submit feedback for user2
            const user2FeedbackMessageHash = ethers.utils.solidityKeccak256(
                ["address", "uint256", "string"],
                [user2.address, serviceId, "Feedback Filling"]
            );
            const user2FeedbackSignature = await user2.signMessage(ethers.utils.arrayify(user2FeedbackMessageHash));
            await verifyInteraction.connect(owner).submitFeedback(user2.address, serviceId, user2FeedbackSignature, "User2 Feedback");

            const totalFeedbacks = await verifyInteraction.getTotalFeedbacks(serviceId);
            expect(totalFeedbacks).to.equal(2);
        });
    });

    describe("Reward Distribution to Multiple Feedback Submitters", function () {
        it("Should distribute rewards to multiple feedback submitters", async function () {
            const rewardAmount = ethers.utils.parseEther("0.5"); // Reward amount per user

            await expect(
                verifyInteraction.connect(owner).rewardUsersForFeedback(serviceId, rewardAmount, {
                    value: rewardAmount.mul(2), // Enough ETH for two users
                })
            ).to.changeEtherBalances([user1, user2], [rewardAmount, rewardAmount]);
        });
    });

    describe("Getter Functions for Multiple Feedbacks and Interactions", function () {
        it("Should return correct total interactions for a service", async function () {
            const totalInteractions = await verifyInteraction.getTotalInteractions(serviceId);
            expect(totalInteractions).to.equal(2);
        });

        it("Should return correct total feedbacks for a service", async function () {
            const totalFeedbacks = await verifyInteraction.getTotalFeedbacks(serviceId);
            expect(totalFeedbacks).to.equal(2);
        });

        it("Should retrieve all feedbacks for a service", async function () {
            const feedbacks = await verifyInteraction.getFeedbackByService(serviceId);
            expect(feedbacks.length).to.equal(2);
            expect(feedbacks[0]).to.equal("User1 Feedback");
            expect(feedbacks[1]).to.equal("User2 Feedback");
        });
    });
});
