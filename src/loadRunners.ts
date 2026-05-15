import { parse } from 'papaparse'
import type { Runner, Split } from './types'

const CSV_URL = `${import.meta.env.BASE_URL}utmb-2025-top100-splits.csv`

const AID_HEADER_RE = /^(.+?)\s*\(([\d.]+)km\)\s*$/

function parseElapsed(s: string | undefined): number | null {
  if (!s) return null
  const trimmed = s.trim()
  if (!trimmed) return null
  const parts = trimmed.split(':').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null
  const [h, m, sec] = parts
  return h * 3600 + m * 60 + sec
}

type AidStation = { col: string; name: string; distanceKm: number }

function computeSegments(secs: (number | null)[]): (number | null)[] {
  return secs.map((cur, i) => {
    if (cur === null) return null
    const prev = i === 0 ? 0 : secs[i - 1]
    if (prev === null) return null
    return cur - prev
  })
}

export async function loadRunners(): Promise<Runner[]> {
  const res = await fetch(CSV_URL)
  if (!res.ok) throw new Error(`Failed to load splits CSV (${res.status})`)
  const text = await res.text()

  const parsed = parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  })

  const headers = parsed.meta.fields ?? []
  const aidStations: AidStation[] = []
  for (const col of headers) {
    const m = col.match(AID_HEADER_RE)
    if (!m) continue
    const distanceKm = Number(m[2])
    if (distanceKm <= 0) continue
    aidStations.push({ col, name: m[1].trim(), distanceKm })
  }

  const rows = parsed.data.map((row) => ({
    row,
    splitSeconds: aidStations.map((a) => parseElapsed(row[a.col])),
  }))

  const referenceRow = rows.find((r) => Number(r.row.rank) === 1) ?? rows[0]
  const referenceSegments = computeSegments(referenceRow.splitSeconds)

  return rows.map(({ row, splitSeconds }) => {
    const segments = computeSegments(splitSeconds)
    const splits: Split[] = aidStations.map((a, idx) => {
      const seconds = splitSeconds[idx]
      const segmentSeconds = segments[idx]
      const refSeg = referenceSegments[idx]
      const segmentDeltaVsTomSeconds =
        segmentSeconds !== null && refSeg !== null ? segmentSeconds - refSeg : null
      return {
        name: a.name,
        distanceKm: a.distanceKm,
        timeStr: (row[a.col] ?? '').trim(),
        seconds,
        segmentSeconds,
        segmentDeltaVsTomSeconds,
      }
    })

    return {
      rank: Number(row.rank),
      bib: row.bib,
      firstName: row.first_name,
      lastName: row.last_name,
      sex: row.sex,
      country: row.country,
      category: row.category,
      club: row.club,
      totalTime: row.total_time,
      utmbIndexRaceDay: Number(row.utmb_index_race_day),
      raceScore: Number(row.race_score),
      currentUtmbIndex: Number(row.current_utmb_index),
      splits,
    }
  })
}
