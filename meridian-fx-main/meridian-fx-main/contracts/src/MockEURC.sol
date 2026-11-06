// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockEURC — Test ERC-20 standing in for EURC (6 decimals)
/// @dev Public mint + faucet for hackathon/demo use only
contract MockEURC is ERC20 {
    uint8 private constant _DECIMALS = 6;
    uint256 public constant FAUCET_AMOUNT = 500_000 * 10 ** _DECIMALS; // 500K EURC

    constructor() ERC20("Euro Coin", "EURC") {}

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    /// @notice Anyone can mint arbitrary amounts (test only)
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Convenience: mint 500K to caller
    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}
