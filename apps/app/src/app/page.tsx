"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck, GitBranch, KeyRound, Landmark, Scale } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { TickerTape } from "@/components/ticker-tape";
import { SiteFooter } from "@/components/site-footer";
import { AsciiScene } from "@/components/ascii-scene";
import { AsciiField } from "@/components/ascii-field";
import { Reveal } from "@/components/reveal";
import { RateChart } from "@/components/rate-chart";
import { LiveFeed } from "@/components/live-feed";
import { Card } from "@/components/card";
import { KpiStrip } from "@/components/ascii-viz";
import { useFeed, useOraclePrice } from "@/lib/live";

const REPO = "https://github.com/ChilliRoger/GetNear";
const NB = "https://testnet.nearblocks.io/txns";

const guarantees = [
  { Icon: Scale, title: "Limits live on-chain", desc: "Max chunk, total budget, deadline and minimum interval are enforced by the Rust contract, not by the agent." },
  { Icon: Landmark, title: "DAO approves big payments", desc: "Invoices above the auto-cap stay Pending until a Sputnik DAO council votes 2-of-3." },
  { Icon: KeyRound, title: "A key that can only pay", desc: "The agent holds a function-call key restricted to execute_chunk. It cannot approve, expire or change limits." },
  { Icon: BadgeCheck, title: "Paid only when paid", desc: "The balance drops inside a contract callback after the NEP-141 transfer succeeds. A retry can never pay twice." },
];

const flow = [
  { step: "Fund", desc: "Lock Circle testnet USDC against an invoice target in EURe." },
  { step: "Approve", desc: "Over $100 the DAO votes 2-of-3. Under it, the order is active at once." },
  { step: "Time", desc: "The agent scores live quotes against ECB and the deadline, then pays in chunks." },
  { step: "Settle", desc: "Demo EURe reaches the supplier, the due amount falls, unspent escrow is refunded." },
];

const realVsSim = [
  { what: "1Click dry quote vs ECB reference", status: "Real data", tone: "text-ok", note: "Indicative only. Nothing is executed." },
  { what: "USDC to EUR conversion", status: "Simulated", tone: "text-warn", note: "No cross-chain swap happens on testnet." },
  { what: "Circle testnet USDC escrow", status: "Real testnet tokens", tone: "text-ok", note: "Locked in the contract, refundable." },
  { what: "EURe supplier payout", status: "Real testnet transfer", tone: "text-ok", note: "A team-minted demo token, confirmed by callback." },
  { what: "Price deviation check", status: "Agent-reported", tone: "text-warn", note: "Policy check, not oracle-verified on-chain." },
];

export default function LandingPage() {
  const { data: price } = useOraclePrice();
  const { data: feed } = useFeed();
  const p = price?.["USDC/EURe"];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-4">
          <BrandMark />
          <div className="flex items-center gap-2">
            <a href={REPO} target="_blank" rel="noopener noreferrer" className="btn-secondary hidden sm:inline-flex">
              <GitBranch size={14} /> Source
            </a>
            <Link href="/dashboard" className="btn-primary">
              Launch app <ArrowRight size={14} />
            </Link>
          </div>
        </div>
        <TickerTape />
      </header>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 py-14 lg:grid-cols-[1fr_minmax(0,560px)] lg:py-20">
        <div>
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-border-bright bg-surface px-3 py-1 text-xs text-muted">
              <span className="live-dot" /> Live on NEAR testnet · Sputnik DAO · 1Click dry quotes
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
              Pay supplier invoices inside limits your agent <span className="text-brand">can&apos;t break.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-muted">
              GetNear pays euro invoices from USDC in timed chunks, under on-chain limits and DAO approval, and marks an invoice paid only
              when the transfer really happened.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/dashboard" className="btn-primary h-10 px-5">
                Open the dashboard <ArrowRight size={14} />
              </Link>
              <Link href="/trade" className="btn-secondary h-10 px-5">
                Create an invoice order
              </Link>
            </div>
            <dl className="mt-10 grid max-w-xl grid-cols-3 gap-6 border-t border-border pt-6 text-sm">
              {[
                ["2 of 3", "DAO council approval"],
                ["1 method", "agent key can call"],
                ["0", "double payments possible"],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="num text-xl font-semibold">{v}</dt>
                  <dd className="mt-1 text-xs text-muted">{l}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        <Reveal delay={200}>
          <div className="rounded-xl border border-border bg-surface shadow-pop">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-xs">
              <span className="flex items-center gap-2 font-medium">
                <span className="live-dot" /> USDC / EURe
              </span>
              <span className="text-muted">Live · dry quote vs ECB</span>
            </div>
            <div className="p-4">
              <RateChart height={230} defaultHours={6} />
            </div>
            <div className="grid grid-cols-3 divide-x divide-border border-t border-border text-xs">
              <Cell label="Quote" value={p ? p.quotePrice.toFixed(4) : "--"} />
              <Cell label="ECB" value={p ? p.refPrice.toFixed(4) : "--"} />
              <Cell
                label="Deviation"
                value={typeof p?.deviationBps === "number" ? `${p.deviationBps > 0 ? "+" : ""}${p.deviationBps} bps` : "--"}
                tone={typeof p?.deviationBps === "number" && Math.abs(p.deviationBps) > 120 ? "text-warn" : "text-ok"}
              />
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── ASCII harbour band ─────────────────────────────── */}
      <section className="relative isolate h-[300px] overflow-hidden border-y border-border md:h-[420px]">
        <AsciiScene className="absolute inset-0 -z-10" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-transparent to-background" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-background/90 via-background/30 to-transparent" />
        <div className="mx-auto flex h-full max-w-[1280px] items-end px-4 pb-8">
          <Reveal>
            <p className="text-xs font-semibold text-brand">Every step is auditable</p>
            <p className="mt-2 max-w-md text-2xl font-semibold leading-snug tracking-tight">
              Funding, approvals, chunks and refunds, each one a NEARBlocks link.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Live feed + verified order ─────────────────────── */}
      <section className="mx-auto grid max-w-[1280px] gap-4 px-4 py-14 lg:grid-cols-12">
        <Reveal className="lg:col-span-7">
          <Card title="Live agent feed" subtitle="Every decision with its reason, newest first">
            <LiveFeed rows={9} />
          </Card>
        </Reveal>
        <Reveal delay={100} className="lg:col-span-5">
          <Card title="Verified on testnet: Order #13" subtitle="INV-FINAL-CHUNK · demo EURe payout · simulated FX" badge={{ label: "Completed", color: "green" }}>
            <dl className="divide-y divide-border text-sm">
              <Row label="Escrow funded" value="$10.000000 USDC" href={`${NB}/ZnaHzUsMawWiTTAa5RrbfqTeQQqyhn8vY6tb41b7nMd`} />
              <Row label="Invoice paid (final chunk)" value="€5.00 EURe" href={`${NB}/6eAGwbnBR8X5Q72J8kf8tPMPaChHSJ5Ma9zmBmzLM7of`} />
              <Row label="USDC charged" value="$5.541224" />
              <Row label="Unspent escrow refunded" value="$4.458776" href={`${NB}/63pmWkCcViJShmXwgwELG5uUTbn5TBCRAHjv7Di2pFha`} />
            </dl>
            <p className="mt-4 text-xs text-muted">
              Verify without a wallet: <code className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-brand">pnpm verify:readonly</code>
            </p>
          </Card>
        </Reveal>
      </section>

      {/* ── Guarantees ─────────────────────────────────────── */}
      <section className="border-t border-border bg-surface/40">
        <div className="mx-auto max-w-[1280px] px-4 py-14">
          <Reveal>
            <h2 className="text-2xl font-semibold tracking-tight">What the agent cannot do</h2>
            <p className="mt-2 max-w-xl text-sm text-muted">Safety comes from the contract and the key, not from trusting the agent.</p>
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {guarantees.map(({ Icon, title, desc }, i) => (
              <Reveal key={title} delay={i * 80}>
                <div className="h-full rounded-lg border border-border bg-surface p-5">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-brand/10 text-brand">
                    <Icon size={18} />
                  </span>
                  <h3 className="mt-4 text-sm font-semibold">{title}</h3>
                  <p className="mt-1.5 text-[13px] leading-6 text-muted">{desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Flow ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1280px] px-4 py-14">
        <Reveal>
          <h2 className="text-2xl font-semibold tracking-tight">How a payment flows</h2>
        </Reveal>
        <ol className="mt-8 grid gap-4 md:grid-cols-4">
          {flow.map((f, i) => (
            <Reveal as="li" key={f.step} delay={i * 90}>
              <div className="relative h-full rounded-lg border border-border bg-surface p-5">
                <span className="num flex h-7 w-7 items-center justify-center rounded-full border border-brand/50 text-xs font-semibold text-brand">{i + 1}</span>
                <h3 className="mt-3 text-sm font-semibold">{f.step}</h3>
                <p className="mt-1.5 text-[13px] leading-6 text-muted">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ── Real vs simulated ──────────────────────────────── */}
      <section className="mx-auto max-w-[1280px] px-4 pb-14">
        <Reveal>
          <Card title="What is real and what is simulated" subtitle="Every layer is labelled. No savings claims, no mainnet claims." flush>
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="th">Layer</th>
                  <th className="th">Status</th>
                  <th className="th hidden sm:table-cell">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {realVsSim.map((r) => (
                  <tr key={r.what}>
                    <td className="px-3 py-2.5">{r.what}</td>
                    <td className={`px-3 py-2.5 font-medium ${r.tone}`}>{r.status}</td>
                    <td className="hidden px-3 py-2.5 text-muted sm:table-cell">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Reveal>
        <div className="mt-4">
          <KpiStrip
            items={[
              { label: "1Click quote", value: p ? p.quotePrice.toFixed(4) : "--", sub: "EURe per USDC", tone: "brand" },
              { label: "ECB reference", value: p ? p.refPrice.toFixed(4) : "--", sub: "EUR per USD" },
              { label: "Agent", value: feed?.online ? "Online" : "Offline", sub: feed?.agent ? `${feed.agent.strategyMode ?? "score"} mode` : "pnpm agent:start", tone: feed?.online ? "ok" : "default" },
              { label: "Network", value: "Testnet", sub: "no mainnet funds", tone: "warn" },
            ]}
          />
        </div>
      </section>

      {/* ── Interactive CTA ────────────────────────────────── */}
      <section className="relative isolate overflow-hidden border-t border-border">
        <AsciiField height={280} className="absolute inset-0 -z-10 h-full opacity-80" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-background/40 to-background" />
        <div className="mx-auto flex max-w-[1280px] flex-col items-center px-4 py-20 text-center">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight">Try it on testnet</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted">Free demo tokens, a real contract and real DAO votes. Move your pointer over the field.</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link href="/dashboard" className="btn-primary h-10 px-5">
                Launch app <ArrowRight size={14} />
              </Link>
              <a href={REPO} target="_blank" rel="noopener noreferrer" className="btn-secondary h-10 px-5">
                <GitBranch size={14} /> Read the code
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function Cell({ label, value, tone = "text-foreground" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`num mt-0.5 text-sm font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="num text-[13px] font-semibold">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
            {value} ↗
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
