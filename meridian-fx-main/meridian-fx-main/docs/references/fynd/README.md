# Fynd Reference Docs

Split from the upstream LLM export so the monorepo has a searchable local copy of the docs.

Source: `https://docs.fynd.xyz/llms-full.txt`

Files:
- [`01-fynd-overview-and-design-principles.md`](./01-fynd-overview-and-design-principles.md) - Overview and design principles. High-level introduction, design goals, limitations, supported chains, and how Fynd works.
- [`02-fynd-quickstart-running-the-server-and-executing-swaps.md`](./02-fynd-quickstart-running-the-server-and-executing-swaps.md) - Quickstart: running the server and executing swaps. Getting started prerequisites, how to launch Fynd, and how to quote and execute swaps.
- [`03-fynd-server-configuration-worker-pools-blocklists-and-monitoring.md`](./03-fynd-server-configuration-worker-pools-blocklists-and-monitoring.md) - Server configuration, worker pools, blocklists, and monitoring. Runtime flags, worker pool tuning, blocklists, logging, metrics, and tuning guidance.
- [`04-fynd-encoding-options-slippage-transfer-types-and-transaction-shape.md`](./04-fynd-encoding-options-slippage-transfer-types-and-transaction-shape.md) - Encoding options, slippage, transfer types, and transaction shape. How quote encoding works, how slippage is applied, and what transaction objects look like.
- [`05-fynd-swap-cli-setup-examples-reference-and-troubleshooting.md`](./05-fynd-swap-cli-setup-examples-reference-and-troubleshooting.md) - Swap CLI setup, examples, reference, and troubleshooting. CLI-based quoting and swap execution, including dry-runs, permit flows, vault funds, and troubleshooting.
- [`06-fynd-client-fees-setup-signing-and-code-examples.md`](./06-fynd-client-fees-setup-signing-and-code-examples.md) - Client fees setup, signing, and code examples. Fee model, configuration, EIP-712 signing, and implementation examples.
- [`07-fynd-benchmarking-load-testing-solver-comparison-and-cpu-scaling.md`](./07-fynd-benchmarking-load-testing-solver-comparison-and-cpu-scaling.md) - Benchmarking, load testing, solver comparison, and CPU scaling. How to benchmark solver performance under sequential, concurrent, and comparative workloads.
- [`08-fynd-custom-algorithm-extension-points-and-example.md`](./08-fynd-custom-algorithm-extension-points-and-example.md) - Custom algorithm extension points and example. How to implement the Algorithm trait, wire in a custom algorithm, and run the example.
- [`09-fynd-routing-algorithms-overview-and-built-in-strategies.md`](./09-fynd-routing-algorithms-overview-and-built-in-strategies.md) - Routing algorithms overview and built-in strategies. Routing problem framing, how algorithms plug into Fynd, and the built-in strategy lineup.
- [`10-fynd-most-liquid-algorithm-path-enumeration-and-ranking.md`](./10-fynd-most-liquid-algorithm-path-enumeration-and-ranking.md) - Most Liquid algorithm: path enumeration and ranking. Detailed walk-through of the most_liquid algorithm and where it performs well or poorly.
- [`11-fynd-bellman-ford-algorithm-design-tradeoffs-and-faq.md`](./11-fynd-bellman-ford-algorithm-design-tradeoffs-and-faq.md) - Bellman-Ford algorithm design, tradeoffs, and FAQ. Deep dive into the Bellman-Ford variant used by Fynd, including design rationale and examples.
- [`12-fynd-api-reference-health-quote-and-schema-objects.md`](./12-fynd-api-reference-health-quote-and-schema-objects.md) - API reference: health, quote, and schema objects. HTTP endpoints plus request and response object definitions.
- [`13-fynd-architecture-components-data-flow-and-threading-model.md`](./13-fynd-architecture-components-data-flow-and-threading-model.md) - Architecture, components, data flow, and threading model. System architecture overview including components, data flow, and concurrency model.
- [`14-fynd-performance-benchmarks-and-algorithm-comparisons.md`](./14-fynd-performance-benchmarks-and-algorithm-comparisons.md) - Performance benchmarks and algorithm comparisons. Published performance results across CPU counts, hop counts, and algorithm choices.
- [`llms-full.txt`](./llms-full.txt) - Full upstream export kept locally for exact-text searching and re-splitting.

Notes:
- The split is based on top-level `#` sections from the upstream file.
- The source includes GitBook formatting markers such as `{% hint %}` and `{% tabs %}`; those were preserved verbatim.
