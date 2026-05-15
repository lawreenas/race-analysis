import { useEffect, useRef, useState } from 'react'
import type { RaceData } from './types'
import { getLeader } from './raceData'

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

type Props = {
  raceData: RaceData
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

export function AidStationChart({ raceData, selected }: Props) {
  const { runners, elevation } = raceData
  const leader = getLeader(runners)
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(1200)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 1200
      setWidth(Math.max(500, Math.floor(w)))
    })
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  if (!leader) {
    return <div ref={wrapRef} className="chart-wrap" />
  }

  const aidStations = leader.splits
  const selectedRunners = runners.filter((r) => selected.has(r.bib) && r.bib !== leader.bib)
  const leaderSelected = selected.has(leader.bib)
  const lastKm = aidStations.length > 0 ? aidStations[aidStations.length - 1].distanceKm : 175

  const series = selectedRunners.map((r, idx) => {
    const points = r.splits
      .map((s, i) => {
        const leaderSec = aidStations[i]?.seconds ?? null
        const runnerSec = s.seconds
        if (leaderSec === null || runnerSec === null) return null
        return {
          idx: i,
          distanceKm: s.distanceKm,
          delta: runnerSec - leaderSec,
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

  const height = 400
  const m = { top: 16, right: 60, bottom: 120, left: 70 }
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

  const empty = selectedRunners.length === 0 && !leaderSelected

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (empty) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    const scaleX = width / rect.width
    const svgX = (e.clientX - rect.left) * scaleX
    if (svgX < m.left - 6 || svgX > width - m.right + 6) {
      setHoveredIdx(null)
      return
    }
    let nearest = 0
    let nearestD = Infinity
    for (let i = 0; i < aidStations.length; i++) {
      const dx = Math.abs(xPos(aidStations[i].distanceKm) - svgX)
      if (dx < nearestD) {
        nearestD = dx
        nearest = i
      }
    }
    setHoveredIdx(nearest)
  }

  function handleMouseLeave() {
    setHoveredIdx(null)
  }

  type TooltipRow = {
    bib: string
    name: string
    color: string | null
    abs: string
    delta: number
    isRef: boolean
  }
  let tooltip: {
    cssLeft: number
    cssTop: number
    aidName: string
    aidKm: number
    rows: TooltipRow[]
    flip: boolean
  } | null = null

  if (hoveredIdx !== null) {
    const a = aidStations[hoveredIdx]
    const leaderSplit = leader.splits[hoveredIdx]
    const rows: TooltipRow[] = []
    rows.push({
      bib: leader.bib,
      name: `${leader.firstName} ${leader.lastName}`,
      color: null,
      abs: leaderSplit.timeStr,
      delta: 0,
      isRef: true,
    })
    for (const s of series) {
      const p = s.points.find((pp) => pp.idx === hoveredIdx)
      if (!p) continue
      rows.push({
        bib: s.runner.bib,
        name: `${s.runner.firstName} ${s.runner.lastName}`,
        color: s.color,
        abs: p.timeStr,
        delta: p.delta,
        isRef: false,
      })
    }
    rows.sort((x, y) => x.delta - y.delta)

    const svg = svgRef.current
    const wrap = wrapRef.current
    let cssLeft = 0
    let cssTop = 0
    let flip = false
    if (svg && wrap) {
      const svgRect = svg.getBoundingClientRect()
      const wrapRect = wrap.getBoundingClientRect()
      const scale = svgRect.width / width
      const xInSvg = xPos(a.distanceKm) * scale
      const offsetLeft = svgRect.left - wrapRect.left
      const offsetTop = svgRect.top - wrapRect.top
      flip = a.distanceKm / lastKm > 0.55
      cssLeft = flip ? offsetLeft + xInSvg - 12 : offsetLeft + xInSvg + 12
      cssTop = offsetTop + m.top * scale + 4
    }
    tooltip = {
      cssLeft,
      cssTop,
      aidName: a.name,
      aidKm: a.distanceKm,
      rows,
      flip,
    }
  }

  return (
    <div ref={wrapRef} className="chart-wrap">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="chart-svg"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {elevAreaPath && <path d={elevAreaPath} fill="#1c2a1f" opacity={0.9} />}

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

        <line
          x1={m.left}
          x2={width - m.right}
          y1={innerBottom}
          y2={innerBottom}
          stroke="#444"
        />

        {aidStations.map((a, i) => {
          const x = xPos(a.distanceKm)
          const isHovered = hoveredIdx === i
          return (
            <g key={`xt-${i}`}>
              <line
                x1={x}
                x2={x}
                y1={innerBottom}
                y2={innerBottom + 5}
                stroke={isHovered ? '#aaa' : '#555'}
                strokeWidth={isHovered ? 1.5 : 1}
              />
            </g>
          )
        })}

        {hoveredIdx !== null && (
          <line
            x1={xPos(aidStations[hoveredIdx].distanceKm)}
            x2={xPos(aidStations[hoveredIdx].distanceKm)}
            y1={m.top}
            y2={innerBottom}
            stroke="#888"
            strokeDasharray="4,3"
            strokeWidth={1}
            pointerEvents="none"
          />
        )}

        <text x={m.left - 8} y={m.top - 4} textAnchor="end" fill="#888" fontSize="10">
          vs 1st
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

        {aidStations.map((a, i) => {
          const isHovered = hoveredIdx === i
          return (
            <g key={`xl-${i}`} transform={`translate(${xPos(a.distanceKm)}, ${innerBottom + 10})`}>
              <g transform="rotate(45)">
                <text
                  fill={isHovered ? '#e5e5e5' : '#888'}
                  fontSize="10"
                  fontWeight={isHovered ? 600 : 400}
                  textAnchor="start"
                >
                  {a.name} ({a.distanceKm.toFixed(1)} km)
                </text>
              </g>
            </g>
          )
        })}

        {series.map(({ runner, points, color }) => {
          if (points.length === 0) return null
          const d = points
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(p.distanceKm)} ${yPos(p.delta)}`)
            .join(' ')
          return (
            <g key={runner.bib}>
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={2}
                pointerEvents="none"
              />
              {points.map((p) => {
                const isHovered = hoveredIdx === p.idx
                return (
                  <circle
                    key={p.idx}
                    cx={xPos(p.distanceKm)}
                    cy={yPos(p.delta)}
                    r={isHovered ? 5.5 : 3}
                    fill={color}
                    stroke={isHovered ? '#fff' : 'none'}
                    strokeWidth={1.5}
                    pointerEvents="none"
                  />
                )
              })}
            </g>
          )
        })}
      </svg>

      {empty && (
        <div className="chart-empty-overlay">
          Select runners (click a row on the Table page) to plot their time delta vs{' '}
          {leader.firstName} {leader.lastName} (1st place) at each aid station.
        </div>
      )}

      {tooltip && (
        <div
          className="chart-tooltip unified"
          style={{
            left: tooltip.cssLeft,
            top: tooltip.cssTop,
            transform: tooltip.flip ? 'translateX(-100%)' : undefined,
          }}
        >
          <div className="tt-aid">
            {tooltip.aidName} · {tooltip.aidKm.toFixed(1)} km
          </div>
          <div className="tt-rows">
            {tooltip.rows.map((r) => (
              <div key={r.bib} className={`tt-runner-row ${r.isRef ? 'ref' : ''}`}>
                <span
                  className={`swatch ${r.isRef ? 'swatch-ref' : ''}`}
                  style={r.isRef || !r.color ? undefined : { background: r.color }}
                />
                <span className="tt-runner-name">{r.name}</span>
                <span className="tt-time">{r.abs || '—'}</span>
                <span
                  className={`tt-delta ${
                    r.isRef ? '' : r.delta > 0 ? 'neg' : r.delta < 0 ? 'pos' : ''
                  }`}
                >
                  {r.isRef ? 'ref' : formatDelta(r.delta)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="chart-legend">
        <span className="legend-item">
          <span className="swatch swatch-ref" />
          {leader.firstName} {leader.lastName} (reference)
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
