# GetNear — References

*Sections 6, 7, and 8 from the GetNear Agent Prompt Pack. The agent must verify every URL before coding against it.*

## 6. References for the agent

Every URL below was seen during research or appears in the hackathon file. Items marked (verify) are well known but were not checked. Always confirm exact request and response shapes in the linked docs, and use the llms.txt indexes to find the right pages.

### 6.1 Hackathon

- Live rules (re-read before submitting): https://nearhackathon.com/HACKATHON.md
- Submission API (human confirms, once per repo): POST https://nearhackathon.com/api/applications
- Track prompt examples: https://github.com/nearai/near-hackathon-prompt-examples (business: tracks/04-business.md, security: tracks/06-security.md, real-world: tracks/08-realworld.md)
- Rules that matter here: Q-000 (NEAR AI credits via https://cloud.near.ai or https://nearbuilders.org/join), Q-003 (baseline tags and a diff link), Q-005 (list libraries and AI code), Q-007 (no testnet for Intents; use dry: true quotes), Q-010 (testnet-only projects are eligible), Q-012 (video plus a reproducible README), Q-014 (add a LICENSE file).
- Help: https://discord.gg/nearprotocol

### 6.2 Architecture diagrams

- Architecture diagrams are in docs/diagrams (numbered 01 to 08).

### 6.3 NEAR testnet endpoints and docs

| Purpose | URL |
| --- | --- |
| Testnet RPC (primary) | https://rpc.testnet.near.org |
| Testnet RPC (alternative) | https://test.rpc.fastnear.com |
| RPC provider list (testnet section) | https://docs.near.org/api/rpc/providers |
| Explorer | https://testnet.nearblocks.io/ (link patterns /txns/HASH and /address/ACCOUNT, verify) |
| Faucet | https://docs.near.org/getting-started/faucet (also near-faucet.io, named in rule Q-008) |
| Docs index for agents | https://docs.near.org/llms.txt |
| Testing guide | https://docs.near.org/integrations/testing |
| Contract integration tests | https://docs.near.org/smart-contracts/testing/integration-test |
| near-workspaces (JS) | https://github.com/near/workspaces-js |
| Access keys | https://docs.near.org/protocol/access-keys |
| One-yocto pattern | https://docs.near.org/smart-contracts/security/one\_yocto |
| Official SDK and CLI repos (verify) | github.com/near/near-sdk-rs, github.com/near/near-api-js, github.com/near/near-cli-rs |

### 6.4 JSON-RPC cheat sheet

Send an HTTP POST to the testnet RPC URL with a JSON-RPC 2.0 body that has the fields jsonrpc, id, method and params. Check the RPC docs for the exact shape of each method; some changed between node versions (verify).

| Method | Parameters | GetNear use |
| --- | --- | --- |
| `status` | none | Chain id check (must be testnet), sync state |
| `query` with request\_type `view_account` | finality, account\_id | Balances and storage usage |
| `query` with request\_type `call_function` | finality, account\_id, method\_name, args\_base64 | All contract views: get\_order, list\_orders, get\_limits, DAO proposals |
| `query` with request\_type `view_access_key` | finality, account\_id, public\_key | Agent key nonce and permission (confirms the key is limited to execute\_chunk) |
| `query` with request\_type `view_access_key_list` | finality, account\_id | Audit all keys on the agent account |
| `block` | finality or block id | Latest block timestamp in nanoseconds, for deadline logic |
| `gas_price` | block id or null | Cost estimates |
| `tx` | transaction hash, signer account id, wait\_until | Final outcome and logs, to parse events |
| `send_tx` | signed\_tx\_base64, wait\_until | Submit chunks (the older broadcast\_tx\_commit is deprecated, verify) |

Implement failover across both RPC URLs and expect rate limits on the public endpoints.

### 6.5 Sputnik DAO

- Contract: https://github.com/near-daos/sputnik-dao-contract (tests: sputnikdao2/tests/test\_general.rs)
- NEAR docs: https://docs.near.org/primitives/dao
- Tooling: https://github.com/cloudmex/sputnikdao-cli and https://npmjs.com/package/sputnikdao
- Testnet factory account names seen in docs and tests: genesis.sputnik-v2.testnet and primitives.sputnikv2.testnet (verify which is current)
- Trezu is optional and NOT a dependency: https://github.com/NEAR-DevHub/trezu, docs https://github.com/NEAR-DevHub/trezu-docs, CLI https://docs.rs/crate/trezu-cli/0.1.0/source/src/ (testnet support unverified)

### 6.6 NEAR Intents and the 1Click API

- Docs index: https://docs.near-intents.org/llms.txt
- 1Click API overview: https://docs.near-intents.org/near-intents/1click-api
- OpenAPI spec: https://1click.chaindefuser.com/docs/v0/openapi.yaml
- Token list reference: https://docs.near-intents.org/api-reference/oneclick/get-supported-tokens.md
- Base URL: https://1click.chaindefuser.com. GetNear uses only GET /v0/tokens and POST /v0/quote with dry=true (verify in the spec). It never calls the deposit-submit or status endpoints because it never executes.
- Supported assets: https://docs.near-intents.org/resources/asset-support; chains: https://docs.near-intents.org/resources/chain-support; concepts: https://docs.near-intents.org/getting-started/what-are-intents
- Optional partner portal: https://partners.near-intents.org
- Contracts: https://github.com/near/intents; TypeScript example client: https://github.com/nearuaguild/near-intents-1click-example
- Route minimums and payment finality: https://www.near.org/agentic-payments

### 6.7 Optional

- NEAR AI docs: https://docs.near.ai/; dashboard: https://cloud.near.ai
- Agent API demo, for wallet patterns only (license unverified): https://github.com/NEAR-Intents-Agent-API/demo

### 6.8 Facts the agent may rely on (re-verify before coding)

1. NEAR Intents has no testnet (hackathon rule Q-007). Quotes use dry: true; fills here are simulated.
2. Function-call keys cannot attach a deposit, and an exhausted allowance cannot be changed on the same key (https://docs.near.org/protocol/access-keys).
3. Sputnik DAO proposals require an attached bond, and voting policy is defined per role and proposal kind with a ratio or fixed threshold, not per amount (Sputnik repo and https://docs.near.org/primitives/dao).
4. Each Intents route has a minimum amount, and standard x402 payments are final (https://www.near.org/agentic-payments).

## 7. Known unknowns the agent must resolve and report, never assume

1. Does the 1Click token list include a euro stablecoin, on which chains, and with which asset ids?
2. Do dry quotes require an API key, or valid real recipient and refund addresses?
3. What are the route minimums at your chunk sizes, and what are the API rate limits?
4. Which free FX reference source is reliable and permitted for this use?
5. Current Sputnik DAO testnet factory account, creation deposit, and default proposal bond.
6. How much testnet NEAR the faucet gives per request.
7. The current recommended NEAR wallet connector and JS packages.
8. The exact JSON-RPC shapes for tx and send\_tx on the current testnet nodes.
9. Whether Trezu supports testnet at all (not required).

## 8. Added citations (from the project owner's list, checked where noted)

Where section 8 and section 6 differ, prefer section 8 and report the difference to the owner.

Status key: **CHECKED** means the page was opened and read while preparing this section. **LISTED** means the owner supplied it and it was not opened. The agent must still verify anything it depends on.

### 8.1 NEAR Intents and the 1Click API

| Resource | URL | Status | Used in |
| --- | --- | --- | --- |
| Docs home | https://docs.near-intents.org/ | LISTED | P5 |
| Full docs index | https://docs.near-intents.org/llms.txt | LISTED (named on the checked page) | P5 |
| 1Click API overview | https://docs.near-intents.org/integration/distribution-channels/1click-api/about-1click-api | LISTED | P5 |
| Making a request (tokens, quote, deposit, status) | https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/making-a-request | CHECKED | P5 |
| Authentication (JWT) | https://docs.near-intents.org/integration/distribution-channels/1click-api/authentication.md | LISTED (linked from the checked page) | Optional |
| Swap types | https://docs.near-intents.org/integration/distribution-channels/1click-api/swap-types.md | LISTED (linked from the checked page) | P5 |
| What are Intents | https://docs.near-intents.org/getting-started/what-are-intents | LISTED | Background |
| Supported chains | https://docs.near-intents.org/resources/chain-support | LISTED | P5 |
| Supported assets | https://docs.near-intents.org/resources/asset-support | Seen in earlier research | P5 |
| Intent types and execution; account abstraction | https://docs.near-intents.org/integration/verifier-contract/intent-types-and-execution and https://docs.near-intents.org/integration/verifier-contract/account-abstraction | LISTED | Background only |
| NEAR docs, Intents overview | https://docs.near.org/chain-abstraction/intents/overview | LISTED | Background |
| Partner portal (JWT for lower fees) | https://partners.near-intents.org | LISTED | Optional |
| Intents explorer | https://explorer.near-intents.org | Named on the checked page | Reference only; GetNear never executes swaps |
| Older overview path used in section 6.6 | https://docs.near-intents.org/near-intents/1click-api | May be superseded by the paths above |  |

**Facts from the checked 'Making a request' page (apply in P5).**

1. Tokens: `GET https://1click.chaindefuser.com/v0/tokens` returns assetId, decimals, blockchain, symbol, price, priceUpdatedAt and contractAddress. Asset ids look like `nep141:wrap.near` (NEAR-native) and `nep141:eth-0x...omft.near` (bridged).
2. Quote: `POST https://1click.chaindefuser.com/v0/quote`. Setting `dry` to true validates the parameters and returns a quote without executing the swap.
3. Request fields, named exactly as in the docs: `dry`, `swapType` (EXACT\_INPUT, EXACT\_OUTPUT, FLEX\_INPUT, ANY\_INPUT), `slippageTolerance` (basis points), `originAsset`, `depositType` (ORIGIN\_CHAIN, INTENTS, CONFIDENTIAL\_INTENTS), `destinationAsset`, `amount` (smallest unit), `recipient`, `recipientType` (DESTINATION\_CHAIN, INTENTS, CONFIDENTIAL\_INTENTS), `refundTo`, `refundType` (ORIGIN\_CHAIN, INTENTS, CONFIDENTIAL\_INTENTS), `deadline` (ISO timestamp), and an optional `confidentiality` field (public by default, basic or advanced).
4. GetNear must always send dry = true, swapType EXACT\_INPUT, depositType ORIGIN\_CHAIN, recipientType DESTINATION\_CHAIN, refundType ORIGIN\_CHAIN, and leave confidentiality at public. Never use the confidential options; they are out of scope.
5. The docs example includes `recipient` and `refundTo` even for an ordinary quote. The page does not say whether placeholder addresses pass a dry quote. The agent must test this and ask the owner (known unknown 2).
6. Quotes sent without a JWT carry an extra 0.25% fee under the unauthenticated schedule; a JWT goes in an Authorization Bearer header. This matters only for a live swap, which GetNear never does.
7. The deposit-submit and status endpoints exist but GetNear does not call them. Status values are PENDING\_DEPOSIT, KNOWN\_DEPOSIT\_TX, PROCESSING, SUCCESS, INCOMPLETE\_DEPOSIT, REFUNDED and FAILED.

### 8.2 Sputnik DAO and Trezu

| Resource | URL | Status | Used in |
| --- | --- | --- | --- |
| Sputnik DAO contract | https://github.com/near-daos/sputnik-dao-contract | LISTED | P8 |
| ABI reference | https://github.com/near-daos/sputnik-dao-contract/blob/main/sputnikdao2/ABI.md | CHECKED | P8, P9 |
| NEAR docs, DAO | https://docs.near.org/primitives/dao | LISTED | P8 |
| Trezu docs home | https://docs.trezu.org/home | LISTED | Optional |
| What is a Treasury | https://docs.trezu.org/what-is | LISTED | Optional |
| Confidential Treasuries | https://docs.trezu.org/confidential-treasuries | LISTED | Not used (out of scope) |
| Members and roles | https://docs.trezu.org/governance/members-and-roles | LISTED | Optional; reference for role design |
| Swapping assets (uses Intents) | https://docs.trezu.org/swap | LISTED | Optional |
| Trezu site and code | https://trezu.org/ and https://github.com/NEAR-DevHub/trezu | LISTED | Optional |

**Facts from the checked ABI page.**

1. The v2 contract exposes view methods including `get_config`, `get_policy`, `get_last_proposal_id`, `get_proposals` and `get_proposal`, and change methods including `new`, `add_proposal` and `act_proposal`.
2. A v3 ABI also exists, with extra views such as `get_locked_storage_amount`, `delegation_balance_ratio` and `get_factory_info`. In P8 the agent must check which version the current testnet factory deploys and use that version's ABI.
3. The repository describes itself as the smart contracts for Trezu, so Trezu treasuries run on this contract line. Trezu remains optional and is not a dependency of GetNear.

### 8.3 NEAR AI (optional block P11 only)

| Resource | URL | Status |
| --- | --- | --- |
| Cloud dashboard | https://cloud.near.ai | LISTED |
| Docs | https://docs.near.ai | LISTED |
| Quickstart | https://docs.near.ai/cloud/quickstart | LISTED |
| Private inference | https://docs.near.ai/cloud/private-inference | LISTED |
| Models | https://docs.near.ai/cloud/models | LISTED |
| API reference | https://docs.near.ai/api-reference/introduction | LISTED |

Do not claim private inference in the README unless attestation is actually verified in code.

### 8.4 Core NEAR documentation

All LISTED: docs home https://docs.near.org/, index https://docs.near.org/llms.txt, access keys https://docs.near.org/protocol/access-keys, account IDs https://docs.near.org/protocol/account-id, RPC providers https://docs.near.org/api/rpc/providers, builder resources https://nearbuilders.org/build.

### 8.5 Hackathon and community (all LISTED)

- Rules: https://nearhackathon.com/HACKATHON.md. Submission form: https://nearhackathon.com/#apply. Submission API: POST https://nearhackathon.com/api/applications.
- Request changes to a submission: https://nearhackathon.com/request-changes. Announcement: https://www.near.org/blog/near-hackathon-build-beyond-boundaries.
- Prompt examples: https://github.com/nearai/near-hackathon-prompt-examples, including 00-setup.md, tracks/03-privacy.md, tracks/04-business.md, tracks/06-security.md and tracks/08-realworld.md.
- Community: Discord https://discord.gg/nearprotocol, Telegram https://t.me/nearbuilderschat, X https://x.com/NEARProtocol, DevHub YouTube https://www.youtube.com/channel/UCq0iWZQuXhvP8yQzDZsmWfQ, track overview video https://www.youtube.com/watch?v=bND1ioWBf3g.
- Important: the rules file says a submission cannot be edited, yet the owner's list includes a request-changes page. In P14 the agent must read that page and report the official change process. It must not assume edits are possible.

### 8.6 Which references each block uses

| Block | References |
| --- | --- |
| P0 to P2 | 6.2 |
| P3 | 6.3, 8.4 |
| P4 | 6.3, 6.4, 8.4 |
| P5 | 6.6, 8.1 |
| P6 | None external (internal logic) |
| P7 | 6.3 (testing, access keys), 8.4; verify the NEP-297 event format in the NEAR standards docs |
| P8 | 6.5, 8.2 |
| P9 | 6.3, 6.4 |
| P10 | 6.3 (explorer), 8.4 (find the wallet connector through the llms.txt index) |
| P11 | 8.3 |
| P12 | 6.3 (testing) |
| P13 and P14 | 6.1, 8.5 |

### 8.7 Listed by the owner but deliberately out of scope

Aurora, HOT, Rhea, meme.cooking, HEX, SVRN, OutLayer, GoMining, Agent Market, Gulf Labs and BRRRAIN are not used by GetNear. The agent must not add dependencies or code for them. They do not help a testnet budget-and-approval agent, and listing sponsor tools the code does not use would be misleading. Their links are left out of this pack on purpose; keep them in your own notes.

