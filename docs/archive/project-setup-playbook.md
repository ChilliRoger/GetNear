# Hackathon Project Setup Playbook

Instructions for Claude (the orchestrator) to transform planning documents and a repo into a build-ready monorepo with validated architecture, parallel-track infrastructure, and progressive discovery docs.

This process was battle-tested on the OmniPass project (ETHGlobal Cannes 2026). It took ~2 hours wall-clock with heavy parallelization. Every step exists because skipping it caused real pain in past sessions.

---

## Prerequisites

### What the user provides
1. **Repository** — a GitHub repo (may be empty or contain planning docs)
2. **Planning documents** — PDFs or markdown. You need at minimum:
   - A battle plan / strategy doc (what to build, why, prize targets)
   - A technical spec (architecture, components, code patterns)
   - An unknowns / risk register (what hasn't been validated)
   - Optional: setup checklist, stretch goals, overview/pitch doc
3. **Git identity** — which SSH key + username for commits, which account for `gh` CLI
4. **Timeline** — hours available for the build. This drives plan compression.

### Tools required
- `gh` CLI (authenticated)
- `pdftotext` (from poppler-utils) for PDF docs
- `git` with SSH access
- Web search capability (for PoC research agents)
- Subagent dispatch (Agent tool)

---

## Wave 1: Ingest Planning Documents

**Goal:** Build a complete mental model before writing a single line of code.

### Reading Order

This order is deliberate — each doc adds a lens for reading the next:

1. **Battle Plan / Strategy** — read FIRST. Establishes the "why": prize targets, competition estimates, what matters for judging. Everything else is read through this strategic lens.
2. **Overview / Pitch** — the high-level architecture and narrative. Now you understand what's being built AND why the architecture was chosen.
3. **Unknowns & PoCs** — what has NOT been validated. This is the most important doc for Wave 2. Reading it after the strategy and overview means you can immediately rank unknowns by their impact on prize eligibility.
4. **Technical Spec** — detailed components, code patterns, timeline. You now have context to evaluate whether each technical choice serves the strategy.
5. **Pre-Hackathon Setup** — accounts, keys, wallets, test data. Practical checklist.
6. **Stretch Goals / Additional Docs** — anything else, lowest priority.

### What to extract while reading

As you read, actively note:
- **One-sentence product description**
- **Prize strategy** — target tracks, EV estimates, pivot scenarios
- **Tech stack** — every framework, chain, SDK, API mentioned
- **Parallel tracks** — which workstreams are independent
- **Integration boundaries** — where tracks must exchange data (these become adapter interfaces)
- **Unknowns** — every assumption not yet validated with working code
- **"Never cut" list** — features without which the submission is dead
- **Fallback chain** — for every risky component, the simpler alternative

### Why this order matters

I learned this the hard way. When you read "use Flare TEE Extensions" in a technical spec without strategic context, you might spend hours researching TEE tooling. With the battle plan context, you know it targets an $8K bounty, has a SignedOracle fallback, and the TEE is the means not the end. The strategy doc prevents you from over-investing in any single technical choice.

---

## Wave 2: Validate Project-Killer Unknowns

**Goal:** Confirm or kill the riskiest assumptions BEFORE writing code.

This is the single highest-ROI step. In OmniPass, ALL THREE research agents returned results that changed the architecture. Without this step, we would have built against three wrong assumptions and had to rewrite everything.

### How to identify project-killers

From the unknowns doc and your own reading, find assumptions where:
- If wrong, the architecture must fundamentally change (not just a bug fix)
- The fallback is a completely different approach
- The answer requires checking SDK source code or testing, not just reading marketing pages

### Dispatch parallel research agents

For each unknown, dispatch a `web-researcher` subagent. Use this prompt structure:

```
Research whether [specific capability] exists and is usable.

## Context
[Why this matters for the project. What the fallback is if negative.]

## Investigate
1. [Specific thing to check — e.g., "Does the SDK accept image input?"]
2. [Specific thing to check — e.g., "Is this feature launched or roadmap?"]
3. [Specific thing to check — e.g., "Does it work in the target runtime?"]

## Report back with
- CONFIRMED: works with evidence
- LIKELY: docs suggest it but unverified
- UNLIKELY: no evidence of support
- FAIL: confirmed it doesn't work

Include code examples, API endpoints, or model names you find.
```

**Key lessons from OmniPass research agents:**
- Be extremely specific in what to investigate. "Tell me about 0G" produces fluff. "Does qwen3-vl-30b accept base64 image input via the OpenAI-compatible API?" produces actionable answers.
- Ask agents to check SDK source code and GitHub issues, not just docs. Marketing pages lie. The 0G docs said "vision-language services" were live — the SDK source revealed the vision model was text-only.
- Always include the fallback in the prompt context. The agent can evaluate whether the fallback is viable while researching the primary.

### Process results

When agents return:
1. Update architecture decisions based on verdicts
2. For every FAIL or UNLIKELY: confirm the fallback is viable
3. Write a POC_RESULTS.md capturing all findings with evidence
4. These results feed directly into the BUILD_PLAN.md decision gates

### Parallelization

Dispatch ALL research agents simultaneously — they're independent. While they run, start Wave 3 (scaffold). The scaffold uses adapter interfaces, so architecture changes from research require zero structural rework — you just flip which implementation is "primary" vs "fallback."

---

## Wave 3: Scaffold Monorepo

**Goal:** Create the full project structure with working stubs so parallel tracks can start immediately.

### Dispatch a scaffold agent

Give it an extremely detailed prompt specifying:
- Every directory and file to create
- Framework and tooling per package
- The adapter interfaces (code-level detail)
- Stub implementations returning realistic mock data
- .env.template, .gitignore, test data, README

The scaffold agent does the tedious bulk creation. You review the output.

### The Adapter Interface Pattern

This is the load-bearing architectural decision of the entire setup. Get this right and everything downstream works. Get it wrong and integration becomes a nightmare.

**The concept:**
```
Track A (consumer) ──→ IServiceAdapter ←── Track B (primary impl)
                                       ←── Track B (fallback impl)
```

- Identify every point where parallel tracks exchange data
- Define a typed interface at each boundary
- Create a factory function that selects implementation via env var
- Create stub implementations returning mock data
- The consuming track imports ONLY the interface via factory — never an implementation

**Why this is non-negotiable:**
- Tracks develop against mocks without waiting for each other
- Every risky component has primary + fallback behind the same interface  
- Swapping implementations requires ZERO consuming code changes — one env var
- Integration at the end is "plug in real implementation" not "rewrite glue code"

**Template:**
```typescript
// THE CONTRACT between tracks
interface IServiceAdapter {
  doThing(input: InputType): Promise<OutputType>
}

// Factory picks implementation from env
function createServiceAdapter(): IServiceAdapter {
  if (process.env.USE_PRIMARY === 'true') return new PrimaryImpl()
  return new FallbackImpl()
}

// Stub for development — returns realistic mock data
class StubImpl implements IServiceAdapter {
  async doThing(input: InputType): Promise<OutputType> {
    return { /* realistic mock */ verificationMethod: 'stub' }
  }
}
```

**How to find boundaries:** Ask "Where does Track X need output from Track Y?" Every such point gets an interface + factory + stub.

This pattern works for any project — not just blockchain. ML pipelines, API integrations, payment processors, data sources — anywhere parallel work must eventually converge.

---

## Wave 4: Create Build Plan

**Goal:** Compress the planning docs timeline to match actual hours and create a document any agent can follow.

Write `BUILD_PLAN.md` with these sections:

1. **Integration Boundaries** — reproduce adapter interfaces with a diagram showing producer/consumer relationships
2. **Decision Gates — RESOLVED** — table of PoC results and decisions (fill in when Wave 2 completes)
3. **Hour-by-Hour Timeline** — phases (Foundation, Core, Integration, Polish, Ship), each with Hour|Task|Deliverable tables and Checkpoint test cases
4. **Guardrails:**
   - Time-box rule: ">45 min over estimate → use fallback immediately"
   - Commit discipline: "commit at EVERY checkpoint"
   - Simplification ladder: ordered cut list (stretch → nice-to-have → desperate → never-cut)
5. **Parallel Track Dependencies** — ASCII timeline showing independent and convergence phases

---

## Wave 5: Set Up Project Management

**Goal:** GitHub infrastructure for tracking parallel work.

1. **Gitflow:**
   - `main` is sacred — only tagged releases
   - Create `develop` from main, push both
   - Tag main as `v0.1.0` ("Foundation: scaffold + adapter interfaces")
   - Track branches: `track-{name}/feature-description` → PR into develop

2. **Labels** (via `gh label create`, delete defaults first):
   - `track/*` — one per parallel workstream, distinct colors
   - `priority/critical`, `priority/stretch`
   - `status/blocked`, `status/gate`
   - `type/feature`, `type/infra`, `type/bug`, `type/process`

3. **Milestones:** v0.1.0 Foundation (close immediately), v0.2.0 Core Features, v0.3.0 Integration, v0.4.0 Demo Ready, v1.0.0 Shipped

4. **Issues** with structured bodies:
   ```
   ## Deliverable
   What "done" looks like with test cases.
   ## Blocked By
   #issue numbers or "None"
   ## Fallback
   What to do if stuck >45min.
   ## Checkpoint
   Which checkpoint this contributes to.
   ```

5. **Call out unblocked starting points** — issues with no blockers where work begins.

---

## Wave 6: Build Progressive Discovery Docs

**Goal:** Documentation that agents navigate efficiently — reading only what's relevant.

### Structure

```
Root AGENTS.md (under 500 lines, index + cross-cutting rules)
├── Package-level AGENTS.md (50-120 lines each, local rules)
└── docs/
    ├── reference/     (read for context)
    │   ├── architecture-decisions.md
    │   ├── poc-results.md
    │   ├── prize-strategy.md
    │   └── sponsor-tech.md
    ├── guides/        (read for current task)
    │   ├── track-a-*.md
    │   ├── track-b-*.md
    │   ├── track-c-*.md
    │   └── deployment.md
    └── conventions/   (always applicable)
        ├── gitflow.md
        ├── adapter-interfaces.md
        └── code-review.md
```

Create `CLAUDE.md → AGENTS.md` symlinks at every level.

### Two-agent sequence

1. **Agent 1:** Create nested AGENTS.md files. Must read actual source code to write accurate rules.
2. **Agent 2:** Create docs/ structure. Extract from planning PDFs into appropriate files.
3. **You (orchestrator):** Review root AGENTS.md for accuracy and under-500-line constraint.

---

## Wave 7: Build Support Tools

- **Devil's advocate** — contrarian review using a DIFFERENT model (Gemini, Codex). Structured output: assumptions challenged, weakest points, alternatives, verdict.
- **PR review pipeline** — parallel review agents (Bug Hunter + Architect), consolidation, categorized findings.
- **Wallet management** — if blockchain project, ONE agent manages ALL wallets through ONE secrets manager. Never let two agents create wallets independently.
- **Secrets management** — varlock or similar. `.env.schema` as single source of truth.

---

## Wave 8: Create Setup Issue

Create and close a GitHub Issue documenting everything:
- Title: `[Setup] Project foundation — repo scaffold, PoC research, PM infrastructure`
- Body: wave-by-wave process, commits, agent results, validated architecture, tools built, unblocked starting points, replication instructions
- Close under Foundation milestone

This issue becomes the project's institutional memory.

---

## Parallelization

```
Wave 1 (Read Docs) ─────────────────────────────┐
  │                                               │
  ├──→ Wave 2 (PoC Research agents) ─────┐       │
  │                                       │       │
  └──→ Wave 3 (Scaffold agent) ──────────┼──→ Wave 4 (Build Plan)
                                          │       │
                              Update arch ┘       ├──→ Wave 5 (PM Setup)
                              decisions           │
                                                  ├──→ Wave 6 (Docs)
                                                  │
                                                  ├──→ Wave 7 (Tools)
                                                  │
                                                  └──→ Wave 8 (Setup Issue)
```

Wall-clock with full parallelization: **~2 hours.**
Critical path: Wave 1 → Wave 2 → Wave 4 → Wave 5 → Wave 8 (~75-110 min).

---

## Anti-Patterns

1. **Don't skip PoC validation.** In OmniPass, 3/3 unknowns came back negative or modified. Building without validation would have wasted 10+ hours on wrong assumptions.

2. **Don't put everything in one AGENTS.md.** Progressive discovery exists because a 2000-line instruction file wastes agent context on irrelevant rules.

3. **Don't let the orchestrator write implementation code.** Your job is coordination, dispatch, and review. Delegate everything else. When I tried to do implementation work directly, mistakes compounded and context got polluted.

4. **Don't create multiple wallets with multiple agents.** One agent, one secrets manager, one wallet. Reconciliation is painful.

5. **Don't start coding before adapter interfaces are defined.** They're the load-bearing wall. Define, review, then build.

6. **Don't treat docs as optional follow-up.** AGENTS.md files are agent instructions, not documentation. Without them, every future agent session wastes 20 minutes discovering what you already know.

7. **Don't trust SDK marketing pages.** "Supports vision inference" might mean "on our roadmap." Validate with SDK source, API enums, and GitHub issues. This is exactly what Wave 2 research agents do.
