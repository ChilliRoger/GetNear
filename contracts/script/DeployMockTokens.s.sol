// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MockUSDC.sol";
import "../src/MockEURC.sol";

/// @title DeployMockTokens — Deploy MockUSDC + MockEURC (Arc only, for demo display)
contract DeployMockTokens is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        MockUSDC usdc = new MockUSDC();
        MockEURC eurc = new MockEURC();

        // Mint initial supply to deployer for vault funding
        usdc.faucet();  // 500K USDC
        eurc.faucet();  // 500K EURC

        vm.stopBroadcast();

        console.log("MockUSDC deployed at:", address(usdc));
        console.log("MockEURC deployed at:", address(eurc));
    }
}
