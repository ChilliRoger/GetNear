"use client";

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  GitBranch,
  KeyRound,
  Landmark,
  ListChecks,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { GetNearLogo } from "@/components/getnear-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { RateBar } from "@/components/rate-bar";

const REPO = "https://github.com/ChilliRoger/GetNear";
const NB = "https://testnet.nearblocks.io/txns";

const guarantees = [
  {
    Icon: Scale,
    title: "Limits enforced on-chain",
    desc: "Max chunk, total budget, deadline and minimum interval are checked by the Rust contract, not by the agent.",
  },
  {
    Icon: Landmark,
    title: "DAO approval for big payments",
    desc: "Invoices above the auto-cap stay Pending until a Sputnik DAO council votes 2-of-3.",
  },
  {
    Icon: KeyRound,
    title: "A key that can only pay",
    desc: "The agent holds a function-call key restricted to execute_chunk. It cannot approve orders or change limits.",
  },
  {
    Icon: BadgeCheck,
    title: "Paid only when it really paid",
    desc: "The invoice balance drops inside a contract callback after the NEP-141 transfer succeeds. Retries can never pay twice.",
  },
];

const steps = [
  { n: "1", title: "Create & fund", desc: "Lock Circle testnet USDC against an invoice target (EURe due)." },
  { n: "2", title: "Approve", desc: "Above $100 the DAO council votes. Under it, the order is active at once." },
  { n: "3", title: "Time the chunks", desc: "The agent scores live 1Click dry quotes against the ECB rate and the deadline, then pays in chunks." },
  { n: "4", title: "Settle & refund", desc: "Demo EURe goes to the supplier, the due amount falls, unspent escrow is refunded." },
];

const realVsSim = [
  { what: "1Click dry quote vs ECB reference rate", status: "Real data", tone: "text-brand", note: "Indicative only. Nothing is executed." },
  { what: "USDC → EUR conversion", status: "Simulated", tone: "text-warn", note: "No cross-chain swap happens on testnet." },
  { what: "Circle testnet USDC escrow", status: "Real testnet tokens", tone: "text-brand", note: "Locked in the contract, refundable." },
  { what: "EURe supplier payout", status: "Real testnet transfer", tone: "text-brand", note: "A team-minted demo token, confirmed by callback." },
  { what: "Price deviation check", status: "Agent-reported", tone: "text-warn", note: "Policy check, not oracle-verified on-chain." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-warn/30 bg-warn/10 px-4 py-1.5 text-center text-xs font-medium text-warn">
        Testnet-only hackathon prototype · no mainnet funds · mainnet is roadmap, not shipped
      </div>

      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <GetNearLogo size={34} cropped />
            <span className="text-base font-bold tracking-tight">GetNear</span>
          </Link>
          <div className="flex items-center gap-2">
            <a
              href={REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary hidden sm:inline-flex"
            >
              <GitBranch size={16} /> GitHub
            </a>
            <ThemeToggle />
            <Link href="/dashboard" className="btn-primary">
              Open app <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </header>

      <RateBar />

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
        <div className="flex flex-col justify-center">
          <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand ring-1 ring-inset ring-brand/25">
            <ShieldCheck size={14} /> NEAR testnet · Sputnik DAO · 1Click dry quotes
          </span>
          <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            Pay supplier invoices with limits your agent can&apos;t break.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            GetNear is a treasury agent for NEAR teams. It pays euro invoices from USDC in timed chunks, inside
            on-chain limits, with DAO approval for large payments, and marks an invoice paid only when the transfer
            actually happened.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/dashboard" className="btn-primary">
              Open the dashboard <ArrowRight size={16} />
            </Link>
            <Link href="/trade" className="btn-secondary">
              Create an invoice order
            </Link>
          </div>
        </div>

        {/* Verifiable example: Order #13 */}
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-pop">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Verified on testnet: Order #13</h2>
            <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[11px] font-medium text-brand ring-1 ring-inset ring-brand/25">
              Completed
            </span>
          </div>
          <p className="text-xs text-muted">Invoice INV-FINAL-CHUNK · demo EURe payout · simulated FX</p>
          <dl className="mt-5 space-y-3 text-sm">
            <Row label="Escrow funded" value="$10.000000 USDC" href={`${NB}/ZnaHzUsMawWiTTAa5RrbfqTeQQqyhn8vY6tb41b7nMd`} />
            <Row label="Invoice paid (final chunk)" value="€5.00 EURe" href={`${NB}/6eAGwbnBR8X5Q72J8kf8tPMPaChHSJ5Ma9zmBmzLM7of`} />
            <Row label="USDC charged" value="$5.541224" />
            <Row label="Unspent escrow refunded" value="$4.458776" href={`${NB}/63pmWkCcViJShmXwgwELG5uUTbn5TBCRAHjv7Di2pFha`} />
          </dl>
          <div className="mt-5 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
            Check it yourself, no wallet needed: <code className="font-mono text-foreground">pnpm verify:readonly</code>
          </div>
        </div>
      </section>

      {/* Guarantees */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-2xl font-bold tracking-tight">What the agent cannot do</h2>
          <p className="mt-2 max-w-2xl text-muted">Safety comes from the contract and the key, not from trusting the agent.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {guarantees.map(({ Icon, title, desc }) => (
              <div key={title} className="rounded-xl border border-border bg-background p-5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Icon size={18} />
                </div>
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm text-muted">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ListChecks size={22} className="text-brand" /> How a payment flows
        </h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-4">
          {steps.map((s) => (
            <li key={s.n} className="rounded-xl border border-border bg-surface p-5">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                {s.n}
              </span>
              <h3 className="mt-3 text-sm font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{s.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Honest labelling */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-2xl font-bold tracking-tight">What is real and what is simulated</h2>
          <div className="mt-6 overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Part</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {realVsSim.map((r) => (
                  <tr key={r.what}>
                    <td className="px-4 py-3">{r.what}</td>
                    <td className={`px-4 py-3 font-medium ${r.tone}`}>{r.status}</td>
                    <td className="hidden px-4 py-3 text-muted sm:table-cell">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>GetNear · MIT license · NEAR testnet hackathon prototype. No savings or mainnet claims.</p>
          <a href={REPO} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground">
            <GitBranch size={14} /> ChilliRoger/GetNear
          </a>
        </div>
      </footer>
    </div>
  );
}

function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-3 last:border-0 last:pb-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
