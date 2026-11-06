// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/TreasuryVault.sol";

/// @title DeployTreasuryVault — Deploy TreasuryVault to Arc
/// @dev Set CRE_FORWARDER env var to the Chainlink CRE KeystoneForwarder address
contract DeployTreasuryVault is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address creForwarder = vm.envAddress("CRE_FORWARDER");

        vm.startBroadcast(deployerPrivateKey);

        TreasuryVault vault = new TreasuryVault(creForwarder);

        vm.stopBroadcast();

        console.log("TreasuryVault deployed at:", address(vault));
        console.log("CRE Forwarder:", creForwarder);
        console.log("Owner (deployer):", vault.owner());
    }
}
