// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract PrivateFeedback {
    uint8 constant INTERACTION_STATE_UNINITIALIZED = 0;
    uint8 constant INTERACTION_STATE_RECORDED = 1;
    uint8 constant INTERACTION_STATE_FEEDBACK_SUBMITTED = 2;


    struct Service {
        uint256 metadata_p1;
        uint256 metadata_p2;
        address owner;
    }

    struct Interaction {
        uint8 state;
        address user;
    }

    mapping(uint256 => Service) private services;
    mapping(uint256 => bytes32[]) private serviceInteractions;
    mapping(bytes32 => Interaction) private interactions;
    mapping(bytes32 => uint256[2]) private feedback;

    uint256 private serviceIdCounter = 1;

    event ServiceRegistered(address indexed owner, uint256 serviceId);

    // EIP-712 domain separator
    bytes32 private constant DOMAIN_TYPEHASH = keccak256(abi.encodePacked("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));
    bytes32 private constant INTERACTION_TYPEHASH = keccak256(abi.encodePacked("Interaction(address user,uint256 serviceId,uint8 state)"));
    bytes32 private DOMAIN_SEPARATOR ;

    constructor() {
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            DOMAIN_TYPEHASH,
            keccak256(abi.encodePacked("PrivateFeedback")), // Contract Name
            keccak256(abi.encodePacked("1")),               // Version
            block.chainid,                // Chain ID
            address(this)                 // Verifying contract address
        ));
    }

    // Register a new service and assign an ID to it.
    function registerService(uint256 _metadata_p1, uint256 _metadata_p2) external returns (uint256) {
        uint256 currentServiceId = serviceIdCounter++;
        services[currentServiceId] = Service({
            metadata_p1: _metadata_p1,
            metadata_p2: _metadata_p2,
            owner: msg.sender
        });

        emit ServiceRegistered(msg.sender, currentServiceId);
        return currentServiceId;
    }

    function registerInteraction(
        uint256 _serviceId,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external {
        require(services[_serviceId].owner != address(0), "Service not registered");

        address user = msg.sender;
        bytes32 interactionId = _getInteractionId(user, _serviceId);

        require(interactions[interactionId].state == INTERACTION_STATE_UNINITIALIZED, "Interaction already registered");

        bytes32 interactionHash = _getInteractionHash(user, _serviceId, INTERACTION_STATE_RECORDED);
        require(_recoverSigner(interactionHash, _v, _r, _s) == user, "Invalid Signature");

        interactions[interactionId] = Interaction(1, user);
        serviceInteractions[_serviceId].push(interactionId);
    }

    // Verify that feedback filling can occur.
    function verifyFeedbackFilling(
        address _user,
        uint256 _serviceId,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) public view returns (bool) {
        bytes32 interactionId = _getInteractionId(_user, _serviceId);
        require(interactions[interactionId].state == INTERACTION_STATE_RECORDED, "Invalid state");
        require(interactions[interactionId].user == _user, "Invalid user");

        bytes32 messageHash = _getInteractionHash(_user, _serviceId, INTERACTION_STATE_FEEDBACK_SUBMITTED);

        return _recoverSigner(messageHash, _v, _r, _s) == _user;
    }

    // Submit feedback for a recorded interaction.
    function submitFeedback(
        uint256 _serviceId,
        uint8 _v,
        bytes32 _r,
        bytes32 _s,
        uint256 _feedback_p1,
        uint256 _feedback_p2
    ) external {
        address _user = msg.sender;
        require(verifyFeedbackFilling(_user, _serviceId, _v, _r, _s), "Invalid signature");

        bytes32 interactionId = _getInteractionId(_user, _serviceId);
        interactions[interactionId].state = INTERACTION_STATE_FEEDBACK_SUBMITTED;
        feedback[interactionId] = [_feedback_p1, _feedback_p2];
    }

    function getServiceIdsByOwner(address _owner) public view returns (uint[] memory) {
        uint256 count = 0;
        for (uint i = 0; i < serviceIdCounter; i++) {
            if (services[i].owner == _owner) {
                count++;
            }
        }
        uint[] memory serviceIds = new uint[](count);
        count = 0;
        for (uint i = 0; i < serviceIdCounter; i++) {
            if (services[i].owner == _owner) {
                serviceIds[count] = i;
                count++;
            }
        }
        return serviceIds;
    }

    // Get the total number of interactions for a service.
    function getTotalInteractions(uint256 _serviceId) external view returns (uint256) {
        return serviceInteractions[_serviceId].length;
    }

    // Get the total number of feedbacks provided for a service.
    function getTotalFeedbacks(uint256 _serviceId) public view returns (uint256) {
        uint256 totalFeedbacks = 0;
        bytes32[] memory interactionsArray = serviceInteractions[_serviceId];
        for (uint256 i = 0; i < interactionsArray.length; i++) {
            if (interactions[interactionsArray[i]].state == INTERACTION_STATE_FEEDBACK_SUBMITTED) {
                totalFeedbacks++;
            }
        }
        return totalFeedbacks;
    }

    // Reward users who provided feedback.
    function rewardUsersForFeedback(uint256 _serviceId, uint256 _rewardAmount) external payable {
        uint256 totalFeedbacks = getTotalFeedbacks(_serviceId);
        require(msg.value >= _rewardAmount * totalFeedbacks, "Insufficient funds");

        bytes32[] memory interactionsArray = serviceInteractions[_serviceId];
        uint256 paid = 0;

        for (uint256 i = 0; i < interactionsArray.length; i++) {
            if (interactions[interactionsArray[i]].state == INTERACTION_STATE_FEEDBACK_SUBMITTED) {
                address user = interactions[interactionsArray[i]].user;
                payable(user).transfer(_rewardAmount);
                paid++;
            }
        }
        require(paid == totalFeedbacks, "Partial payment issue");
    }

    // Retrieve metadata for a specific service.
    function getServiceMetadata(uint256 _serviceId) external view returns (uint256, uint256) {
        Service memory service = services[_serviceId];
        return (service.metadata_p1, service.metadata_p2);
    }

    // Retrieve feedback data for a specific service.
    function getAllFeedbacks(uint256 _serviceId) external view returns (uint256[] memory) {
        uint256 totalFeedbacks = getTotalFeedbacks(_serviceId);
        uint256[] memory feedbacks = new uint256[](2 * totalFeedbacks);
        uint256 count = 0;

        bytes32[] memory interactionsArray = serviceInteractions[_serviceId];
        for (uint256 i = 0; i < interactionsArray.length; i++) {
            if (interactions[interactionsArray[i]].state == INTERACTION_STATE_FEEDBACK_SUBMITTED) {
                feedbacks[count++] = feedback[interactionsArray[i]][0];
                feedbacks[count++] = feedback[interactionsArray[i]][1];
            }
        }

        return feedbacks;
    }

    // Utility functions
    function _getInteractionHash(
        address _user,
        uint256 _serviceId,
        uint8 _state
    ) private view returns (bytes32) {
        return keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(
                INTERACTION_TYPEHASH,
                _user,
                _serviceId,
                _state
            ))
        ));
    }

    function _getInteractionId(address _user, uint256 _serviceId) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(_user, _serviceId));
    }

    function _recoverSigner(bytes32 _ethSignedMessageHash, uint8 _v, bytes32 _r, bytes32 _s)
        private
        pure
        returns (address)
    {
        return ecrecover(_ethSignedMessageHash, _v, _r, _s);
    }

    function _splitSignature(bytes memory sig)
        private
        pure
        returns (
            bytes32 r,
            bytes32 s,
            uint8 v
        )
    {
        require(sig.length == 65, "Invalid signature length");
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }
}
