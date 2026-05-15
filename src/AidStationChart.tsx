import { useEffect, useRef, useState } from 'react'
import type { Runner } from './types'
import { loadElevationProfile, type ElevationPoint } from './loadElevation'

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
  const [elevation, setElevation] = useState<ElevationPoint[]>([])

  useEffect(() => {
    loadElevationProfile()
      .then(setElevation)
      .catch((e) => console.warn('Elevation load failed:', e))
  }, [])

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
  const lastKm = aidStations.length > 0 ? aidStations[aidStations.length - 1].distanceKm : 175

  const series = selectedRunners.map((r, idx) => {
    const points = r.splits
      .map((s, i) => {
        const tomSec = aidStations[i]?.seconds ?? null
        const runnerSec = s.seconds
        if (tomSec === null || runnerSec === null) return null
        return {
          idx: i,
          distanceKm: s.distanceKm,
          delta: runnerSec - tomSec,
          timeStr: s.timeStr,
        }
      })
      .filter(
        (p): p is { idx: number; distanceKm: number; delta: number; timeStr: string } =>
          p !== null,
      )
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

  const height = 380
  const m = { top: 16, right: 60, bottom: 110, left: 70 }
  const innerW = width - m.left - m.right
  const innerH = height - m.top - m.bottom
  const innerBottom = m.top + innerH

  const xPos = (km: number) => m.left + (km / lastKm) * innerW
  const yPos = (delta: number) =>
    m.top + innerH - ((delta - minDelta) / (maxDelta - minDelta || 1)) * innerH

  let elevMin = 0
  let elevMax = 1
  if (elevation.length > 0) {
    elevMin = Math.min(...elevation.map((e) => e.elevationM))
    elevMax = Math.max(...elevation.map((e) => e.elevationM))
    const pad = (elevMax - elevMin) * 0.05
    elevMin -= pad
    elevMax += pad
  }
  const elevY = (e: number) =>
    m.top + innerH - ((e - elevMin) / (elevMax - elevMin || 1)) * innerH

  const elevAreaPath =
    elevation.length > 0
      ? `M ${xPos(elevation[0].distanceKm)} ${innerBottom} ` +
        elevation
          .map((p) => `L ${xPos(p.distanceKm)} ${elevY(p.elevationM)}`)
          .join(' ') +
        ` L ${xPos(elevation[elevation.length - 1].distanceKm)} ${innerBottom} Z`
      : ''

  const tickStep = niceTimeStep((maxDelta - minDelta) / 6)
  const yTicks: number[] = []
  const tickStart = Math.ceil(minDelta / tickStep) * tickStep
  for (let v = tickStart; v <= maxDelta; v += tickStep) yTicks.push(v)
  if (!yTicks.some((t) => Math.abs(t) < 1e-9)) yTicks.push(0)

  const elevTickStep = 500
  const elevTicks: number[] = []
  if (elevation.length > 0) {
    const start = Math.ceil(elevMin / elevTickStep) * elevTickStep
    for (let v = start; v <= elevMax; v += elevTickStep) elevTicks.push(v)
  }

  const empty = selectedRunners.length === 0 && !tomSelected

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
        x: xPos(p.distanceKm),
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
        {elevAreaPath && (
          <>
            <path d={elevAreaPath} fill="#1c2a1f" opacity={0.9} />
            <path
              d={elevAreaPath.replace(/^M [^ ]+ [^ ]+ /, 'M ').replace(/ L [^ ]+ [^ ]+ Z$/, '')}
              fill="none"
              stroke="#3f5a44"
              strokeWidth={1}
            />
          </>
        )}

        {aidStations.map((a, i) => (
          <line
            key={`vline-${i}`}
            x1={xPos(a.distanceKm)}
            x2={xPos(a.distanceKm)}
            y1={m.top}
            y2={innerBottom}
            stroke="#262626"
            strokeDasharray="1,3"
          />
        ))}

        {yTicks.map((t) => {
          const isZero = Math.abs(t) < 1e-9
          return (
            <g key={`yt-${t}`}>
              <line
                x1={m.left}
                x2={width - m.right}
                y1={yPos(t)}
                y2={yPos(t)}
                stroke={isZero ? '#888' : '#1f1f1f'}
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

        {elevTicks.map((t) => (
          <text
            key={`et-${t}`}
            x={width - m.right + 6}
            y={elevY(t) + 4}
            textAnchor="start"
            fill="#5b7a62"
            fontSize="10"
          >
            {t} m
          </text>
        ))}

        <text
          x={m.left - 8}
          y={m.top - 4}
          textAnchor="end"
          fill="#888"
          fontSize="10"
        >
          vs Tom
        </text>
        <text
          x={width - m.right + 6}
          y={m.top - 4}
          textAnchor="start"
          fill="#5b7a62"
          fontSize="10"
        >
          elev
        </text>

        {aidStations.map((a, i) => (
          <g key={`xl-${i}`} transform={`translate(${xPos(a.distanceKm)}, ${innerBottom + 8})`}>
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
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(p.distanceKm)} ${yPos(p.delta)}`)
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
                    cx={xPos(p.distanceKm)}
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

      {empty && (
        <div className="chart-empty-overlay">
          Select runners (click on a row in the Table page) to plot their time delta vs Tom EVANS
          at each aid station.
        </div>
      )}

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
        <span className="legend-item">
          <span className="swatch swatch-elev" />
          Elevation profile
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
