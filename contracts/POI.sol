// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VerifyInteraction {
    struct Service {
        uint256 serviceId;
        string metadata;
    }

    enum InteractionState {
        UNINITIALISED,
        RECORDED,
        FEEDBACK_GIVEN
    }

    struct Signature {
        bytes32 ethSignedHash;
        bytes sign;
    }

    mapping(address => Service[]) public ownerToServices;
    mapping(uint256 => address) public serviceIdToOwner;
    mapping(uint256 => string[]) private serviceToFeedback;
    mapping(bytes32 => InteractionState) private interactionToState;
    mapping(bytes32 => Signature) private interactionToSignature;

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
        require(interactionToState[interactionId] == InteractionState.UNINITIALISED, "Invalid state");

        interactionToState[interactionId] = InteractionState.RECORDED;
        interactionToSignature[interactionId] = Signature(
            getEthSignedMessageHash(getMessageHash(_user, _serviceId, "Record Interaction")),
            _signature
        );
    }

    function verifyFeedbackFilling(
        address _user,
        uint256 _serviceId,
        bytes memory _feedbackFillingSignature
    ) public view returns (bool) {
        require(verify(_user, _serviceId, "Feedback Filling", _feedbackFillingSignature), "Feedback filling signature not verified");

        bytes32 interactionId = keccak256(abi.encodePacked(_user, _serviceId));
        require(interactionToState[interactionId] == InteractionState.RECORDED, "Invalid state");

        Signature memory prevSign = interactionToSignature[interactionId];
        address prevUser = recoverSigner(prevSign.ethSignedHash, prevSign.sign);
        return (_user == prevUser);
    }

    function submitFeedback(
        address _user,
        uint256 _serviceId,
        bytes memory _feedbackFillingSignature,
        string memory _feedback
    ) public {
        require(verifyFeedbackFilling(_user, _serviceId, _feedbackFillingSignature), "User signature not verified");

        bytes32 interactionId = keccak256(abi.encodePacked(_user, _serviceId));
        interactionToState[interactionId] = InteractionState.FEEDBACK_GIVEN;
        serviceToFeedback[_serviceId].push(_feedback);
    }

    function getServicesByOwner(address _owner) public view returns (Service[] memory) {
        return ownerToServices[_owner];
    }

    function getFeedbackByService(uint256 _serviceId) public view returns (string[] memory) {
        return serviceToFeedback[_serviceId];
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
