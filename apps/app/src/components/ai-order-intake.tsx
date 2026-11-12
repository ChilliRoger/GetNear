"use client";

import { useEffect, useState } from "react";
import type { AiProviderId, ParsedOrderData, ParseOrderAudit } from "@getnear/shared";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, MessageSquareText, ShieldAlert } from "lucide-react";

interface ParseStatusResponse {
  configured: boolean;
  activeProvider: AiProviderId;
  providerLabel: string;
  model: string;
  supportsAttestation: boolean;
  availableProviders: Record<AiProviderId, boolean>;
}

interface AiOrderIntakeProps {
  onApply: (order: ParsedOrderData) => void;
}

const EXAMPLE_PROMPTS = [
  "Convert 500 USDC to EURe in 100 USDC chunks within 24 hours",
  "Pay supplier-eu.chilliroger-operator.testnet 8.70 EURe from $15 Circle USDC escrow by 24h using max 10 USDC chunks at 200 bps",
];

export function AiOrderIntake({ onApply }: AiOrderIntakeProps) {
  const [status, setStatus] = useState<ParseStatusResponse | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<AiProviderId | undefined>(undefined);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [ambiguities, setAmbiguities] = useState<string[]>([]);
  const [draft, setDraft] = useState<ParsedOrderData | null>(null);
  const [audit, setAudit] = useState<ParseOrderAudit | null>(null);

  useEffect(() => {
    fetch("/api/orders/parse")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ParseStatusResponse | null) => {
        if (data) {
          setStatus(data);
        }
      })
      .catch(() => {});
  }, []);

  const handleParse = async () => {
    const clean = prompt.trim();
    if (!clean) {
      setErrorMsg("Enter a natural-language FX request to parse.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setAmbiguities([]);
    setDraft(null);
    setAudit(null);

    try {
      const res = await fetch("/api/orders/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: clean,
          provider: selectedProvider,
        }),
      });
      const data = await res.json();

      if (data.audit) {
        setAudit(data.audit);
      }

      if (!res.ok || !data.ok) {
        if (Array.isArray(data.ambiguities) && data.ambiguities.length > 0) {
          setAmbiguities(data.ambiguities);
        } else {
          setErrorMsg(data.error || "Unable to parse request.");
        }
        return;
      }

      setDraft(data.order as ParsedOrderData);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Network error while parsing order.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-background/60 p-2.5 space-y-2 text-xs">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 font-semibold text-foreground">
          <MessageSquareText className="h-3.5 w-3.5 text-accent-blue" />
          <span>Optional Natural-Language Order Intake (No Auto-Sign)</span>
        </div>

        {status && (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${
              status.configured
                ? "bg-accent-blue/15 text-accent-blue"
                : "bg-surface text-muted border border-border"
            }`}
          >
            {status.configured ? `${status.providerLabel} · ${status.model}` : "AI Key Not Set (Optional)"}
          </span>
        )}
      </div>

      {status && !status.configured && (
        <div className="text-[11px] text-muted leading-relaxed">
          Plain form below works without any AI key. To enable AI quick-fill, set{" "}
          <code className="font-mono text-zinc-300">NEAR_AI_API_KEY</code> (NEAR Builders) or a free{" "}
          <code className="font-mono text-zinc-300">GEMINI_API_KEY</code> /{" "}
          <code className="font-mono text-zinc-300">GROQ_API_KEY</code> in <code className="font-mono">.env</code>.
        </div>
      )}

      {status && status.configured && (
        <div className="flex items-center gap-2 text-[10px] text-muted flex-wrap">
          <span>Provider:</span>
          <button
            type="button"
            onClick={() => setSelectedProvider(undefined)}
            className={`rounded px-1.5 py-0.5 font-mono border transition-colors ${
              selectedProvider === undefined
                ? "border-accent-blue bg-accent-blue/15 text-accent-blue font-semibold"
                : "border-border bg-surface text-muted hover:text-foreground"
            }`}
          >
            Auto (NEAR AI -&gt; Free Tier Fallback)
          </button>
          {(["nearai", "gemini", "groq"] as AiProviderId[])
            .filter((p) => status.availableProviders[p])
            .map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setSelectedProvider(p)}
                className={`rounded px-1.5 py-0.5 font-mono border transition-colors ${
                  selectedProvider === p
                    ? "border-accent-blue bg-accent-blue/15 text-accent-blue font-semibold"
                    : "border-border bg-surface text-muted hover:text-foreground"
                }`}
              >
                {p === "nearai" ? "NEAR AI Cloud" : p === "gemini" ? "Google AI Studio" : "Groq"}
              </button>
            ))}
        </div>
      )}

      <div className="space-y-1.5">
        <textarea
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='e.g. "Pay supplier-eu.chilliroger-operator.testnet 8.70 EURe from $15 Circle USDC escrow by 24h in 10 USDC chunks at 200 bps"'
          className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-zinc-500 focus:border-accent-blue focus:outline-none resize-none"
        />
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {EXAMPLE_PROMPTS.map((ex, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setPrompt(ex)}
                className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] text-muted hover:text-foreground transition-colors"
              >
                Example {idx + 1}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleParse}
            disabled={loading || !prompt.trim()}
            className="flex items-center gap-1 rounded-lg border border-accent-blue/40 bg-accent-blue/15 px-2.5 py-1 text-[11px] font-semibold text-accent-blue hover:bg-accent-blue/25 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
            <span>{loading ? "Parsing..." : "Parse into Draft"}</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-400 flex items-start gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {ambiguities.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-300 space-y-1">
          <div className="font-semibold flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>Rejected Ambiguous Request (Nothing Pre-Filled):</span>
          </div>
          <ul className="list-disc pl-4 space-y-0.5 text-[10px]">
            {ambiguities.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {draft && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Strict Zod Draft Ready (Review Before Signing)</span>
            </div>
            <button
              type="button"
              onClick={() => onApply(draft)}
              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 transition-colors"
            >
              Apply to Order Form
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 font-mono text-[10px] text-zinc-200">
            <div>Total: {draft.totalUsdc} USDC</div>
            <div>Max Chunk: {draft.maxChunkUsdc !== null ? `${draft.maxChunkUsdc} USDC` : "Not specified"}</div>
            <div>Deadline: {draft.deadlineHours !== null ? `${draft.deadlineHours}h` : "Not specified"}</div>
            <div>Max Dev: {draft.maxDevBps !== null ? `${draft.maxDevBps} bps` : "Not specified"}</div>
            <div>Target Out: {draft.targetEuRe !== null ? `${draft.targetEuRe} EURe` : "Not specified"}</div>
            <div>Mode: {draft.fundingMode ?? "Keep form setting"}</div>
            {draft.recipient && <div className="col-span-2 truncate">Recipient: {draft.recipient}</div>}
            {draft.invoiceRef && <div className="truncate">Ref: {draft.invoiceRef}</div>}
          </div>
        </div>
      )}

      {audit && (
        <div className="rounded border border-border bg-surface px-2 py-1.5 text-[10px] font-mono text-zinc-400 space-y-0.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span>
              Model: <span className="text-zinc-200">{audit.model}</span> ({audit.providerLabel})
            </span>
            <span>{audit.latencyMs}ms</span>
          </div>
          {audit.fallbackAttempts && audit.fallbackAttempts.length > 0 && (
            <div className="text-zinc-400">
              Failover: {audit.fallbackAttempts.map((a) => `${a.provider} failed ->`).join(" ")} {audit.provider}
            </div>
          )}
          <div className="flex items-start gap-1 text-amber-300/90">
            <ShieldAlert className="h-3 w-3 shrink-0 mt-0.5" />
            <span>
              Attestation:{" "}
              {audit.attestation.status === "unverified_metadata_only"
                ? `Unverified receipt logged (${audit.attestation.signingAlgo || "tee"} · ${
                    audit.attestation.signingAddress?.slice(0, 12) || audit.attestation.chatId || "metadata"
                  }...)`
                : audit.attestation.note}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

