# Privacy Flow (Unlink SDK)

How GetNear hides treasury identity for on-chain swaps using the Unlink
privacy pool and ZK proofs.

### ASCII Art

```
Normal Flow (Public):
  Treasury Wallet ──────────> SwapExecutor ──────────> Uniswap V3
  (0xBcA2...92fF)             (Base Sepolia 84532)     USDC → EURC
       │
       └── On-chain observer sees: sender = 0xBcA2... (treasury visible)


Private Flow (Unlink):
  Treasury Wallet ──> Unlink Pool ──> [ZK Proof] ──> Uniswap V3
  (0xBcA2...92fF)    (0x647f...0482)                  USDC → EURC
                          │
                          └── On-chain observer sees: sender = 0x647f... (Unlink pool)
                              Treasury identity hidden behind ZK proof


Three-Step Execution:

  ┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
  │   1. DEPOSIT     │     │   2. EXECUTE      │     │   3. WITHDRAW    │
  │                  │     │                   │     │                  │
  │  Treasury ──────>│────>│  Pool ──────────> │────>│  Pool ──────>    │
  │  sends USDC to   │     │  swaps via        │     │  sends EURC to   │
  │  Unlink Pool     │     │  Uniswap V3       │     │  Treasury        │
  │                  │     │  (sender = pool)   │     │                  │
  └─────────────────┘     └──────────────────┘     └──────────────────┘


Compare:
  Normal:  Anyone can see  Treasury → SwapExecutor → Uniswap (wallet exposed)
  Private: Observer sees   Pool → Uniswap (can't link to treasury)

What's hidden:                    What's visible:
  ✗ Sender identity (ZK proof)      ✓ Swap amount
                                     ✓ Tokens (USDC/EURC)
                                     ✓ Target DEX (Uniswap V3)
                                     ✓ Audit trail (Arc L1)
```

### Mermaid

```mermaid
sequenceDiagram
    participant T as Treasury Wallet<br/>(0xBcA2...92fF)
    participant P as Unlink Pool<br/>(0x647f...0482)
    participant ZK as ZK Proof Engine
    participant U as Uniswap V3<br/>(Base Sepolia)
    participant A as Arc L1<br/>(Audit Trail)

    Note over T,U: Normal Flow (identity exposed)
    rect rgb(254, 226, 226)
        T->>U: executeSwap() — sender = Treasury
        Note right of U: Observer sees treasury address
    end

    Note over T,U: Private Flow (identity hidden)
    rect rgb(237, 233, 254)
        T->>P: 1. Deposit USDC into privacy pool
        P->>ZK: 2. Generate ZK proof (treasury authorized)
        ZK-->>P: Proof valid (identity not revealed)
        P->>U: 3. Execute swap — sender = Pool
        Note right of U: Observer sees pool address only
        U-->>P: EURC returned to pool
        P->>T: 4. Withdraw EURC to treasury
    end

    T->>A: Log execution to audit trail

    Note over T,A: Internal compliance: full visibility<br/>External observers: cannot link trade to treasury

    style T fill:#e3f2fd,stroke:#1565c0
    style P fill:#f3e5f5,stroke:#7b1fa2
    style ZK fill:#f3e5f5,stroke:#7b1fa2
    style U fill:#FF007A,color:#fff
    style A fill:#fff3e0,stroke:#e65100
```
