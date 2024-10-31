require("@nomicfoundation/hardhat-toolbox");
require('@oasisprotocol/sapphire-hardhat');

// The next line is part of the sample project, you don't need it in your
// project. It imports a Hardhat task definition, that can be used for
// testing the frontend.
require("./tasks/faucet");

require('dotenv').config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.17",
  networks: {
    'sapphire-testnet': {
      // This is Testnet! If you want Mainnet, add a new network config item.
      url: "https://testnet.sapphire.oasis.io",
      accounts: process.env.PRIVATE_KEY
        ? [process.env.PRIVATE_KEY]
        : [],
      chainId: 0x5aff,
    },
    'sapphire-localnet': {
      // This is Testnet! If you want Mainnet, add a new network config item.
      url: "http://localhost:8545",
      accounts: process.env.LOCALNET_PRIVATE_KEY
        ? [process.env.LOCALNET_PRIVATE_KEY]
        : [],
      chainId: 0x5aff,
    },
  },
};
