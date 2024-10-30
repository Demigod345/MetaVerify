// const { expect } = require("chai")
// const { ethers } = require("hardhat")

// describe("VerifySignature", function () {
//   it("Check signature", async function () {
//     const accounts = await ethers.getSigners(2)

//     const VerifySignature = await ethers.getContractFactory("VerifySignature")
//     const contract = await VerifySignature.deploy()
//     await contract.deployed()

//     // const PRIV_KEY = "0x..."
//     // const signer = new ethers.Wallet(PRIV_KEY)
//     const signer = accounts[0]
//     const message = "Hello"
//     const nonce = 123

//     // const hash = await contract.getMessageHash(message, nonce)
//     const hash = ethers.utils.solidityKeccak256(
//       ["uint256", "string"],
//       [message, nonce]
//     );
//     const sig = await signer.signMessage(ethers.utils.arrayify(hash))

//     const ethHash = await contract.getEthSignedMessageHash(hash)

//     console.log("eth hash         ", ethHash)
//     console.log("message hash     ", hash)
//     console.log("signature        ", sig)
//     console.log("signer          ", signer.address)
//     console.log("recovered signer", await contract.recoverSigner(ethHash, sig))

//     // Correct signature and message returns true
//     expect(
//       await contract.verify(signer.address, message, nonce, sig)
//     ).to.equal(true)

//     // Incorrect message returns false
//     expect(
//       await contract.verify(signer.address, message, nonce+1, sig)
//     ).to.equal(false)
//   })
// })