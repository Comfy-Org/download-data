'use client'

import * as React from 'react'

function getNextUpdateTime(now: Date) {
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    10,
    49,
    0
  ))
  if (now.getTime() >= next.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1)
  }
  return next
}

export function NextUpdateCountdown() {
  const [time, setTime] = React.useState<number>(() => {
    const now = new Date()
    return getNextUpdateTime(now).getTime() - now.getTime()
  })

  React.useEffect(() => {
    const id = setInterval(() => {
      const now = new Date()
      const diff = getNextUpdateTime(now).getTime() - now.getTime()
      setTime(diff)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  if (time <= 0) return null

  const totalSeconds = Math.floor(time / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return (
    <p className="text-sm text-center mt-4">
      Next data update in {hours}h {minutes}m {seconds}s (10:49 UTC)
    </p>
  )
}
