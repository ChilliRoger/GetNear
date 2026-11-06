# System Overview — CRE Workflow Loop

The CRE simulator runs as a bash loop. Each iteration ("tick") asks the Oracle
what to do, optionally executes a swap, and reports results back.

## Diagram 1: CRE Workflow Loop

### ASCII Art

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                       run-simulator.sh  (bash loop)                     │
  │                                                                         │
  │  while true; do                                                         │
  │    ┌──────────────────────────────────────────────┐                     │
  │    │  curl Oracle /api/demo/speed -> SPEED (55|5) │                     │
  │    └──────────────────┬───────────────────────────┘                     │
  │                       │                                                 │
  │                       v                                                 │
  │    ┌──────────────────────────────────────────────────────────────┐     │
  │    │  flock -n /tmp/GetNear-cre.lock                             │     │
  │    │  (skip tick if previous still running)                       │     │
  │    │                                                              │     │
  │    │  timeout 90                                                  │     │
  │    │  cre workflow simulate treasury --broadcast                  │     │
  │    │  ┌─────────────────────────────────────────────────────────┐ │     │
  │    │  │             CRE WASM Workflow (workflow.ts)              │ │     │
  │    │  │                                                         │ │     │
  │    │  │  1. HTTP GET /api/strategy/next ──────────> Oracle      │ │     │
  │    │  │     │                                                   │ │     │
  │    │  │     ├── action: WAIT ──> return "WAIT:reason"           │ │     │
  │    │  │     │                                                   │ │     │
  │    │  │     └── action: SWAP                                    │ │     │
  │    │  │         │                                               │ │     │
  │    │  │         v                                               │ │     │
  │    │  │  2. EVM Read: SwapExecutor.getBalances()  (Base 8453)   │ │     │
  │    │  │     │  sanity check: USDC >= chunkAmount?               │ │     │
  │    │  │     │                                                   │ │     │
  │    │  │     v                                                   │ │     │
  │    │  │  3. EVM Write: SwapExecutor.executeSwap()  (Base 8453)  │ │     │
  │    │  │     │  try/catch: on fail -> report SWAP_FAILED, exit   │ │     │
  │    │  │     │                                                   │ │     │
  │    │  │     v                                                   │ │     │
  │    │  │  4. EVM Write: SwapExecutor.withdraw()  (Base 8453)     │ │     │
  │    │  │     │  try/catch: on fail -> log warning, continue      │ │     │
  │    │  │     │  (funds safe in executor)                         │ │     │
  │    │  │     │                                                   │ │     │
  │    │  │     v                                                   │ │     │
  │    │  │  5. EVM Write: TreasuryVault.logExecution()  (Arc 5042) │ │     │
  │    │  │     │  try/catch: on fail -> continue (best-effort)     │ │     │
  │    │  │     │                                                   │ │     │
  │    │  │     v                                                   │ │     │
  │    │  │  6. HTTP PATCH /api/trades/:id/fill ──────> Oracle      │ │     │
  │    │  │     HTTP POST  /api/cre/runs ─────────────> Oracle      │ │     │
  │    │  │     return "EXECUTED:orderId"                            │ │     │
  │    │  └─────────────────────────────────────────────────────────┘ │     │
  │    └──────────────────────────────────────────────────────────────┘     │
  │                       │                                                 │
  │                       v                                                 │
  │    ┌──────────────────────────────────────────────┐                     │
  │    │  tee -a /tmp/cre-loop.log                    │                     │
  │    │  sleep $SPEED                                │                     │
  │    └──────────────────┬───────────────────────────┘                     │
  │                       │                                                 │
  │                       └───────> (loop back to top)                      │
  └─────────────────────────────────────────────────────────────────────────┘
```

### Mermaid

```mermaid
sequenceDiagram
    participant Bash as run-simulator.sh
    participant Flock as flock guard
    participant CRE as CRE WASM Workflow
    participant Oracle as Oracle Server
    participant Base as SwapExecutor (Base)
    participant Arc as TreasuryVault (Arc)

    loop Every SPEED seconds (55s at 1x, 5s at 10x)
        Bash->>Oracle: GET /api/demo/speed
        Oracle-->>Bash: { sleep: 55 | 5 }

        Bash->>Flock: flock -n /tmp/GetNear-cre.lock
        alt Lock acquired
            Flock->>CRE: timeout 90 cre workflow simulate treasury --broadcast

            CRE->>Oracle: GET /api/strategy/next
            Oracle-->>CRE: { action, orderId, chunkAmount, minOutput, score }

            alt action = WAIT
                CRE-->>Bash: "WAIT:reason"
            else action = SWAP
                CRE->>Base: getBalances() [EVM Read]
                Base-->>CRE: { usdcBal, eurcBal }

                CRE->>Base: executeSwap(tradeId, chunkAmount, minOutput) [EVM Write]
                Note over CRE,Base: try/catch: on fail -> report SWAP_FAILED

                CRE->>Base: withdraw(eurcAddress, amount) [EVM Write]
                Note over CRE,Base: try/catch: on fail -> log warning, continue

                CRE->>Arc: logExecution(tradeId, ...) [EVM Write]
                Note over CRE,Arc: try/catch: on fail -> continue (best-effort)

                CRE->>Oracle: PATCH /api/trades/:id/fill
                CRE->>Oracle: POST /api/cre/runs
                CRE-->>Bash: "EXECUTED:orderId"
            end
        else Lock busy (previous tick running)
            Flock-->>Bash: "Tick skipped"
        end

        Bash->>Bash: sleep $SPEED
    end
```

---

## Diagram 1B: Extended CRE with Post-Swap Bridging (Optimistic/Future)

Shows how CRE would be extended to manage cross-chain bridging so that treasury
funds live on Arc by default and only move to Base for active swap execution.

**Status: FUTURE / OPTIMISTIC DESIGN -- not yet implemented.**

### ASCII Art

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  FUTURE CRE WORKFLOW: Cross-Chain Bridging                              │
  │                                                                         │
  │  Arc (Chain 5042002)                   Base (Chain 8453)                │
  │  ┌───────────────────────┐             ┌───────────────────────┐       │
  │  │    TreasuryVault      │             │    SwapExecutor       │       │
  │  │  ┌─────────────────┐  │             │  ┌─────────────────┐  │       │
  │  │  │  USDC (idle)    │  │             │  │  (empty)        │  │       │
  │  │  │  EURC (idle)    │  │             │  │                 │  │       │
  │  │  │  Policy config  │  │             │  │  Uniswap V3     │  │       │
  │  │  │  Audit logs     │  │             │  │  SwapRouter     │  │       │
  │  │  └─────────────────┘  │             │  └─────────────────┘  │       │
  │  └───────────┬───────────┘             └───────────┬───────────┘       │
  │              │                                     │                    │
  │              │  STEP 1: Bridge USDC                │                    │
  │              │  Arc -> Base                         │                    │
  │              ├─────────────────────────────────────>│                    │
  │              │                                     │                    │
  │              │               STEP 2: Execute Swap  │                    │
  │              │               SwapExecutor calls     │                    │
  │              │               Uniswap V3             │                    │
  │              │                  ┌───────────────┐   │                    │
  │              │                  │ USDC -> EURC  │   │                    │
  │              │                  │ exactInput    │   │                    │
  │              │                  │ Single()      │   │                    │
  │              │                  └───────────────┘   │                    │
  │              │                                     │                    │
  │              │               STEP 3: Withdraw EURC │                    │
  │              │               from SwapExecutor      │                    │
  │              │                                     │                    │
  │              │  STEP 4: Bridge EURC                │                    │
  │              │  Base -> Arc                         │                    │
  │              │<─────────────────────────────────────┤                    │
  │              │                                     │                    │
  │              v                                     v                    │
  │  ┌───────────────────────┐             ┌───────────────────────┐       │
  │  │    TreasuryVault      │             │    SwapExecutor       │       │
  │  │  ┌─────────────────┐  │             │  ┌─────────────────┐  │       │
  │  │  │  USDC (less)    │  │             │  │  (empty again)  │  │       │
  │  │  │  EURC (more)    │  │             │  │                 │  │       │
  │  │  │  + audit log    │  │             │  │                 │  │       │
  │  │  └─────────────────┘  │             │  └─────────────────┘  │       │
  │  └───────────────────────┘             └───────────────────────┘       │
  │                                                                         │
  │  KEY: Arc = "home base" (security + audit)                              │
  │       Base = "execution venue" (transient, only during active swap)     │
  └─────────────────────────────────────────────────────────────────────────┘
```

### Mermaid

```mermaid
sequenceDiagram
    participant TV as TreasuryVault (Arc)
    participant Bridge as Cross-Chain Bridge
    participant SE as SwapExecutor (Base)
    participant Uni as Uniswap V3 (Base)

    Note over TV: Treasury holds all idle funds<br/>USDC + EURC + policy + audit

    rect rgb(255, 245, 230)
        Note right of TV: FUTURE / OPTIMISTIC DESIGN

        TV->>Bridge: 1. Bridge USDC (Arc -> Base)
        Bridge->>SE: USDC arrives at SwapExecutor

        SE->>Uni: 2. executeSwap(USDC -> EURC)
        Uni-->>SE: EURC output

        SE->>SE: 3. withdraw(EURC) from executor

        SE->>Bridge: 4. Bridge EURC (Base -> Arc)
        Bridge->>TV: EURC arrives at TreasuryVault

        TV->>TV: 5. logExecution() audit trail
    end

    Note over TV: Treasury updated:<br/>less USDC, more EURC<br/>audit log recorded
    Note over SE: SwapExecutor empty again<br/>(transient execution venue only)
```
