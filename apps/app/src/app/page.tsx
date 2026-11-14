"use client";

import Link from "next/link";
import { useRef } from "react";
import { ArrowRight, GitBranch } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { TickerTape } from "@/components/ticker-tape";
import { SiteFooter } from "@/components/site-footer";
import { AsciiScene } from "@/components/ascii-scene";
import { AsciiField } from "@/components/ascii-field";
import { ScrambleText } from "@/components/scramble-text";
import { Reveal } from "@/components/reveal";
import { RateChart } from "@/components/rate-chart";
import { LiveFeed } from "@/components/live-feed";
import { Card } from "@/components/card";
import { Stat } from "@/components/ascii-viz";
import { useFeed, useOraclePrice } from "@/lib/live";

const REPO = "https://github.com/ChilliRoger/GetNear";
const NB = "https://testnet.nearblocks.io/txns";

const guarantees = [
  { n: "01", title: "Limits live on-chain", desc: "Max chunk, total budget, deadline and minimum interval are enforced by the Rust contract, not by the agent." },
  { n: "02", title: "DAO approves big payments", desc: "Invoices above the auto-cap stay Pending until a Sputnik DAO council votes 2-of-3." },
  { n: "03", title: "A key that can only pay", desc: "The agent holds a function-call key restricted to execute_chunk. It cannot approve, expire or change limits." },
  { n: "04", title: "Paid only when paid", desc: "The balance drops inside a contract callback after the NEP-141 transfer succeeds. A retry can never pay twice." },
];

const flow = [
  { step: "FUND", desc: "Lock Circle testnet USDC against an invoice target in EURe." },
  { step: "APPROVE", desc: "Over $100 the DAO votes 2-of-3. Under it, the order is active at once." },
  { step: "TIME", desc: "The agent scores live quotes against ECB and the deadline, then pays in chunks." },
  { step: "SETTLE", desc: "Demo EURe reaches the supplier, the due amount falls, unspent escrow is refunded." },
];

const realVsSim = [
  { what: "1Click dry quote vs ECB reference", status: "REAL DATA", tone: "text-ok", note: "Indicative only. Nothing is executed." },
  { what: "USDC → EUR conversion", status: "SIMULATED", tone: "text-warn", note: "No cross-chain swap happens on testnet." },
  { what: "Circle testnet USDC escrow", status: "REAL TESTNET TOKENS", tone: "text-ok", note: "Locked in the contract, refundable." },
  { what: "EURe supplier payout", status: "REAL TESTNET TRANSFER", tone: "text-ok", note: "A team-minted demo token, confirmed by callback." },
  { what: "Price deviation check", status: "AGENT-REPORTED", tone: "text-warn", note: "Policy check, not oracle-verified on-chain." },
];

export default function LandingPage() {
  const hero = useRef<HTMLElement>(null);
  const { data: price } = useOraclePrice();
  const { data: feed } = useFeed();
  const p = price?.["USDC/EURe"];

  // Pointer spotlight over the hero art.
  const onMove = (e: React.PointerEvent<HTMLElement>) => {
    const el = hero.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-dashed border-warn/40 bg-warn/5 px-4 py-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-warn">
        Testnet-only hackathon prototype · no mainnet funds · mainnet is roadmap, not shipped
      </div>

      <header className="sticky top-0 z-40 border-b border-border-bright bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
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
      </header>

      <TickerTape />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section
        ref={hero}
        onPointerMove={onMove}
        className="scanlines relative isolate overflow-hidden border-b border-dashed border-border-bright"
        style={{ minHeight: "min(92vh, 780px)" }}
      >
        <AsciiScene className="absolute inset-x-0 bottom-0 top-0 -z-10 opacity-90" />
        {/* readability + blend */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-background to-transparent" />
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background: "radial-gradient(260px circle at var(--mx, 70%) var(--my, 40%), rgb(63 230 255 / 0.14), transparent 70%)",
          }}
        />

        <div className="mx-auto flex min-h-[inherit] max-w-6xl flex-col justify-center px-4 py-20">
          <Reveal>
            <p className="eyebrow mb-5 flex items-center gap-3">
              <span className="live-dot" /> NEAR testnet · Sputnik DAO · 1Click dry quotes
            </p>
          </Reveal>
          <h1 className="max-w-3xl text-4xl font-bold uppercase leading-[1.08] tracking-tight sm:text-5xl md:text-6xl">
            <ScrambleText text="Pay invoices inside limits" delay={150} />
            <br />
            <span className="text-brand glow-brand">
              <ScrambleText text="your agent can't break." delay={650} duration={1100} />
            </span>
            <span className="blink ml-1 text-brand">▮</span>
          </h1>
          <Reveal delay={200}>
            <p className="mt-6 max-w-xl text-sm leading-7 text-muted md:text-base">
              GetNear pays euro supplier invoices from USDC in timed chunks, under on-chain limits and DAO approval, and marks an
              invoice paid only when the transfer really happened.
            </p>
          </Reveal>
          <Reveal delay={320}>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/dashboard" className="btn-primary">
                Open the dashboard <ArrowRight size={14} />
              </Link>
              <Link href="/trade" className="btn-secondary">
                Create an invoice order
              </Link>
              <a href="#live" className="btn-secondary">
                See it live ↓
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Live strip ───────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <Reveal>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="1Click quote" value={p ? p.quotePrice.toFixed(4) : "--"} caption="EURe per USDC · dry quote" tone="brand" />
            <Stat label="ECB reference" value={p ? p.refPrice.toFixed(4) : "--"} caption="Frankfurter / ECB" />
            <Stat
              label="Deviation"
              value={typeof p?.deviationBps === "number" ? `${p.deviationBps > 0 ? "+" : ""}${p.deviationBps} bps` : "--"}
              caption="limit per order: 120 bps"
              tone={typeof p?.deviationBps === "number" && Math.abs(p.deviationBps) > 120 ? "warn" : "ok"}
            />
            <Stat
              label="Agent"
              value={feed?.online ? "ONLINE" : "OFFLINE"}
              caption={feed?.agent ? `${feed.agent.strategyMode ?? "score"} mode` : "pnpm agent:start"}
              tone={feed?.online ? "ok" : "default"}
            />
          </div>
        </Reveal>
      </section>

      {/* ── Live market + decisions ──────────────────────────── */}
      <section id="live" className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 lg:grid-cols-5">
        <Reveal className="lg:col-span-3">
          <Card title="Rate history" subtitle="USDC → EURe: 1Click dry quote against the ECB reference rate. Hover the chart to inspect.">
            <RateChart height={300} />
          </Card>
        </Reveal>
        <Reveal delay={120} className="lg:col-span-2">
          <Card title="Live agent feed" subtitle="Every decision the agent makes, with its reason. New rows flash in.">
            <LiveFeed rows={9} />
          </Card>
        </Reveal>
      </section>

      {/* ── Guarantees ───────────────────────────────────────── */}
      <section className="border-y border-dashed border-border-bright bg-surface/40">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <Reveal>
            <p className="eyebrow">What the agent cannot do</p>
            <h2 className="mt-2 max-w-2xl text-2xl font-bold uppercase tracking-tight md:text-3xl">Safety comes from the contract, not trust.</h2>
          </Reveal>
          <div className="mt-10 grid gap-px bg-border-bright/40 sm:grid-cols-2 lg:grid-cols-4">
            {guarantees.map((g, i) => (
              <Reveal key={g.n} delay={i * 90} className="bg-background p-6">
                <div className="text-3xl font-bold text-border-bright">{g.n}</div>
                <h3 className="mt-4 text-sm font-semibold uppercase tracking-[0.12em] text-brand">{g.title}</h3>
                <p className="mt-2 text-xs leading-6 text-muted">{g.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Flow ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <Reveal>
          <p className="eyebrow">How a payment flows</p>
        </Reveal>
        <ol className="mt-8 grid gap-4 md:grid-cols-4">
          {flow.map((f, i) => (
            <Reveal as="li" key={f.step} delay={i * 110} className="relative border border-dashed border-border-bright bg-surface/60 p-5">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted">step {i + 1}</div>
              <div className="mt-1 text-lg font-bold tracking-[0.12em] text-foreground">{f.step}</div>
              <p className="mt-3 text-xs leading-6 text-muted">{f.desc}</p>
              {i < flow.length - 1 && <span className="absolute -right-[15px] top-1/2 z-10 hidden -translate-y-1/2 text-brand md:block">▶</span>}
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ── Evidence + honesty ───────────────────────────────── */}
      <section className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 lg:grid-cols-2">
        <Reveal>
          <Card title="Verified on testnet · Order #13" badge={{ label: "Completed", color: "green" }} subtitle="INV-FINAL-CHUNK · demo EURe payout · simulated FX">
            <dl className="space-y-3 text-sm">
              <Row label="Escrow funded" value="$10.000000 USDC" href={`${NB}/ZnaHzUsMawWiTTAa5RrbfqTeQQqyhn8vY6tb41b7nMd`} />
              <Row label="Invoice paid (final chunk)" value="€5.00 EURe" href={`${NB}/6eAGwbnBR8X5Q72J8kf8tPMPaChHSJ5Ma9zmBmzLM7of`} />
              <Row label="USDC charged" value="$5.541224" />
              <Row label="Unspent escrow refunded" value="$4.458776" href={`${NB}/63pmWkCcViJShmXwgwELG5uUTbn5TBCRAHjv7Di2pFha`} />
            </dl>
            <p className="mt-5 border-t border-dashed border-border-bright pt-3 text-[11px] text-muted">
              Verify without a wallet: <code className="text-brand">pnpm verify:readonly</code>
            </p>
          </Card>
        </Reveal>
        <Reveal delay={120}>
          <Card title="Real vs simulated" subtitle="We label every layer. No savings claims, no mainnet claims.">
            <table className="w-full text-left text-xs">
              <tbody className="divide-y divide-dashed divide-border">
                {realVsSim.map((r) => (
                  <tr key={r.what}>
                    <td className="py-2.5 pr-3 text-foreground/90">{r.what}</td>
                    <td className={`py-2.5 text-right font-semibold tracking-wider ${r.tone}`}>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Reveal>
      </section>

      {/* ── Interactive CTA ──────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-dashed border-border-bright">
        <AsciiField height={300} className="absolute inset-0 h-full" />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center">
          <Reveal>
            <h2 className="text-3xl font-bold uppercase tracking-tight md:text-4xl">Try it on testnet.</h2>
            <p className="mx-auto mt-3 max-w-md text-xs leading-6 text-muted">Free demo tokens, real contract, real DAO votes. Move your pointer over the field.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/dashboard" className="btn-primary">
                Launch app <ArrowRight size={14} />
              </Link>
              <a href={REPO} target="_blank" rel="noopener noreferrer" className="btn-secondary">
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

function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-border pb-3 last:border-0 last:pb-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm font-semibold">
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
