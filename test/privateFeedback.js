const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PrivateFeedback Contract", function () {
    let PrivateFeedback;
    let privateFeedback;
    let owner;
    let user1;
    let user2;
    let serviceId;
    let interactionId;

    before(async function () {
        [owner, user1, user2] = await ethers.getSigners();
        PrivateFeedback = await ethers.getContractFactory("PrivateFeedback");
        privateFeedback = await PrivateFeedback.deploy();
        await privateFeedback.deployed();
    });

    describe("Service Registration", function () {
        it("should register a new service", async function () {
            const tx = await privateFeedback.connect(owner).registerService(12345, 67890);
            const receipt = await tx.wait();
            serviceId = receipt.events[0].args.serviceId;

            const [metadata_p1, metadata_p2] = await privateFeedback.getServiceMetadata(serviceId);
            expect(metadata_p1).to.equal(12345);
            expect(metadata_p2).to.equal(67890);
        });

        it("should emit ServiceRegistered event", async function () {
            await expect(privateFeedback.connect(owner).registerService(12345, 67890))
                .to.emit(privateFeedback, "ServiceRegistered")
                .withArgs(owner.address, serviceId.add(1));
        });
    });

    describe("Interaction Registration", function () {
        before(async function () {
            interactionId = ethers.utils.keccak256(
                ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [user1.address, serviceId])
            );
        });

        it("should register an interaction with valid signature using signTypedData", async function () {
            const interaction = {
                user: user1.address,
                serviceId: serviceId,
                state: 1 // RECORDED
            };

            const domain = {
                name: "PrivateFeedback",
                version: "1",
                chainId: await user1.getChainId(),
                verifyingContract: privateFeedback.address
            };

            const types = {
                Interaction: [
                    { name: "user", type: "address" },
                    { name: "serviceId", type: "uint256" },
                    { name: "state", type: "uint8" }
                ]
            };

            const signature = await user1._signTypedData(domain, types, interaction);
            const { v, r, s } = ethers.utils.splitSignature(signature);

            await privateFeedback.connect(user1).registerInteraction(serviceId, v, r, s);

            // Verify interaction via public functions
            const totalInteractions = await privateFeedback.getTotalInteractions(serviceId);
            expect(totalInteractions).to.equal(1);
        });

        it("should revert if the interaction is already registered", async function () {
            const interaction = {
                user: user1.address,
                serviceId: serviceId,
                state: 1 // RECORDED
            };

            const domain = {
                name: "PrivateFeedback",
                version: "1",
                chainId: await user1.getChainId(),
                verifyingContract: privateFeedback.address
            };

            const types = {
                Interaction: [
                    { name: "user", type: "address" },
                    { name: "serviceId", type: "uint256" },
                    { name: "state", type: "uint8" }
                ]
            };

            const signature = await user1._signTypedData(domain, types, interaction);
            const { v, r, s } = ethers.utils.splitSignature(signature);

            await expect(
                privateFeedback.connect(user1).registerInteraction(serviceId, v, r, s)
            ).to.be.revertedWith("Interaction already registered");
        });
    });

    describe("Feedback Verification and Submission", function () {
        it("should verify feedback eligibility with valid signature", async function () {
            const feedbackInteraction = {
                user: user1.address,
                serviceId: serviceId,
                state: 2 // FEEDBACK_GIVEN
            };

            const domain = {
                name: "PrivateFeedback",
                version: "1",
                chainId: await user1.getChainId(),
                verifyingContract: privateFeedback.address
            };

            const types = {
                Interaction: [
                    { name: "user", type: "address" },
                    { name: "serviceId", type: "uint256" },
                    { name: "state", type: "uint8" }
                ]
            };

            const signature = await user1._signTypedData(domain, types, feedbackInteraction);
            const { v, r, s } = ethers.utils.splitSignature(signature);

            const verified = await privateFeedback.verifyFeedbackFilling(user1.address, serviceId, v, r, s);
            expect(verified).to.equal(true);
        });

        it("should submit feedback for an interaction", async function () {
            const feedbackInteraction = {
                user: user1.address,
                serviceId: serviceId,
                state: 2 // FEEDBACK_GIVEN
            };

            const domain = {
                name: "PrivateFeedback",
                version: "1",
                chainId: await user1.getChainId(),
                verifyingContract: privateFeedback.address
            };

            const types = {
                Interaction: [
                    { name: "user", type: "address" },
                    { name: "serviceId", type: "uint256" },
                    { name: "state", type: "uint8" }
                ]
            };

            const signature = await user1._signTypedData(domain, types, feedbackInteraction);
            const { v, r, s } = ethers.utils.splitSignature(signature);

            await privateFeedback.connect(user1).submitFeedback(serviceId, v, r, s, 100, 200);

            // Verify feedback via public functions
            const totalFeedbacks = await privateFeedback.getTotalFeedbacks(serviceId);
            expect(totalFeedbacks).to.equal(1);

            const feedback = await privateFeedback.getFeedback(serviceId);
            expect(feedback[0]).to.equal(100);
            expect(feedback[1]).to.equal(200);
        });
    });

    describe("Interaction and Feedback Retrieval", function () {
        it("should retrieve total interactions for a service", async function () {
            const totalInteractions = await privateFeedback.getTotalInteractions(serviceId);
            expect(totalInteractions).to.equal(1);
        });

        it("should retrieve total feedbacks for a service", async function () {
            const totalFeedbacks = await privateFeedback.getTotalFeedbacks(serviceId);
            expect(totalFeedbacks).to.equal(1);
        });

        it("should retrieve feedback data for a service", async function () {
            const feedbacks = await privateFeedback.getFeedback(serviceId);
            expect(feedbacks[0]).to.equal(100);
            expect(feedbacks[1]).to.equal(200);
        });
    });

    describe("Reward Users for Feedback", function () {
        it("should reward users for feedback", async function () {
            const rewardAmount = ethers.utils.parseEther("0.1");
            await expect(
                privateFeedback.connect(owner).rewardUsersForFeedback(serviceId, rewardAmount, { value: rewardAmount })
            ).to.changeEtherBalances([user1], [rewardAmount]);
        });

        it("should revert if insufficient funds are provided", async function () {
            const rewardAmount = ethers.utils.parseEther("1"); // Deliberately high to trigger revert
            await expect(
                privateFeedback.connect(owner).rewardUsersForFeedback(serviceId, rewardAmount, { value: ethers.utils.parseEther("0.1") })
            ).to.be.revertedWith("Insufficient funds");
        });
    });
});
