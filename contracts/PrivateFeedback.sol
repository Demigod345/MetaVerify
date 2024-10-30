// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract PrivateFeedback {
    // Service details
    mapping(uint256 => string) private serviceMetadata;
    mapping(uint256 => address) public serviceIdToOwner;
    mapping(address => uint256[]) private ownerToServiceIds;

    // Interaction details
    mapping(bytes32 => uint8) private interactionState; // 0 = UNINITIALISED, 1 = RECORDED, 2 = FEEDBACK_GIVEN
    mapping(bytes32 => bytes32) private interactionEthSignedHash;
    mapping(bytes32 => bytes) private interactionSignature;
    mapping(bytes32 => string) private interactionToFeedback;

    mapping(uint256 => bytes32[]) private serviceToInteractions;

    event ServiceRegistered(address indexed owner, uint256 serviceId);

    uint256 private serviceIdCounter = 1;

    function registerService(string memory _metadata) public returns (uint256) {
        uint256 currentServiceId = serviceIdCounter++;
        serviceIdToOwner[currentServiceId] = msg.sender;
        serviceMetadata[currentServiceId] = _metadata;
        ownerToServiceIds[msg.sender].push(currentServiceId);
        emit ServiceRegistered(msg.sender, currentServiceId);
        return currentServiceId;
    }

    function registerInteraction(
        address _user,
        uint256 _serviceId,
        bytes memory _signature
    ) public {
        require(serviceIdToOwner[_serviceId] != address(0), "Service not registered");
        require(verify(_user, _serviceId, "Record Interaction", _signature), "Invalid signature");

        bytes32 interactionId = keccak256(abi.encodePacked(_user, _serviceId));
        require(interactionState[interactionId] == 0, "Invalid state");

        interactionState[interactionId] = 1;
        interactionEthSignedHash[interactionId] = getEthSignedMessageHash(getMessageHash(_user, _serviceId, "Record Interaction"));
        interactionSignature[interactionId] = _signature;
        serviceToInteractions[_serviceId].push(interactionId);
    }

    function verifyFeedbackFilling(
        address _user,
        uint256 _serviceId,
        bytes memory _feedbackFillingSignature
    ) public view returns (bool) {
        require(verify(_user, _serviceId, "Feedback Filling", _feedbackFillingSignature), "Feedback filling signature not verified");

        bytes32 interactionId = keccak256(abi.encodePacked(_user, _serviceId));
        require(interactionState[interactionId] == 1, "Invalid state");

        return (recoverSigner(interactionEthSignedHash[interactionId], interactionSignature[interactionId]) == _user);
    }

    function submitFeedback(
        address _user,
        uint256 _serviceId,
        bytes memory _feedbackFillingSignature,
        string memory _feedback
    ) public {
        require(verifyFeedbackFilling(_user, _serviceId, _feedbackFillingSignature), "User signature not verified");

        bytes32 interactionId = keccak256(abi.encodePacked(_user, _serviceId));
        interactionState[interactionId] = 2;
        interactionToFeedback[interactionId] = _feedback;
    }

    function getTotalInteractions(uint256 _serviceId) public view returns (uint256) {
        return serviceToInteractions[_serviceId].length;
    }

    function getTotalFeedbacks(uint256 _serviceId) public view returns (uint256) {
        uint256 totalFeedbacks = 0;
        for (uint256 i = 0; i < serviceToInteractions[_serviceId].length; i++) {
            uint8 state = interactionState[serviceToInteractions[_serviceId][i]];
            if(state == 2) {
                totalFeedbacks++;
            }
        }
        return totalFeedbacks;
    }

    function rewardUsersForFeedback(uint256 _serviceId, uint256 _rewardAmount) public payable {
        uint totalFeedbacks = getTotalFeedbacks(_serviceId);
        require(msg.value >= _rewardAmount * totalFeedbacks, "Insufficient funds");

        address[] memory users = new address[](totalFeedbacks);
        uint256 count = 0;
        for (uint256 i = 0; i < serviceToInteractions[_serviceId].length; i++) {
            uint8 state = interactionState[serviceToInteractions[_serviceId][i]];
            if(state == 2) {
                users[count] = recoverSigner(interactionEthSignedHash[serviceToInteractions[_serviceId][i]], interactionSignature[serviceToInteractions[_serviceId][i]]);
                count++;
            }
        }

        for (uint256 i = 0; i < users.length; i++) {
            address user = users[i];
            payable(user).transfer(_rewardAmount);
        }
    }

    function getServiceIdsByOwner(address _owner) public view returns (uint256[] memory) {
        return ownerToServiceIds[_owner];
    }

    function getServiceMetadataByServiceId(uint256 _serviceId) public view returns (string memory) {
        return serviceMetadata[_serviceId];
    }

    function getFeedbackByService(uint256 _serviceId) public view returns (string[] memory) {
        uint256 totalFeedbacks = getTotalFeedbacks(_serviceId);
        string[] memory feedbacks = new string[](totalFeedbacks);
        uint256 count = 0;
        for (uint256 i = 0; i < serviceToInteractions[_serviceId].length; i++) {
            uint8 state = interactionState[serviceToInteractions[_serviceId][i]];
            if(state == 2) {
                feedbacks[count] = interactionToFeedback[serviceToInteractions[_serviceId][i]];
                count++;
            }
        }

        return feedbacks;
    }

    function getMessageHash(
        address _user,
        uint256 _serviceId,
        string memory _state
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_user, _serviceId, _state));
    }

    function verify(
        address _user,
        uint256 _serviceId,
        string memory _state,
        bytes memory _signature
    ) public pure returns (bool) {
        bytes32 messageHash = getMessageHash(_user, _serviceId, _state);
        bytes32 ethSignedMessageHash = getEthSignedMessageHash(messageHash);

        return recoverSigner(ethSignedMessageHash, _signature) == _user;
    }

    function getEthSignedMessageHash(bytes32 _messageHash)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _messageHash));
    }

    function recoverSigner(bytes32 _ethSignedMessageHash, bytes memory _signature)
        public
        pure
        returns (address)
    {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);
        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    function splitSignature(bytes memory sig)
        internal
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
