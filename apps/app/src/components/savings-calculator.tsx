"use client";

import { useState } from "react";
import { DISPLAY_MULTIPLIER } from "@getnear/shared";
import { useI18n } from "@/lib/i18n";

const BANK_FEE_DEFAULT = 1.3;
const GetNear_FEE = 0.05;

export function SavingsCalculator() {
  const [volume, setVolume] = useState(50); // millions display
  const [bankFee, setBankFee] = useState(BANK_FEE_DEFAULT);
  const { t } = useI18n();

  const bankCost = volume * DISPLAY_MULTIPLIER * (bankFee / 100);
  const GetNearCost = volume * DISPLAY_MULTIPLIER * (GetNear_FEE / 100);
  const savings = bankCost - GetNearCost;
  const savingsPct = ((bankFee - GetNear_FEE) / bankFee) * 100;

  const fmt = (n: number) =>
    n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

  return (
    <div className="border border-border bg-surface p-6 font-mono">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wider mb-1">
        <span className="text-[#00ec97]">┌─</span>
        <span>[ {t("calc.title")} ]</span>
      </div>
      <p className="text-xs text-muted pl-3">
        {t("calc.subtitle")}
      </p>

      {/* Volume slider */}
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted">
            {t("calc.annual_volume")}
          </label>
          <span className="font-mono text-sm font-semibold text-foreground">
            ${volume}M
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={500}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="mt-2 h-1.5 w-full cursor-pointer appearance-none bg-border accent-[#00ec97]"
        />
        <div className="mt-1 flex justify-between text-[11px] text-muted">
          <span>$1M</span>
          <span>$500M</span>
        </div>
      </div>

      {/* Bank fee input */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted">
            {t("calc.bank_fee")}
          </label>
          <span className="font-mono text-sm text-muted">{bankFee}%</span>
        </div>
        <input
          type="range"
          min={0.5}
          max={3}
          step={0.1}
          value={bankFee}
          onChange={(e) => setBankFee(Number(e.target.value))}
          className="mt-2 h-1.5 w-full cursor-pointer appearance-none bg-border accent-red-400"
        />
        <div className="mt-1 flex justify-between text-[11px] text-muted">
          <span>0.5%</span>
          <span>3.0%</span>
        </div>
      </div>

      {/* Results */}
      <div className="mt-6 space-y-2">
        <div className="flex items-center justify-between border border-border bg-[#090a0f] px-3.5 py-2.5">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted">
              {t("calc.traditional")}
            </div>
            <div className="text-[11px] text-muted">{bankFee}% {t("calc.fee")}</div>
          </div>
          <div className="font-mono text-sm font-semibold text-red-400">
            {fmt(bankCost)}{t("calc.per_yr")}
          </div>
        </div>

        <div className="flex items-center justify-between border border-border bg-[#090a0f] px-3.5 py-2.5">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted">
              {t("calc.GetNear")}
            </div>
            <div className="text-[11px] text-muted">~{GetNear_FEE}% {t("calc.fee")}</div>
          </div>
          <div className="font-mono text-sm font-semibold text-[#00ec97]">
            {fmt(GetNearCost)}{t("calc.per_yr")}
          </div>
        </div>

        {/* Savings highlight */}
        <div className="border border-[#00ec97] bg-[#00ec97]/10 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-[#00ec97]">
                [ {t("calc.annual_savings")} ]
              </div>
              <div className="mt-0.5 text-[11px] text-muted">
                {savingsPct.toFixed(0)}% {t("calc.cost_reduction")}
              </div>
            </div>
            <div className="font-mono text-xl sm:text-2xl font-bold text-[#00ec97]">
              {fmt(savings)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
