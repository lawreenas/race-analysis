import type { Runner, Split } from './types'

type Props = {
  runners: Runner[]
  selected: Set<string>
  onToggle: (bib: string) => void
}

function diff(runner: Runner) {
  return runner.raceScore - runner.utmbIndexRaceDay
}

function formatDuration(s: number | null): string {
  if (s === null) return '—'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

function formatDelta(s: number | null): string {
  if (s === null) return '—'
  if (Math.abs(s) < 1) return '0:00'
  const sign = s < 0 ? '-' : '+'
  const abs = Math.abs(s)
  const h = Math.floor(abs / 3600)
  const m = Math.floor((abs % 3600) / 60)
  const sec = Math.floor(abs % 60)
  if (h > 0) return `${sign}${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${sign}${m}:${String(sec).padStart(2, '0')}`
}

function deltaClass(d: number | null): string {
  if (d === null) return ''
  if (d > 1) return 'pct-worse'
  if (d < -1) return 'pct-better'
  return ''
}

function SplitCell({ split }: { split: Split }) {
  return (
    <td className="split-cell">
      <div className="split-time">{formatDuration(split.segmentSeconds)}</div>
      <div className={`split-pct ${deltaClass(split.segmentDeltaVsTomSeconds)}`}>
        {formatDelta(split.segmentDeltaVsTomSeconds)}
      </div>
    </td>
  )
}

export function RunnersTable({ runners, selected, onToggle }: Props) {
  const splitHeaders = runners[0]?.splits ?? []

  return (
    <div className="runners-table-wrap">
      <table className="runners-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th className="name-col">Name</th>
            <th>UTMB index (race day)</th>
            <th>Race score</th>
            <th>Δ</th>
            {splitHeaders.map((s, i) => (
              <th key={i} className="split-header">
                <div>{s.name}</div>
                <div className="km">{s.distanceKm.toFixed(1)} km</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runners.map((r) => {
            const d = diff(r)
            const outperformed = d > 0
            const isSelected = selected.has(r.bib)
            const cls = [outperformed ? 'outperformed' : '', isSelected ? 'selected' : '']
              .filter(Boolean)
              .join(' ')
            return (
              <tr
                key={r.bib}
                className={cls}
                onClick={() => {
                  if (window.getSelection()?.toString()) return
                  onToggle(r.bib)
                }}
              >
                <td className="num">{r.rank}</td>
                <td className="name-col">
                  <div className="name-main">
                    {r.firstName} <span className="last">{r.lastName}</span>
                  </div>
                  <div className="name-meta">
                    {r.sex} · {r.category} · {r.totalTime}
                  </div>
                </td>
                <td className="num">{r.utmbIndexRaceDay}</td>
                <td className="num">{r.raceScore}</td>
                <td className={`num delta ${outperformed ? 'pos' : d < 0 ? 'neg' : ''}`}>
                  {d > 0 ? `+${d}` : d}
                </td>
                {r.splits.map((s, i) => (
                  <SplitCell key={i} split={s} />
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
