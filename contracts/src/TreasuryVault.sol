// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title TreasuryVault — Policy engine, audit trail, and approval gate on Arc
/// @dev CRE consumer contract. Deployed on Arc (Circle L1).
contract TreasuryVault {
    using SafeERC20 for IERC20;

    // —— Access Control ——
    address public owner;
    address public creForwarder;           // Chainlink CRE KeystoneForwarder
    mapping(address => bool) public isCFO;

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }
    modifier onlyCFO() { require(isCFO[msg.sender], "Not CFO"); _; }
    modifier onlyCRE() { require(msg.sender == creForwarder, "Not CRE"); _; }
    modifier onlyCREOrCFO() {
        require(msg.sender == creForwarder || isCFO[msg.sender], "Not authorized");
        _;
    }

    // —— Policy ——
    struct Policy {
        uint256 autoExecuteThreshold;  // Amount below which agent auto-executes
        uint256 targetRateMin;         // Min acceptable rate (18 decimals for precision)
        uint256 targetRateMax;         // Max acceptable rate (18 decimals)
        uint256 version;               // Incremented on each policy change
    }

    Policy public policy;

    uint256 public constant MIN_TRADE_AMOUNT = 1; // Effectively no minimum — allows any amount for demo flexibility

    // —— Pending Trades ——
    // MVP statuses: PENDING, APPROVED, EXECUTED, REJECTED
    // Future: EXECUTING (in-flight), FAILED (swap reverted), EXPIRED (timed out)
    enum TradeStatus { PENDING, APPROVED, EXECUTED, REJECTED }

    struct PendingTradeData {
        bytes32 tradeId;
        uint256 fromAmount;
        uint256 toAmount;
        uint256 exchangeRate;       // 18 decimals
        uint256 createdAt;
        uint256 expiresAt;
        TradeStatus status;
        address approvedBy;         // CFO who approved (zero if not yet)
        uint256 approvedAt;         // Timestamp of approval (zero if not yet)
    }

    mapping(bytes32 => PendingTradeData) public pendingTrades;
    bytes32[] public pendingTradeIds;
    mapping(bytes32 => bool) public executionLogged;  // Idempotency guard for ALL executions

    // —— Events ——
    event PolicyUpdated(
        uint256 threshold, uint256 rateMin, uint256 rateMax, uint256 version
    );
    event TradeExecuted(
        bytes32 indexed tradeId,
        string executionType,       // "AUTO" or "APPROVED"
        address fromToken,
        address toToken,
        uint256 fromAmount,
        uint256 toAmount,
        uint256 exchangeRate,
        bytes32 txHashBase,
        uint256 timestamp
    );
    event TradeQueued(
        bytes32 indexed tradeId, uint256 fromAmount, uint256 toAmount, uint256 exchangeRate
    );
    event TradeApproved(bytes32 indexed tradeId, address approver);
    event TradeRejected(bytes32 indexed tradeId, address rejector, string reason);
    event CFOUpdated(address cfo, bool status);

    constructor(address _creForwarder) {
        owner = msg.sender;
        creForwarder = _creForwarder;
        isCFO[msg.sender] = true;

        // Default policy
        policy = Policy({
            autoExecuteThreshold: 10_000 * 10**6,   // $10K
            targetRateMin: 1.07 ether,               // Using 18 decimals
            targetRateMax: 1.09 ether,
            version: 1
        });
    }

    // —— CFO Management ——
    function setCFO(address _cfo, bool _status) external onlyOwner {
        isCFO[_cfo] = _status;
        emit CFOUpdated(_cfo, _status);
    }

    // —— Policy Management ——
    function setPolicy(
        uint256 _threshold,
        uint256 _rateMin,
        uint256 _rateMax
    ) external onlyCFO {
        require(_threshold >= MIN_TRADE_AMOUNT, "Threshold below minimum");
        require(_rateMax > _rateMin, "Invalid rate band");
        policy.autoExecuteThreshold = _threshold;
        policy.targetRateMin = _rateMin;
        policy.targetRateMax = _rateMax;
        policy.version++;
        emit PolicyUpdated(_threshold, _rateMin, _rateMax, policy.version);
    }

    function getPolicy() external view returns (
        uint256 threshold, uint256 rateMin, uint256 rateMax, uint256 version
    ) {
        return (
            policy.autoExecuteThreshold,
            policy.targetRateMin,
            policy.targetRateMax,
            policy.version
        );
    }

    // —— Deposit ——
    function deposit(address token, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    }

    // —— Pending Trade Management (CRE writes these) ——
    function createPendingTrade(
        bytes32 _tradeId,
        uint256 _fromAmount,
        uint256 _toAmount,
        uint256 _exchangeRate,
        uint256 _expiresAt
    ) external onlyCRE {
        require(_fromAmount >= MIN_TRADE_AMOUNT, "Below minimum");
        require(pendingTrades[_tradeId].createdAt == 0, "Trade already exists");
        pendingTrades[_tradeId] = PendingTradeData({
            tradeId: _tradeId,
            fromAmount: _fromAmount,
            toAmount: _toAmount,
            exchangeRate: _exchangeRate,
            createdAt: block.timestamp,
            expiresAt: _expiresAt,
            status: TradeStatus.PENDING,
            approvedBy: address(0),
            approvedAt: 0
        });
        pendingTradeIds.push(_tradeId);
        emit TradeQueued(_tradeId, _fromAmount, _toAmount, _exchangeRate);
    }

    function confirmApproval(bytes32 _tradeId, address _approver) external onlyCREOrCFO {
        PendingTradeData storage trade = pendingTrades[_tradeId];
        require(trade.createdAt > 0, "Trade not found");
        require(trade.status == TradeStatus.PENDING, "Trade not pending");
        require(block.timestamp <= trade.expiresAt, "Trade expired");
        require(isCFO[_approver], "Approver not CFO");
        trade.status = TradeStatus.APPROVED;
        trade.approvedBy = _approver;
        trade.approvedAt = block.timestamp;
        emit TradeApproved(_tradeId, _approver);
    }

    function rejectTrade(bytes32 _tradeId, string calldata _reason) external onlyCREOrCFO {
        PendingTradeData storage trade = pendingTrades[_tradeId];
        require(trade.createdAt > 0, "Trade not found");
        require(trade.status == TradeStatus.PENDING, "Trade not pending");
        trade.status = TradeStatus.REJECTED;
        emit TradeRejected(_tradeId, msg.sender, _reason);
    }

    // —— Execution Logging (CRE writes after swap completes on Base) ——
    function logExecution(
        bytes32 _tradeId,
        string calldata _executionType,
        address _fromToken,
        address _toToken,
        uint256 _fromAmount,
        uint256 _toAmount,
        uint256 _exchangeRate,
        bytes32 _txHashBase
    ) external onlyCRE {
        // Idempotency: prevents double-logging on retry (covers BOTH auto and approved)
        require(!executionLogged[_tradeId], "Trade already logged");
        executionLogged[_tradeId] = true;

        // Update pending trade status if this was an approved trade
        if (pendingTrades[_tradeId].createdAt > 0) {
            pendingTrades[_tradeId].status = TradeStatus.EXECUTED;
        }

        emit TradeExecuted(
            _tradeId,
            _executionType,
            _fromToken,
            _toToken,
            _fromAmount,
            _toAmount,
            _exchangeRate,
            _txHashBase,
            block.timestamp
        );
    }

    // —— View Functions (Dashboard reads these) ——
    function getPendingTradeIds() external view returns (bytes32[] memory) {
        return pendingTradeIds;
    }

    function getPendingTrade(bytes32 _tradeId) external view returns (PendingTradeData memory) {
        return pendingTrades[_tradeId];
    }

    function getActivePendingTrades() external view returns (PendingTradeData[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < pendingTradeIds.length; i++) {
            PendingTradeData memory t = pendingTrades[pendingTradeIds[i]];
            if (t.status == TradeStatus.PENDING && t.expiresAt > block.timestamp) {
                count++;
            }
        }
        PendingTradeData[] memory active = new PendingTradeData[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < pendingTradeIds.length; i++) {
            PendingTradeData memory t = pendingTrades[pendingTradeIds[i]];
            if (t.status == TradeStatus.PENDING && t.expiresAt > block.timestamp) {
                active[idx++] = t;
            }
        }
        return active;
    }
}
