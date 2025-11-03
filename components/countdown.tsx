'use client'

import * as React from 'react'
import Image from 'next/image'

function computeNextUpdateTime(now: Date) {
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    10, 49, 0,
  ))
  if (now >= next) next.setUTCDate(next.getUTCDate() + 1)
  return next
}

export function NextUpdateCountdown() {
  const [target, setTarget] = React.useState<number>(
    () => computeNextUpdateTime(new Date()).getTime()
  )

  const [remaining, setRemaining] = React.useState<number>(
    target - Date.now()
  )

  React.useEffect(() => {
    function tick() {
      const now = Date.now()
      const diff = target - now
      if (diff <= 0) {
        const nextTarget = computeNextUpdateTime(new Date()).getTime()
        setTarget(nextTarget)
        setRemaining(nextTarget - now)
        return
      }
      setRemaining(diff)

      // schedule precisely for the next second boundary
      const delay = 1000 - (now % 1000)
      timeoutId = window.setTimeout(tick, delay)
    }

    let timeoutId = window.setTimeout(tick, 0)
    return () => clearTimeout(timeoutId)
  }, [target])

  if (remaining <= 0) return null

  const totalSeconds = Math.floor(remaining / 1000)
  const hours    = Math.floor(totalSeconds / 3600)
  const minutes  = Math.floor((totalSeconds % 3600) / 60)
  const seconds  = totalSeconds % 60

  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')

  return (
    <p className="text-sm text-center mt-4 flex items-center justify-center gap-2">
      <span>
        Next data update in {hours}h {mm}m {ss}s&nbsp;(10:49 UTC)
      </span>
      <a
        href="https://github.com/benceruleanlu/comfyui-download-data"
        target="_blank"
        rel="noreferrer"
        aria-label="Open GitHub repository"
        className="inline-flex items-center"
      >
        <Image src="/github-mark.svg" alt="GitHub" width={24} height={24} />
      </a>
    </p>
  )
}
