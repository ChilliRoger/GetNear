# Demo Transaction Hashes — Base Mainnet

Real on-chain Uniswap V3 swaps executed during the ETHGlobal Cannes 2026 demo.

## Treasury Wallet (Deployer) Swaps

| # | Description | Tx Hash | Explorer |
|---|-------------|---------|----------|
| 1 | Approve USDC for Uniswap Router | `0x3c17b6c1da74bfc53765da20d6e9eb23f03fafecf3c1356515b71d1becbcbc62` | [Basescan](https://basescan.org/tx/0x3c17b6c1da74bfc53765da20d6e9eb23f03fafecf3c1356515b71d1becbcbc62) |
| 2 | Swap $1.20 USDC → 1.04 EURC (treasury) | `0x64ef1982f28240e066244afb0bfa79421e6bdd3340df3e0036fbbbcf29392a56` | [Basescan](https://basescan.org/tx/0x64ef1982f28240e066244afb0bfa79421e6bdd3340df3e0036fbbbcf29392a56) |

## SwapExecutor TWAP Chunks

| # | Description | Tx Hash | Explorer |
|---|-------------|---------|----------|
| 1 | Chunk 1: $1.10 USDC → 0.95 EURC | `0x307f6f6eff4295c756f694c8d98db441c6da8c66d765702200e989423df8691b` | [Basescan](https://basescan.org/tx/0x307f6f6eff4295c756f694c8d98db441c6da8c66d765702200e989423df8691b) |
| 2 | Chunk 2: $0.018 USDC → EURC | `0xe9f1ca10606b03b792714d495426d5c0d08858db35c04ad974b1a565fdf471fc` | [Basescan](https://basescan.org/tx/0xe9f1ca10606b03b792714d495426d5c0d08858db35c04ad974b1a565fdf471fc) |

## Earlier Session Swaps

| # | Description | Tx Hash | Explorer |
|---|-------------|---------|----------|
| 1 | EURC → USDC (clear treasury for demo) | `0x90136a1e31c349bf06f117ddd6c779c9aa98d1fe523339e3d4be75c369fc837f` | [Basescan](https://basescan.org/tx/0x90136a1e31c349bf06f117ddd6c779c9aa98d1fe523339e3d4be75c369fc837f) |
| 2 | Transfer $5 USDC to SwapExecutor | `0xf3ed67cc484fbc9bf8e93688bbde9168901c111cf62303d6c7bc80b88ae2f2ca` | [Basescan](https://basescan.org/tx/0xf3ed67cc484fbc9bf8e93688bbde9168901c111cf62303d6c7bc80b88ae2f2ca) |

## Unlink Privacy Transactions (Base Sepolia)

| # | Direction | Token | Amount | Unlink Tx ID | EVM Tx Hash | Explorer |
|---|-----------|-------|--------|-------------|-------------|----------|
| 1 | Shield | EURC | 1,000,067 | `3eab4d38-08cf-49af-92bb-b294a7e27c12` | `0xeb96a29a883cc653dde60cf91900e649c3d2c1011150b5b2c48b55279f2b603d` | [Basescan](https://sepolia.basescan.org/tx/0xeb96a29a883cc653dde60cf91900e649c3d2c1011150b5b2c48b55279f2b603d) |
| 2 | Shield | EURC | 420,690 | `d47eae9b-364f-4f1a-abf3-0d6a00e13b10` | — | — |
| 3 | Unshield | EURC | 500,067.5 | `40771598-92ff-42b6-9109-017ffc3f3e28` | — | — |
| 4 | Unshield | USDC | 1,500,000 | `06cf93ed-f245-4aec-8b39-a4a34c916c88` | — | — |
| 5 | Unshield | EURC | 420,690 | `b4041a2d-d7f8-4139-a057-43d9d037ba08` | — | — |
| 6 | Unshield | WBTC | 0.67 | `9c9ab7ed-df04-44f5-81a2-393d675a11e6` | — | — |
| 7 | Shield | WBTC | 5 | `810f35ff-d055-414a-9f60-2fec0fb89fe3` | — | — |
| 8 | Shield | USDC | 1,000,067 | `a8277b2f-538b-47a4-9f7a-daba9cba682e` | — | — |
| 9 | Unshield | EURC | 420,069 | `a86755a0-dffc-40c6-986e-b70e60ae9edc` | — | — |

## Private Swaps (Base Sepolia via Unlink)

| # | Direction | Tokens | Amount | Status |
|---|-----------|--------|--------|--------|
| 1 | Execute | USDC → EURC | 420,069 | confirmed |
| 2 | Faucet | ULNKm | 100 | confirmed (tx: `0x260151b3d41dab614c6596135d2e32c92de14c8b1493aa0be9737c9fba046e61`) |

## Addresses

| Contract | Address | Explorer |
|----------|---------|----------|
| SwapExecutor | `0xBcA2be0dCe857a936b4660538A9CCdDcB7aE92fF` | [Basescan](https://basescan.org/address/0xBcA2be0dCe857a936b4660538A9CCdDcB7aE92fF) |
| TreasuryVault | `0x75a1ff87d9369fefeb2914bd6cc69296f7ebd997` | [ArcScan](https://testnet.arcscan.app/address/0x75a1ff87d9369fefeb2914bd6cc69296f7ebd997) |
| Deployer/Treasury | `0xB60679110E14D2291f8105EF002A49809cfB283b` | [Basescan](https://basescan.org/address/0xB60679110E14D2291f8105EF002A49809cfB283b) |
| Uniswap SwapRouter02 | `0x2626664c2603336E57B271c5C0b26F421741e481` | [Basescan](https://basescan.org/address/0x2626664c2603336E57B271c5C0b26F421741e481) |
