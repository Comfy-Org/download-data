'use client'

import * as React from 'react'

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
  const target = React.useMemo(
    () => computeNextUpdateTime(new Date()).getTime(),
    [],
  )

  const [remaining, setRemaining] = React.useState<number>(
    target - Date.now(),
  )

  React.useEffect(() => {
    function tick() {
      const diff = target - Date.now()
      if (diff <= 0) return setRemaining(0)
      setRemaining(diff)

      // schedule precisely for the next second boundary
      const delay = 1000 - (Date.now() % 1000)
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
    <p className="text-sm text-center mt-4">
      Next data update in {hours}h {mm}m {ss}s&nbsp;(10:49 UTC)
    </p>
  )
}
