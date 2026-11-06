"use client";

import { Card } from "@/components/card";
import { useI18n } from "@/lib/i18n";

export function PrivacyComparison() {
  const { t } = useI18n();

  return (
    <Card title={t("privacy.comparison_title")} badge={{ label: "ZK", color: "blue" }}>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        {t("privacy.comparison_explainer")}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {/* Normal Swap */}
        <div className="rounded-xl border border-border bg-background p-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-red/15">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-accent-red">
                <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke="currentColor" strokeWidth="2" />
                <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" stroke="currentColor" strokeWidth="2" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-foreground">{t("privacy.normal_swap")}</span>
          </div>

          <div className="space-y-2">
            <div>
              <div className="text-[9px] uppercase tracking-wide text-muted">Sender</div>
              <div className="font-mono text-[10px] text-foreground">0x7a3f...8b2c</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wide text-muted">Visibility</div>
              <div className="text-[10px] text-accent-red">{t("privacy.sender_visible")}</div>
            </div>
            <a
              href="https://sepolia.basescan.org"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[9px] text-accent-blue hover:underline"
            >
              View on Basescan
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
        </div>

        {/* Private Swap */}
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-500/15">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-purple-400">
                <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-foreground">{t("privacy.private_swap")}</span>
          </div>

          <div className="space-y-2">
            <div>
              <div className="text-[9px] uppercase tracking-wide text-muted">Sender</div>
              <div className="font-mono text-[10px] text-purple-400">Unlink Pool</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wide text-muted">Visibility</div>
              <div className="text-[10px] text-accent-green">{t("privacy.sender_hidden")}</div>
            </div>
            <div className="flex items-center gap-1 text-[9px] text-muted">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Identity hidden via ZK proof
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-[10px] leading-relaxed text-muted/70">
        {t("privacy.comparison_footnote")}
      </p>
    </Card>
  );
}
