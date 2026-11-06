import { useState, useEffect, useCallback, useRef } from 'react'
import type { StrategyConfig } from './types'

const ORACLE = '/api/oracle'

const DEFAULTS: StrategyConfig = {
  weightPrice: 0.4,
  weightDivergence: 0.2,
  weightUrgency: 0.4,
  swapThreshold: 70,
  aggressiveThreshold: 85,
  urgencyOverride: 80,
  autoExecute: true,
}

const SLIDER_INFO: Record<string, { label: string; short: string; desc: string }> = {
  swapThreshold:      { label: 'Swap',     short: 'Swap',  desc: 'Minimum composite score to trigger a swap. Lower = more trades execute. At 30, almost any market condition triggers execution.' },
  aggressiveThreshold:{ label: 'Aggro',    short: 'Aggro', desc: 'Score above this doubles the chunk size for faster fills. The agent becomes more aggressive when confidence is high.' },
  urgencyOverride:    { label: 'Urgency',  short: 'Urg',   desc: 'If urgency alone exceeds this, force execution regardless of price or divergence. Prevents orders from expiring unfilled.' },
  weightPrice:        { label: 'Price',    short: 'Price', desc: 'Weight of current-vs-24h-average price in the composite score. Higher = agent waits more for favorable prices.' },
  weightDivergence:   { label: 'Diverg',   short: 'Div',   desc: 'Weight of source agreement (Chainlink vs Fynd vs Uniswap). Higher = agent waits for price sources to converge.' },
  weightUrgency:      { label: 'Urgency',  short: 'Urg',   desc: 'Weight of deadline pressure. Higher = agent ramps up execution speed as the deadline approaches.' },
}

function sliderColor(value: number, max: number): string {
  const pct = max > 0 ? value / max : 0
  if (pct >= 0.65) return 'var(--color-ok)'
  if (pct >= 0.35) return 'var(--color-warn)'
  return 'var(--color-danger)'
}

function TooltipCard({ text, visible, anchorRef }: { text: string; visible: boolean; anchorRef?: React.RefObject<HTMLElement | null> }) {
  if (!visible) return null

  // Portal-based tooltip using fixed positioning from anchor bounding rect
  if (anchorRef?.current) {
    const rect = anchorRef.current.getBoundingClientRect()
    const style: React.CSSProperties = {
      position: 'fixed',
      left: rect.left + rect.width / 2,
      top: rect.top - 8,
      transform: 'translate(-50%, -100%)',
      zIndex: 9999,
    }
    return (
      <div style={style} className="w-52 px-3 py-2 rounded-lg bg-[#1a1a2e] border border-border shadow-xl text-xs text-muted leading-relaxed pointer-events-none">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-2 h-2 rotate-45 bg-[#1a1a2e] border-r border-b border-border" />
      </div>
    )
  }

  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-52 px-3 py-2 rounded-lg bg-[#1a1a2e] border border-border shadow-xl text-xs text-muted leading-relaxed pointer-events-none">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-2 h-2 rotate-45 bg-[#1a1a2e] border-r border-b border-border" />
    </div>
  )
}

function VerticalSlider({
  id,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  id: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  const [showTip, setShowTip] = useState(false)
  const tipBtnRef = useRef<HTMLButtonElement>(null)
  const info = SLIDER_INFO[id]
  const display = format ? format(value) : String(value)
  const color = sliderColor(value, max)

  return (
    <div className="flex flex-col items-center gap-1 relative" style={{ width: 70 }}>
      {/* Label + ? icon */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted font-medium">{info.label}</span>
        <button
          ref={tipBtnRef}
          type="button"
          className="w-3.5 h-3.5 rounded-full border border-muted/40 text-[9px] text-muted/60 hover:text-accent hover:border-accent transition-colors cursor-pointer flex items-center justify-center leading-none"
          onMouseEnter={() => setShowTip(true)}
          onMouseLeave={() => setShowTip(false)}
          onClick={() => setShowTip((s) => !s)}
        >
          ?
        </button>
      </div>

      <TooltipCard text={info.desc} visible={showTip} anchorRef={tipBtnRef} />

      {/* Vertical slider */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="vertical-slider cursor-pointer"
        style={{ '--slider-color': color } as React.CSSProperties}
      />

      {/* Value */}
      <span className="text-sm font-mono tabular-nums font-bold" style={{ color }}>
        {display}
      </span>
    </div>
  )
}

function HelpIcon({ tooltip, className }: { tooltip: string; className?: string }) {
  const [show, setShow] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`w-3.5 h-3.5 rounded-full border border-muted/40 text-[9px] text-muted/60 hover:text-accent hover:border-accent transition-colors cursor-pointer flex items-center justify-center leading-none ${className ?? ''}`}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow((s) => !s)}
      >
        ?
      </button>
      <TooltipCard text={tooltip} visible={show} anchorRef={btnRef} />
    </>
  )
}

function SigmaIndicator({ weightSum, weightOk }: { weightSum: number; weightOk: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <span className={`text-xs font-mono tabular-nums px-1.5 py-0.5 rounded ${
        weightOk ? 'text-ok/80 bg-ok/10' : 'text-warn bg-warn/10'
      }`}>
        {'\u03A3'} = {weightSum.toFixed(2)}{!weightOk && ' \u26A0'}
      </span>
      <HelpIcon tooltip="Sum of the three weight sliders. Should equal 1.00 for proper scoring. If not 1.0, scores will be scaled proportionally." />
    </div>
  )
}

function AutoExecuteToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted">Auto-execute</span>
      <HelpIcon tooltip="When ON, PENDING trades are automatically approved without World ID verification. Turn OFF to demo the approval flow." />
      <button
        type="button"
        className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${
          value ? 'bg-accent' : 'bg-border'
        }`}
        onClick={() => onChange(!value)}
      >
        <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-0.5 ${
          value ? 'translate-x-5' : 'translate-x-0'
        }`} />
      </button>
    </div>
  )
}

export default function ScoringConfigPanel() {
  const [config, setConfig] = useState<StrategyConfig>(DEFAULTS)
  const [collapsed, setCollapsed] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    let timeoutId: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const res = await fetch(`${ORACLE}/api/strategy/config`)
        if (res.ok) {
          const data = (await res.json()) as StrategyConfig
          if (mountedRef.current) { setConfig(data); setError(null) }
        }
      } catch { /* retry */ } finally {
        if (mountedRef.current) timeoutId = setTimeout(poll, 5_000)
      }
    }
    poll()
    return () => { mountedRef.current = false; clearTimeout(timeoutId) }
  }, [])

  const pushUpdate = useCallback((partial: Partial<StrategyConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }))
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${ORACLE}/api/strategy/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(partial),
        })
        if (!res.ok) setError(`PUT failed: ${res.status}`)
        else setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'PUT failed')
      }
    }, 500)
  }, [])

  const handleReset = useCallback(() => {
    setConfig(DEFAULTS)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    fetch(`${ORACLE}/api/strategy/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(DEFAULTS),
    }).catch(() => {})
  }, [])

  const weightSum = config.weightPrice + config.weightDivergence + config.weightUrgency
  const weightOk = Math.abs(weightSum - 1.0) <= 0.05

  return (
    <div className="bg-surface border border-border rounded-xl">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-bg/50 transition-colors"
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="text-xs uppercase tracking-wide text-muted">Scoring Config</span>
        <span className="text-xs text-muted">{collapsed ? '+ Expand' : '- Collapse'}</span>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
          {error && (
            <div className="text-xs text-red-400 bg-red-400/10 rounded px-2 py-1">{error}</div>
          )}

          {/* Sliders + controls in one row */}
          <div className="flex items-center justify-between gap-4">
            {/* Left: all 6 sliders */}
            <div className="flex items-start gap-1">
              {/* Thresholds */}
              <VerticalSlider id="swapThreshold" value={config.swapThreshold} min={0} max={100} step={1}
                onChange={(v) => pushUpdate({ swapThreshold: v })} />
              <VerticalSlider id="aggressiveThreshold" value={config.aggressiveThreshold} min={0} max={100} step={1}
                onChange={(v) => pushUpdate({ aggressiveThreshold: v })} />
              <VerticalSlider id="urgencyOverride" value={config.urgencyOverride} min={0} max={100} step={1}
                onChange={(v) => pushUpdate({ urgencyOverride: v })} />

              {/* Divider */}
              <div className="w-px h-28 bg-border/50 mx-1 self-center" />

              {/* Weights */}
              <VerticalSlider id="weightPrice" value={config.weightPrice} min={0} max={1} step={0.05}
                onChange={(v) => pushUpdate({ weightPrice: v })} format={(v) => v.toFixed(2)} />
              <VerticalSlider id="weightDivergence" value={config.weightDivergence} min={0} max={1} step={0.05}
                onChange={(v) => pushUpdate({ weightDivergence: v })} format={(v) => v.toFixed(2)} />
              <VerticalSlider id="weightUrgency" value={config.weightUrgency} min={0} max={1} step={0.05}
                onChange={(v) => pushUpdate({ weightUrgency: v })} format={(v) => v.toFixed(2)} />
            </div>

            {/* Right: controls */}
            <div className="flex flex-col items-end gap-2">
              {/* Sigma indicator with tooltip */}
              <SigmaIndicator weightSum={weightSum} weightOk={weightOk} />

              {/* Auto-execute toggle with tooltip */}
              <AutoExecuteToggle
                value={config.autoExecute}
                onChange={(v) => pushUpdate({ autoExecute: v })}
              />

              {/* Reset */}
              <button
                type="button"
                className="px-3 py-1 rounded-lg text-xs font-semibold border border-border bg-bg hover:border-accent hover:text-accent transition-colors cursor-pointer"
                onClick={handleReset}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .vertical-slider {
          writing-mode: vertical-lr;
          direction: rtl;
          height: 90px;
          width: 28px;
          appearance: slider-vertical;
          accent-color: var(--slider-color);
          opacity: 0.85;
          transition: opacity 0.15s;
        }
        .vertical-slider:hover {
          opacity: 1;
        }
      `}</style>
    </div>
  )
}
