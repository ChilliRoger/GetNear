import { useEffect, useRef } from 'react'
import type { DemoStatus } from './types'

interface Props {
  demoStatus: DemoStatus | null
}

export default function HeartbeatTimer({ demoStatus }: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)

  // Pure DOM updates — no React state, no re-renders, no SIGKILL
  useEffect(() => {
    if (!demoStatus) return

    const { sleep, nextTickAt, serverTime } = demoStatus
    const offset = serverTime - Math.floor(Date.now() / 1000)

    const id = setInterval(() => {
      const now = Math.floor(Date.now() / 1000) + offset
      const remaining = Math.max(0, nextTickAt - now)
      const progress = sleep > 0 ? Math.min(1, (sleep - remaining) / sleep) : 0

      if (barRef.current) barRef.current.style.width = `${progress * 100}%`
      if (textRef.current) textRef.current.textContent = `${remaining}s`
    }, 500)

    return () => clearInterval(id)
  }, [demoStatus])

  if (!demoStatus) {
    return (
      <div className="bg-surface border border-border rounded-xl px-4 py-2.5 flex items-center gap-3 h-10">
        <span className="text-xs text-muted">Heartbeat: waiting...</span>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-border rounded-xl px-4 py-2.5 flex items-center gap-3 h-10">
      <span className="text-xs text-muted whitespace-nowrap shrink-0">Next tick in:</span>
      <span ref={textRef} className="text-sm font-bold tabular-nums w-8 text-right shrink-0 text-accent">
        {demoStatus.sleep}s
      </span>
      <div className="flex-1 h-2 bg-bg rounded-full overflow-hidden border border-border/50">
        <div ref={barRef} className="h-full rounded-full bg-accent" style={{ width: '0%', transition: 'width 0.4s' }} />
      </div>
      <span className="text-xs text-muted shrink-0">{demoStatus.speed}x</span>
    </div>
  )
}
