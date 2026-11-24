// The handwritten notes on the revenue chart. Each one is worked out from the same daily numbers
// as the line, so it moves with the data: no guessing and no model behind it.

type Day = { day: string; revenue: number }

export type ChartNotes = {
  // The highest finished day.
  best: Day | null
  // The longest run of finished days below the average, if it is long enough to mean something.
  quiet: { from: string; to: string; days: number } | null
}

// Fewer days than this and there is no "best day" worth pointing at.
const MIN_DAYS = 7
// A run shorter than this is just a slow day or two, not a quiet stretch.
const QUIET_MIN_DAYS = 4

export function chartNotes(days: Day[]): ChartNotes {
  // Today isn't over yet, so it can be neither the best day nor part of a quiet stretch.
  const finished = days.slice(0, -1)
  if (finished.length < MIN_DAYS) return { best: null, quiet: null }

  const best = finished.reduce((top, day) => (day.revenue > top.revenue ? day : top))
  const average = finished.reduce((sum, day) => sum + day.revenue, 0) / finished.length

  let quiet: ChartNotes['quiet'] = null
  let start = -1
  finished.forEach((day, index) => {
    if (day.revenue < average) {
      if (start === -1) start = index
      const length = index - start + 1
      // ">=": of two equally long stretches, the more recent one is the one worth knowing.
      if (length >= QUIET_MIN_DAYS && length >= (quiet?.days ?? 0)) {
        quiet = { from: finished[start].day, to: day.day, days: length }
      }
    } else {
      start = -1
    }
  })

  return { best: best.revenue > 0 ? best : null, quiet }
}
