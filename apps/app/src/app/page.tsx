"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck, GitBranch, KeyRound, Landmark, ListChecks, Scale, TrendingUp } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { TickerTape } from "@/components/ticker-tape";
import { SiteFooter } from "@/components/site-footer";
import { AsciiScene } from "@/components/ascii-scene";
import { AsciiField } from "@/components/ascii-field";
import { Reveal } from "@/components/reveal";
import { RateChart } from "@/components/rate-chart";
import { LiveFeed } from "@/components/live-feed";
import { Card } from "@/components/card";
import { useOraclePrice } from "@/lib/live";

const REPO = "https://github.com/ChilliRoger/GetNear";
const NB = "https://testnet.nearblocks.io/txns";

const features = [
  { Icon: Scale, title: "Limits on-chain", sub: "Enforced by the contract", desc: "Max chunk, total budget, deadline and minimum interval are checked by the Rust contract, not by the agent." },
  { Icon: Landmark, title: "DAO approval", sub: "Sputnik 2-of-3 council", desc: "Invoices above the $100 auto-cap stay Pending until the council votes. Nothing large moves on one signature." },
  { Icon: KeyRound, title: "Restricted key", sub: "One method only", desc: "The agent holds a function-call key limited to execute_chunk. It cannot approve orders or change limits." },
];

const flow = [
  { step: "Fund", desc: "Lock Circle testnet USDC against an invoice target in EURe." },
  { step: "Approve", desc: "Over $100 the DAO votes 2-of-3. Under it, the order is active at once." },
  { step: "Time", desc: "The agent scores live quotes against ECB and the deadline, then pays in chunks." },
  { step: "Settle", desc: "Demo EURe reaches the supplier. Unspent escrow is refunded." },
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
  const p = price?.["USDC/EURe"];
  const dev = p?.deviationBps;

  return (
    <div className="min-h-screen text-foreground">
      <header className="sticky top-0 z-40 border-b-2 border-brand/40 bg-black/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center justify-between px-4">
          <BrandMark />
          <div className="flex items-center gap-3">
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
      <section className="mx-auto max-w-[1100px] px-4 pb-16 pt-16 md:pt-24">
        <Reveal>
          <span className="pill">
            <TrendingUp size={12} /> Live on NEAR testnet
          </span>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-[1.15] tracking-tight md:text-6xl">
            GetNear: Controlled <span className="text-brand">Supplier Payments</span>
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="mt-6 max-w-2xl text-sm leading-7 text-muted md:text-[15px]">
            A treasury agent that pays euro invoices from USDC in timed chunks, with on-chain limits, DAO approval for large payments, and a
            ledger that marks an invoice paid only when the transfer really happened. Built on NEAR with 1Click quotes and ECB reference rates.
          </p>
        </Reveal>
        <Reveal delay={240}>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/dashboard" className="btn-primary h-10 px-5">
              Launch App <ArrowRight size={14} />
            </Link>
            <Link href="/analytics" className="btn-secondary h-10 px-5">
              View Analytics
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ── The Why ────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1100px] px-4 pb-20">
        <Reveal>
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">The Why</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted">
              Discover the principles behind GetNear: an agent you can let loose on a treasury because it simply cannot break the rules.
            </p>
          </div>
        </Reveal>

        <Reveal delay={80} className="mx-auto mt-10 max-w-4xl">
          <Card title="USDC / EURe, live" subtitle="1Click dry quote vs the ECB reference rate" className="!p-6">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <span />
              <div className="text-right">
                <div className="num text-2xl font-bold">
                  {typeof dev === "number" ? `${dev > 0 ? "+" : ""}${dev} bps` : "--"}
                </div>
                <div className={`text-xs ${typeof dev === "number" && Math.abs(dev) > 120 ? "text-danger" : "text-ok"}`}>quote vs ECB reference right now</div>
              </div>
            </div>
            <RateChart height={260} defaultHours={6} />
          </Card>
        </Reveal>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {features.map(({ Icon, title, sub, desc }, i) => (
            <Reveal key={title} delay={i * 90}>
              <Card title={title} subtitle={sub} icon={Icon} className="h-full">
                <p className="text-[13px] leading-6 text-muted">{desc}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Harbour tile ───────────────────────────────────── */}
      <section className="mx-auto max-w-[1100px] px-4 pb-20">
        <Reveal>
          <div className="relative isolate h-[300px] overflow-hidden rounded-2xl border-2 border-brand bg-black shadow-brutal md:h-[380px]">
            <AsciiScene className="absolute inset-0 -z-10 opacity-90" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black via-black/10 to-transparent" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/80 via-transparent to-transparent" />
            <div className="flex h-full flex-col justify-end p-6">
              <span className="pill w-fit">
                <BadgeCheck size={12} /> Auditable end to end
              </span>
              <p className="mt-3 max-w-md text-xl font-bold leading-snug md:text-2xl">
                Funding, approvals, chunks and refunds: every step is a NEARBlocks link.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Live bento ─────────────────────────────────────── */}
      <section className="mx-auto max-w-[1100px] px-4 pb-20">
        <Reveal>
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Live, not mocked</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted">Real agent decisions and a real on-chain order you can verify without a wallet.</p>
          </div>
        </Reveal>
        <div className="mt-10 grid gap-6 lg:grid-cols-12">
          <Reveal className="lg:col-span-7">
            <Card title="Live agent feed" subtitle="Every decision with its reason, newest first" icon={ListChecks} className="h-full">
              <LiveFeed rows={8} />
            </Card>
          </Reveal>
          <Reveal delay={100} className="lg:col-span-5">
            <Card title="Order #13" subtitle="Verified on testnet · demo EURe · simulated FX" badge={{ label: "Completed", color: "green" }} icon={BadgeCheck} className="h-full">
              <dl className="divide-y divide-border text-sm">
                <Row label="Escrow funded" value="$10.000000" href={`${NB}/ZnaHzUsMawWiTTAa5RrbfqTeQQqyhn8vY6tb41b7nMd`} />
                <Row label="Invoice paid" value="€5.00 EURe" href={`${NB}/6eAGwbnBR8X5Q72J8kf8tPMPaChHSJ5Ma9zmBmzLM7of`} />
                <Row label="USDC charged" value="$5.541224" />
                <Row label="Escrow refunded" value="$4.458776" href={`${NB}/63pmWkCcViJShmXwgwELG5uUTbn5TBCRAHjv7Di2pFha`} />
              </dl>
              <p className="mt-4 text-xs text-muted">
                Verify: <code className="rounded bg-surface-2 px-1.5 py-0.5 text-brand">pnpm verify:readonly</code>
              </p>
            </Card>
          </Reveal>
        </div>
      </section>

      {/* ── Flow ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1100px] px-4 pb-20">
        <Reveal>
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">How a payment flows</h2>
          </div>
        </Reveal>
        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {flow.map((f, i) => (
            <Reveal as="li" key={f.step} delay={i * 90}>
              <Card title={`${i + 1}. ${f.step}`} className="h-full">
                <p className="text-[13px] leading-6 text-muted">{f.desc}</p>
              </Card>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ── Real vs simulated ──────────────────────────────── */}
      <section className="mx-auto max-w-[1100px] px-4 pb-20">
        <Reveal>
          <Card title="What is real and what is simulated" subtitle="Every layer is labelled. No savings claims, no mainnet claims.">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="th !pl-0">Layer</th>
                  <th className="th">Status</th>
                  <th className="th hidden sm:table-cell">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {realVsSim.map((r) => (
                  <tr key={r.what}>
                    <td className="py-2.5 pr-3">{r.what}</td>
                    <td className={`px-3 py-2.5 font-bold ${r.tone}`}>{r.status}</td>
                    <td className="hidden px-3 py-2.5 text-muted sm:table-cell">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Reveal>
      </section>

      {/* ── Interactive CTA ────────────────────────────────── */}
      <section className="relative isolate overflow-hidden border-t-2 border-brand/40">
        <AsciiField height={280} className="absolute inset-0 -z-10 h-full opacity-80" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-background/30 to-background" />
        <div className="mx-auto flex max-w-[1100px] flex-col items-center px-4 py-24 text-center">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Try it on testnet</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-muted">Free demo tokens, a real contract and real DAO votes. Move your pointer over the field.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href="/dashboard" className="btn-primary h-10 px-5">
                Launch App <ArrowRight size={14} />
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

function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="num text-[13px] font-bold">
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
