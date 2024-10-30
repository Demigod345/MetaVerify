// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VerifyInteraction {
    struct Service {
        uint256 serviceId;
        string metadata;
    }

    struct Feedback {
        address user;
        string content;
    }

    enum InteractionState {
        UNINITIALISED,
        RECORDED,
        FEEDBACK_GIVEN
    }

    struct InteractionData {
        InteractionState state;
        bytes32 ethSignedHash;
        bytes signature;
    }

    mapping(address => Service[]) public ownerToServices;
    mapping(uint256 => address) public serviceIdToOwner;
    mapping(uint256 => Feedback[]) private serviceToFeedback;  // Feedback data combined in one mapping
    mapping(bytes32 => InteractionData) private interactionData;
    mapping(uint256 => uint256) private serviceToTotalInteractions;

    event ServiceRegistered(address indexed owner, uint256 serviceId);

    uint256 private serviceIdCounter = 1;

    function registerService(string memory _metadata) public returns (uint256) {
        uint256 currentServiceId = serviceIdCounter++;
        serviceIdToOwner[currentServiceId] = msg.sender;
        ownerToServices[msg.sender].push(Service(currentServiceId, _metadata));
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
        require(interactionData[interactionId].state == InteractionState.UNINITIALISED, "Invalid state");

        interactionData[interactionId] = InteractionData(
            InteractionState.RECORDED,
            getEthSignedMessageHash(getMessageHash(_user, _serviceId, "Record Interaction")),
            _signature
        );

        serviceToTotalInteractions[_serviceId]++;
    }

    function verifyFeedbackFilling(
        address _user,
        uint256 _serviceId,
        bytes memory _feedbackFillingSignature
    ) public view returns (bool) {
        require(verify(_user, _serviceId, "Feedback Filling", _feedbackFillingSignature), "Feedback filling signature not verified");

        bytes32 interactionId = keccak256(abi.encodePacked(_user, _serviceId));
        require(interactionData[interactionId].state == InteractionState.RECORDED, "Invalid state");

        return (recoverSigner(interactionData[interactionId].ethSignedHash, interactionData[interactionId].signature) == _user);
    }

    function submitFeedback(
        address _user,
        uint256 _serviceId,
        bytes memory _feedbackFillingSignature,
        string memory _feedback
    ) public {
        require(verifyFeedbackFilling(_user, _serviceId, _feedbackFillingSignature), "User signature not verified");

        bytes32 interactionId = keccak256(abi.encodePacked(_user, _serviceId));
        interactionData[interactionId].state = InteractionState.FEEDBACK_GIVEN;
        serviceToFeedback[_serviceId].push(Feedback(_user, _feedback));
    }

    // Get total interactions for a service
    function getTotalInteractions(uint256 _serviceId) public view returns (uint256) {
        return serviceToTotalInteractions[_serviceId];
    }

    // Get total feedbacks for a service
    function getTotalFeedbacks(uint256 _serviceId) public view returns (uint256) {
        return serviceToFeedback[_serviceId].length;
    }

    // Reward users who have submitted feedback for a specific service
    function rewardUsersForFeedback(uint256 _serviceId, uint256 _rewardAmount) public payable {
        require(msg.value >= _rewardAmount * serviceToFeedback[_serviceId].length, "Insufficient funds");

        for (uint256 i = 0; i < serviceToFeedback[_serviceId].length; i++) {
            address user = serviceToFeedback[_serviceId][i].user;
            payable(user).transfer(_rewardAmount);
        }
    }

    function getServicesByOwner(address _owner) public view returns (Service[] memory) {
        return ownerToServices[_owner];
    }

    function getFeedbackByService(uint256 _serviceId) public view returns (string[] memory) {
        uint totalFeedbacks = serviceToFeedback[_serviceId].length;

        string[] memory feedbacks = new string[](totalFeedbacks);
        for (uint256 i = 0; i < totalFeedbacks; i++) {
            feedbacks[i] = serviceToFeedback[_serviceId][i].content;
        }
        return feedbacks;
    }

    function getMessageHash(
        address _user,
        uint _serviceId,
        string memory _state
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_user, _serviceId, _state));
    }

    function verify(
        address _user,
        uint _serviceId,
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
