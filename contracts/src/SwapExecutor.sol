// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ISwapRouter — Minimal interface for Uniswap V3 SwapRouter02
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params)
        external payable returns (uint256 amountOut);
}

/// @title SwapExecutor — CRE consumer on Base, calls Uniswap V3 SwapRouter02
/// @dev Executes real USDC/EURC swaps on Base mainnet via exactInputSingle
contract SwapExecutor {
    using SafeERC20 for IERC20;

    address public owner;
    address public creForwarder;           // Chainlink CRE KeystoneForwarder
    address public uniswapRouter;          // Uniswap V3 SwapRouter on Base
    address public usdc;
    address public eurc;
    uint24 public poolFee = 500;           // 0.05% fee tier (stablecoin default)

    uint256 public constant MIN_TRADE_AMOUNT = 1 * 10**6; // $1 real

    event SwapExecuted(
        bytes32 indexed tradeId,
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 amountOut,
        uint256 timestamp
    );

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }
    modifier onlyCRE() { require(msg.sender == creForwarder, "Not CRE"); _; }

    constructor(
        address _creForwarder,
        address _uniswapRouter,
        address _usdc,
        address _eurc
    ) {
        owner = msg.sender;
        creForwarder = _creForwarder;
        uniswapRouter = _uniswapRouter;
        usdc = _usdc;
        eurc = _eurc;
    }

    /// @notice Execute a USDC -> EURC swap via Uniswap
    /// @dev Called by CRE via KeystoneForwarder with a signed report
    function executeSwap(
        bytes32 _tradeId,
        uint256 _amountIn,
        uint256 _amountOutMinimum   // Slippage protection from QuoteSnapshot
    ) external onlyCRE returns (uint256 amountOut) {
        require(_amountIn >= MIN_TRADE_AMOUNT, "Below minimum");

        // Check balance
        uint256 balance = IERC20(usdc).balanceOf(address(this));
        require(balance >= _amountIn, "Insufficient USDC balance");

        // Approve router
        IERC20(usdc).forceApprove(uniswapRouter, _amountIn);

        // Execute swap
        amountOut = ISwapRouter(uniswapRouter).exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: usdc,
                tokenOut: eurc,
                fee: poolFee,
                recipient: address(this),  // EURC stays in executor for now
                amountIn: _amountIn,
                amountOutMinimum: _amountOutMinimum,
                sqrtPriceLimitX96: 0
            })
        );

        emit SwapExecuted(_tradeId, usdc, eurc, _amountIn, amountOut, block.timestamp);
        return amountOut;
    }

    /// @notice Execute EURC -> USDC (reverse direction)
    function executeReverseSwap(
        bytes32 _tradeId,
        uint256 _amountIn,
        uint256 _amountOutMinimum
    ) external onlyCRE returns (uint256 amountOut) {
        require(_amountIn >= MIN_TRADE_AMOUNT, "Below minimum");

        IERC20(eurc).forceApprove(uniswapRouter, _amountIn);

        amountOut = ISwapRouter(uniswapRouter).exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: eurc,
                tokenOut: usdc,
                fee: poolFee,
                recipient: address(this),
                amountIn: _amountIn,
                amountOutMinimum: _amountOutMinimum,
                sqrtPriceLimitX96: 0
            })
        );

        emit SwapExecuted(_tradeId, eurc, usdc, _amountIn, amountOut, block.timestamp);
        return amountOut;
    }

    /// @notice Withdraw tokens back to treasury (owner or CRE)
    /// CRE calls this after each swap to return output tokens to the treasury wallet.
    /// TODO: Redeploy to Base mainnet after this change (forge script/DeploySwapExecutor.s.sol)
    function withdraw(address token, uint256 amount) external {
        require(msg.sender == owner || msg.sender == creForwarder, "Not authorized");
        IERC20(token).safeTransfer(owner, amount);
    }

    /// @notice Update pool fee tier if needed
    function setPoolFee(uint24 _fee) external onlyOwner {
        poolFee = _fee;
    }

    /// @notice Get current balances (CRE reads this)
    function getBalances() external view returns (uint256 usdcBal, uint256 eurcBal) {
        return (IERC20(usdc).balanceOf(address(this)), IERC20(eurc).balanceOf(address(this)));
    }
}
