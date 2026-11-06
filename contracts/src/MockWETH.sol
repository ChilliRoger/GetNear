// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockWETH — Test ERC-20 standing in for WETH (18 decimals)
/// @dev Public mint + faucet for hackathon/demo use only
contract MockWETH is ERC20 {
    uint8 private constant _DECIMALS = 18;
    uint256 public constant FAUCET_AMOUNT = 10 * 10 ** _DECIMALS; // 10 WETH

    constructor() ERC20("Mock WETH", "mWETH") {}

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    /// @notice Anyone can mint arbitrary amounts (test only)
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Convenience: mint 10 WETH to caller
    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}
