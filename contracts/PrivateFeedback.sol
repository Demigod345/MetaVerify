// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract PrivateFeedback {
    uint256 private serviceIdCounter = 1;

    struct Service {
        uint256 metadata_p1;
        uint256 metadata_p2;
        address owner;
    }

    mapping(uint256 => Service) private services;
    mapping(uint256 => bytes32[]) private serviceInteractions;
    mapping(bytes32 => address) private interactionsToUsers;
    mapping(bytes32 => uint256[2]) private feedback;

    event ServiceRegistered(address indexed owner, uint256 serviceId);

    // EIP-712 domain separator
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256(
            abi.encodePacked(
                "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
            )
        );
    bytes32 private constant INTERACTION_TYPEHASH =
        keccak256(
            abi.encodePacked(
                "Interaction(address user,uint256 serviceId,uint256 timestamp)"
            )
        );
    bytes32 private constant FEEDBACK_TYPEHASH =
        keccak256(
            abi.encodePacked(
                "Feedback(address user,uint256 serviceId,uint256 timestamp,uint256 feedback_p1,uint256 feedback_p2)"
            )
        );
    bytes32 private DOMAIN_SEPARATOR;

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(abi.encodePacked("PrivateFeedback")), // Contract Name
                keccak256(abi.encodePacked("1")), // Version
                block.chainid, // Chain ID
                address(this) // Verifying contract address
            )
        );
    }

    // Register a new service with metadata split into two uint256 values
    function registerService(
        uint256 _metadata_p1,
        uint256 _metadata_p2
    ) external returns (uint256) {
        uint256 currentServiceId = serviceIdCounter++;
        services[currentServiceId] = Service({
            metadata_p1: _metadata_p1,
            metadata_p2: _metadata_p2,
            owner: msg.sender
        });

        emit ServiceRegistered(msg.sender, currentServiceId);
        return currentServiceId;
    }

    // Register an interaction with EIP-712 typed data signature
    function registerInteraction(
        uint256 _serviceId,
        uint8 _v,
        bytes32 _r,
        bytes32 _s,
        uint256 _timestamp
    ) external {
        require(
            services[_serviceId].owner != address(0),
            "Service not registered"
        );

        address user = msg.sender;
        bytes32 interactionId = _getInteractionId(user, _serviceId);

        bytes32 structHash = keccak256(
            abi.encode(INTERACTION_TYPEHASH, user, _serviceId, _timestamp)
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );
        require(
            _recoverSigner(digest, _v, _r, _s) == user,
            "Invalid Signature"
        );

        interactionsToUsers[interactionId] = user;
        serviceInteractions[_serviceId].push(interactionId);
    }

    // Submit feedback with EIP-712 typed data signature, including feedback metadata
    function submitFeedback(
        uint256 _serviceId,
        uint8 _v,
        bytes32 _r,
        bytes32 _s,
        uint256 _timestamp,
        uint256 _feedback_p1,
        uint256 _feedback_p2
    ) external {
        address user = msg.sender;
        bytes32 interactionId = _getInteractionId(user, _serviceId);
        require(
            interactionsToUsers[interactionId] == user,
            "Invalid Interaction"
        );
        bytes32 feedbackHash = keccak256(
            abi.encode(
                FEEDBACK_TYPEHASH,
                user,
                _serviceId,
                _timestamp,
                _feedback_p1,
                _feedback_p2
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, feedbackHash)
        );
        require(
            _recoverSigner(digest, _v, _r, _s) == user,
            "Invalid Signature"
        );

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

    // Utility functions to manage interactions and feedback retrieval
    function getServiceMetadata(
        uint256 _serviceId
    ) external view returns (uint256, uint256) {
        Service memory service = services[_serviceId];
        return (service.metadata_p1, service.metadata_p2);
    }

    function getTotalInteractions(
        uint256 _serviceId
    ) external view returns (uint256) {
        return serviceInteractions[_serviceId].length;
    }

    function getTotalFeedbacks(
        uint256 _serviceId
    ) public view returns (uint256) {
        uint256 totalFeedbacks = 0;
        bytes32[] memory interactionsArray = serviceInteractions[_serviceId];

        for (uint256 i = 0; i < interactionsArray.length; i++) {
            if (
                feedback[interactionsArray[i]][0] != 0 ||
                feedback[interactionsArray[i]][1] != 0
            ) {
                totalFeedbacks++;
            }
        }

        return totalFeedbacks;
    }

    function getAllFeedbacks(
        uint256 _serviceId
    ) external view returns (uint256[] memory) {
        uint256 totalFeedbacks = getTotalFeedbacks(_serviceId);
        bytes32[] memory interactionsArray = serviceInteractions[_serviceId];

        uint256[] memory feedbacks = new uint256[](2 * totalFeedbacks);
        uint256 count = 0;

        for (uint256 i = 0; i < interactionsArray.length; i++) {
            if (
                feedback[interactionsArray[i]][0] != 0 ||
                feedback[interactionsArray[i]][1] != 0
            ) {
                feedbacks[count++] = feedback[interactionsArray[i]][0];
                feedbacks[count++] = feedback[interactionsArray[i]][1];
            }
        }

        return feedbacks;
    }

    // Internal utility functions
    function _getInteractionId(
        address _user,
        uint256 _serviceId
    ) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(_user, _serviceId));
    }

    function rewardUsersForFeedback(
        uint256 _serviceId,
        uint256 _rewardAmount
    ) external payable {
        require(
            services[_serviceId].owner == msg.sender,
            "Only service owner can distribute rewards"
        );
        uint256 totalFeedbacks = getTotalFeedbacks(_serviceId);
        require(
            msg.value >= _rewardAmount * totalFeedbacks,
            "Insufficient funds"
        );

        bytes32[] memory interactionsArray = serviceInteractions[_serviceId];
        for (uint256 i = 0; i < interactionsArray.length; i++) {
            if (
                feedback[interactionsArray[i]][0] != 0 ||
                feedback[interactionsArray[i]][1] != 0
            ) {
                address user = interactionsToUsers[interactionsArray[i]];
                payable(user).transfer(_rewardAmount);
            }
        }
    }

    function _recoverSigner(
        bytes32 _ethSignedMessageHash,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) private pure returns (address) {
        return ecrecover(_ethSignedMessageHash, _v, _r, _s);
    }
}
