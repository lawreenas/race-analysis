import { useEffect, useRef, useState } from 'react'
import type { Runner } from './types'

const COLORS = [
  '#60a5fa',
  '#f472b6',
  '#a78bfa',
  '#34d399',
  '#fbbf24',
  '#fb7185',
  '#22d3ee',
  '#f97316',
  '#84cc16',
  '#e879f9',
]

type Hover = { runnerBib: string; aidIdx: number } | null

type Props = {
  runners: Runner[]
  selected: Set<string>
}

function formatDelta(s: number): string {
  if (Math.abs(s) < 1) return '0:00'
  const sign = s < 0 ? '-' : '+'
  const abs = Math.abs(s)
  const h = Math.floor(abs / 3600)
  const m = Math.floor((abs % 3600) / 60)
  const sec = Math.floor(abs % 60)
  if (h > 0) {
    return `${sign}${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }
  return `${sign}${m}:${String(sec).padStart(2, '0')}`
}

function niceTimeStep(approx: number): number {
  const steps = [10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 28800]
  for (const s of steps) if (s >= approx) return s
  return steps[steps.length - 1]
}

export function AidStationChart({ runners, selected }: Props) {
  const tom = runners.find((r) => r.rank === 1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1200)
  const [hover, setHover] = useState<Hover>(null)

  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 1200
      setWidth(Math.max(500, Math.floor(w)))
    })
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  if (!tom) {
    return <div ref={wrapRef} className="chart-wrap" />
  }

  const aidStations = tom.splits
  const selectedRunners = runners.filter((r) => selected.has(r.bib) && r.bib !== tom.bib)
  const tomSelected = selected.has(tom.bib)

  if (selectedRunners.length === 0 && !tomSelected) {
    return (
      <div ref={wrapRef} className="chart-wrap chart-empty">
        Select runners (click on a row) to plot their time delta vs Tom EVANS at each aid station.
      </div>
    )
  }

  const series = selectedRunners.map((r, idx) => {
    const points = r.splits
      .map((s, i) => {
        const tomSec = aidStations[i]?.seconds ?? null
        const runnerSec = s.seconds
        if (tomSec === null || runnerSec === null) return null
        return { idx: i, delta: runnerSec - tomSec, timeStr: s.timeStr }
      })
      .filter((p): p is { idx: number; delta: number; timeStr: string } => p !== null)
    return { runner: r, points, color: COLORS[idx % COLORS.length] }
  })

  let minDelta = 0
  let maxDelta = 0
  for (const s of series) {
    for (const p of s.points) {
      if (p.delta < minDelta) minDelta = p.delta
      if (p.delta > maxDelta) maxDelta = p.delta
    }
  }
  const range = maxDelta - minDelta || 60
  minDelta -= range * 0.08
  maxDelta += range * 0.08

  const height = 340
  const m = { top: 16, right: 24, bottom: 110, left: 70 }
  const innerW = width - m.left - m.right
  const innerH = height - m.top - m.bottom

  const xPos = (i: number) =>
    m.left + (aidStations.length > 1 ? (i / (aidStations.length - 1)) * innerW : innerW / 2)
  const yPos = (delta: number) =>
    m.top + innerH - ((delta - minDelta) / (maxDelta - minDelta || 1)) * innerH

  const tickStep = niceTimeStep((maxDelta - minDelta) / 6)
  const yTicks: number[] = []
  const tickStart = Math.ceil(minDelta / tickStep) * tickStep
  for (let v = tickStart; v <= maxDelta; v += tickStep) yTicks.push(v)
  if (!yTicks.some((t) => Math.abs(t) < 1e-9)) yTicks.push(0)

  let tooltip: {
    x: number
    y: number
    name: string
    aid: string
    abs: string
    delta: number
    color: string
  } | null = null
  if (hover) {
    const s = series.find((ss) => ss.runner.bib === hover.runnerBib)
    const p = s?.points.find((pp) => pp.idx === hover.aidIdx)
    const a = aidStations[hover.aidIdx]
    if (s && p && a) {
      tooltip = {
        x: xPos(p.idx),
        y: yPos(p.delta),
        name: `${s.runner.firstName} ${s.runner.lastName}`,
        aid: `${a.name} · ${a.distanceKm.toFixed(1)} km`,
        abs: p.timeStr,
        delta: p.delta,
        color: s.color,
      }
    }
  }

  return (
    <div ref={wrapRef} className="chart-wrap">
      <svg width={width} height={height} className="chart-svg">
        {yTicks.map((t) => {
          const isZero = Math.abs(t) < 1e-9
          return (
            <g key={t}>
              <line
                x1={m.left}
                x2={width - m.right}
                y1={yPos(t)}
                y2={yPos(t)}
                stroke={isZero ? '#888' : '#222'}
                strokeDasharray={isZero ? '' : '2,3'}
              />
              <text
                x={m.left - 8}
                y={yPos(t) + 4}
                textAnchor="end"
                fill={isZero ? '#aaa' : '#888'}
                fontSize="11"
              >
                {formatDelta(t)}
              </text>
            </g>
          )
        })}

        {aidStations.map((a, i) => (
          <g key={i} transform={`translate(${xPos(i)}, ${height - m.bottom + 8})`}>
            <line x1={0} x2={0} y1={-4} y2={-innerH - 4} stroke="#1a1a1a" />
            <g transform="rotate(45)">
              <text fill="#888" fontSize="10" textAnchor="start">
                {a.name} ({a.distanceKm.toFixed(1)} km)
              </text>
            </g>
          </g>
        ))}

        {series.map(({ runner, points, color }) => {
          if (points.length === 0) return null
          const d = points
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(p.idx)} ${yPos(p.delta)}`)
            .join(' ')
          return (
            <g key={runner.bib}>
              <path d={d} fill="none" stroke={color} strokeWidth={2} />
              {points.map((p) => {
                const isHovered =
                  hover?.runnerBib === runner.bib && hover.aidIdx === p.idx
                return (
                  <circle
                    key={p.idx}
                    cx={xPos(p.idx)}
                    cy={yPos(p.delta)}
                    r={isHovered ? 5 : 3}
                    fill={color}
                    stroke={isHovered ? '#fff' : 'none'}
                    strokeWidth={1.5}
                    onMouseEnter={() => setHover({ runnerBib: runner.bib, aidIdx: p.idx })}
                    onMouseLeave={() => setHover(null)}
                    style={{ cursor: 'crosshair' }}
                  />
                )
              })}
            </g>
          )
        })}
      </svg>

      {tooltip && (
        <div
          className="chart-tooltip"
          style={{
            left: Math.min(tooltip.x + 12, width - 200),
            top: tooltip.y + 12,
          }}
        >
          <div className="tt-name" style={{ color: tooltip.color }}>
            {tooltip.name}
          </div>
          <div className="tt-aid">{tooltip.aid}</div>
          <div className="tt-row">
            Time <strong>{tooltip.abs}</strong>
          </div>
          <div className="tt-row">
            vs Tom <strong>{formatDelta(tooltip.delta)}</strong>
          </div>
        </div>
      )}

      <div className="chart-legend">
        <span className="legend-item">
          <span className="swatch swatch-ref" />
          Tom EVANS (reference)
        </span>
        {series.map(({ runner, color }) => (
          <span className="legend-item" key={runner.bib}>
            <span className="swatch" style={{ background: color }} />
            {runner.firstName} {runner.lastName}
          </span>
        ))}
      </div>
    </div>
  )
}
