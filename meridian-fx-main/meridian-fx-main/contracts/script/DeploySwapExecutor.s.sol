// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/SwapExecutor.sol";

/// @title DeploySwapExecutor — Deploy SwapExecutor to Base mainnet
/// @dev Requires env vars: PRIVATE_KEY, CRE_FORWARDER, UNISWAP_ROUTER, USDC_ADDRESS, EURC_ADDRESS
contract DeploySwapExecutor is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address creForwarder = vm.envAddress("CRE_FORWARDER");
        address uniswapRouter = vm.envAddress("UNISWAP_ROUTER");
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        address eurcAddress = vm.envAddress("EURC_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        SwapExecutor executor = new SwapExecutor(
            creForwarder,
            uniswapRouter,
            usdcAddress,
            eurcAddress
        );

        vm.stopBroadcast();

        console.log("SwapExecutor deployed at:", address(executor));
        console.log("CRE Forwarder:", creForwarder);
        console.log("Uniswap Router:", uniswapRouter);
        console.log("USDC:", usdcAddress);
        console.log("EURC:", eurcAddress);
    }
}
