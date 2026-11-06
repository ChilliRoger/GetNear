import { useState } from 'react'
import type { DemoStatus } from './types'

interface Props {
  demoStatus: DemoStatus | null
  onToggleSpeed: () => Promise<void>
  onSeed: () => Promise<void>
}

export default function ControlsBar({ demoStatus, onToggleSpeed, onSeed }: Props) {
  const [toggling, setToggling] = useState(false)
  const [seeding, setSeeding] = useState(false)

  const speed = demoStatus?.speed ?? 1
  const tickInterval = demoStatus?.sleep ?? 55

  const handleToggle = async () => {
    setToggling(true)
    try {
      await onToggleSpeed()
    } finally {
      setToggling(false)
    }
  }

  const handleSeed = async () => {
    setSeeding(true)
    try {
      await onSeed()
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="text-xs uppercase tracking-wide text-muted mb-3">Controls</div>

      <div className="space-y-3">
        {/* Speed display */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Speed</span>
          <span className={`text-lg font-bold tabular-nums ${speed > 1 ? 'text-warn' : 'text-text'}`}>
            {speed}x
          </span>
        </div>

        {/* Tick interval */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Tick interval</span>
          <span className="text-sm font-semibold tabular-nums">{tickInterval}s</span>
        </div>

        <div className="border-t border-border pt-3 space-y-2">
          {/* Speed toggle */}
          <button
            className="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors border border-border bg-bg hover:border-accent hover:text-accent disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            onClick={handleToggle}
            disabled={toggling}
          >
            {toggling ? 'Switching...' : `Switch to ${speed === 1 ? '10x' : '1x'}`}
          </button>

          {/* Seed button */}
          <button
            className="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors border border-accent bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            onClick={handleSeed}
            disabled={seeding}
          >
            {seeding ? 'Seeding...' : 'Seed Demo Data'}
          </button>
        </div>
      </div>
    </div>
  )
}
