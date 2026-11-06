"use client";

import { useState } from "react";
import { DISPLAY_MULTIPLIER } from "@meridian/shared";
import { useI18n } from "@/lib/i18n";

const BANK_FEE_DEFAULT = 1.3;
const MERIDIAN_FEE = 0.05;

export function SavingsCalculator() {
  const [volume, setVolume] = useState(50); // millions display
  const [bankFee, setBankFee] = useState(BANK_FEE_DEFAULT);
  const { t } = useI18n();

  const bankCost = volume * DISPLAY_MULTIPLIER * (bankFee / 100);
  const meridianCost = volume * DISPLAY_MULTIPLIER * (MERIDIAN_FEE / 100);
  const savings = bankCost - meridianCost;
  const savingsPct = ((bankFee - MERIDIAN_FEE) / bankFee) * 100;

  const fmt = (n: number) =>
    n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

  return (
    <div className="rounded-2xl border border-[#262626] bg-[#141414] p-6 sm:p-8">
      <h3 className="text-lg font-semibold text-[#fafafa] sm:text-xl">
        {t("calc.title")}
      </h3>
      <p className="mt-1 text-sm text-[#a3a3a3]">
        {t("calc.subtitle")}
      </p>

      {/* Volume slider */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-[#a3a3a3]">
            {t("calc.annual_volume")}
          </label>
          <span className="font-mono text-sm font-semibold text-[#fafafa]">
            ${volume}M
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={500}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#262626] accent-[#3b82f6]"
        />
        <div className="mt-1 flex justify-between text-[11px] text-[#a3a3a3]/80">
          <span>$1M</span>
          <span>$500M</span>
        </div>
      </div>

      {/* Bank fee input */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-[#a3a3a3]">
            {t("calc.bank_fee")}
          </label>
          <span className="font-mono text-sm text-[#a3a3a3]">{bankFee}%</span>
        </div>
        <input
          type="range"
          min={0.5}
          max={3}
          step={0.1}
          value={bankFee}
          onChange={(e) => setBankFee(Number(e.target.value))}
          className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#262626] accent-[#ef4444]"
        />
        <div className="mt-1 flex justify-between text-[11px] text-[#a3a3a3]/80">
          <span>0.5%</span>
          <span>3.0%</span>
        </div>
      </div>

      {/* Results */}
      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between rounded-lg bg-[#0a0a0a] px-4 py-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-[#a3a3a3]">
              {t("calc.traditional")}
            </div>
            <div className="text-xs text-[#a3a3a3]/80">{bankFee}% {t("calc.fee")}</div>
          </div>
          <div className="font-mono text-sm font-semibold text-[#ef4444]">
            {fmt(bankCost)}{t("calc.per_yr")}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-[#0a0a0a] px-4 py-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-[#a3a3a3]">
              {t("calc.meridian")}
            </div>
            <div className="text-xs text-[#a3a3a3]/80">~{MERIDIAN_FEE}% {t("calc.fee")}</div>
          </div>
          <div className="font-mono text-sm font-semibold text-[#22c55e]">
            {fmt(meridianCost)}{t("calc.per_yr")}
          </div>
        </div>

        {/* Savings highlight */}
        <div className="rounded-xl border border-[#22c55e]/20 bg-[#22c55e]/5 px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-[#22c55e]">
                {t("calc.annual_savings")}
              </div>
              <div className="mt-0.5 text-[11px] text-[#a3a3a3]">
                {savingsPct.toFixed(0)}% {t("calc.cost_reduction")}
              </div>
            </div>
            <div className="font-mono text-2xl font-bold text-[#22c55e]">
              {fmt(savings)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
