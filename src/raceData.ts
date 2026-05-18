import { parse } from 'papaparse'
import type {
  AidStationInfo,
  ElevationPoint,
  RaceData,
  Runner,
  Split,
} from './types'

const BASE = import.meta.env.BASE_URL
const STORAGE_KEY = 'race-data-v1'

const DEFAULTS = {
  raceName: 'UTMB 2025',
  splitsUrl: `${BASE}utmb-2025-top100-splits.csv`,
  gpxUrl: `${BASE}UTMB_2025.gpx`,
  aidStationsUrl: `${BASE}utmb-aid-stations.csv`,
}

const AID_HEADER_RE = /^(.+?)\s*\(([\d.]+)\s*km\)\s*$/i

function parseElapsed(s: string | undefined): number | null {
  if (!s) return null
  const trimmed = s.trim()
  if (!trimmed) return null
  const parts = trimmed.split(':').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null
  const [h, m, sec] = parts
  return h * 3600 + m * 60 + sec
}

function computeSegments(secs: (number | null)[]): (number | null)[] {
  return secs.map((cur, i) => {
    if (cur === null) return null
    const prev = i === 0 ? 0 : secs[i - 1]
    if (prev === null) return null
    return cur - prev
  })
}

function numOrNull(v: string | undefined): number | null {
  if (v === undefined) return null
  const trimmed = v.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

export function parseRunners(csvText: string): Runner[] {
  const parsed = parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  })
  const headers = parsed.meta.fields ?? []

  type AidCol = { col: string; name: string; distanceKm: number }
  const aidCols: AidCol[] = []
  for (const col of headers) {
    const m = col.match(AID_HEADER_RE)
    if (!m) continue
    const distanceKm = Number(m[2])
    if (distanceKm <= 0) continue
    aidCols.push({ col, name: m[1].trim(), distanceKm })
  }
  if (aidCols.length === 0) {
    throw new Error(
      'No aid-station columns found. Expected headers like "Col de Voza (14.6km)".',
    )
  }

  const rows = parsed.data.map((row) => ({
    row,
    splitSeconds: aidCols.map((a) => parseElapsed(row[a.col])),
  }))

  const referenceRow = rows.find((r) => Number(r.row.rank) === 1) ?? rows[0]
  const referenceSegments = computeSegments(referenceRow.splitSeconds)

  return rows.map(({ row, splitSeconds }) => {
    const segments = computeSegments(splitSeconds)
    const splits: Split[] = aidCols.map((a, idx) => {
      const seconds = splitSeconds[idx]
      const segmentSeconds = segments[idx]
      const refSeg = referenceSegments[idx]
      const segmentDeltaVsLeaderSeconds =
        segmentSeconds !== null && refSeg !== null ? segmentSeconds - refSeg : null
      const segmentPctVsLeader =
        segmentSeconds !== null && refSeg !== null && refSeg > 0
          ? ((segmentSeconds - refSeg) / refSeg) * 100
          : null
      return {
        name: a.name,
        distanceKm: a.distanceKm,
        timeStr: (row[a.col] ?? '').trim(),
        seconds,
        segmentSeconds,
        segmentDeltaVsLeaderSeconds,
        segmentPctVsLeader,
      }
    })

    return {
      rank: Number(row.rank),
      bib: row.bib ?? String(row.rank),
      firstName: row.first_name ?? '',
      lastName: row.last_name ?? '',
      sex: row.sex ?? '',
      country: row.country ?? '',
      category: row.category ?? '',
      club: row.club ?? '',
      totalTime: row.total_time ?? '',
      utmbIndexRaceDay: numOrNull(row.utmb_index_race_day),
      raceScore: numOrNull(row.race_score),
      currentUtmbIndex: numOrNull(row.current_utmb_index),
      splits,
    }
  })
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function parseElevation(gpxText: string): ElevationPoint[] {
  const doc = new DOMParser().parseFromString(gpxText, 'application/xml')
  const trkpts = Array.from(doc.getElementsByTagName('trkpt'))

  const points: ElevationPoint[] = []
  let cumKm = 0
  let prevLat: number | null = null
  let prevLon: number | null = null

  for (const pt of trkpts) {
    const lat = Number(pt.getAttribute('lat'))
    const lon = Number(pt.getAttribute('lon'))
    const eleEl = pt.getElementsByTagName('ele')[0]
    const ele = eleEl ? Number(eleEl.textContent) : NaN
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(ele)) continue
    if (prevLat !== null && prevLon !== null) {
      cumKm += haversineKm(prevLat, prevLon, lat, lon)
    }
    points.push({ distanceKm: cumKm, elevationM: ele })
    prevLat = lat
    prevLon = lon
  }

  const TARGET = 1500
  if (points.length <= TARGET) return points
  const stride = Math.ceil(points.length / TARGET)
  const sampled: ElevationPoint[] = []
  for (let i = 0; i < points.length; i += stride) sampled.push(points[i])
  if (sampled[sampled.length - 1] !== points[points.length - 1]) {
    sampled.push(points[points.length - 1])
  }
  return sampled
}

export function parseAidStations(csvText: string): AidStationInfo[] {
  const parsed = parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  })
  const out: AidStationInfo[] = []
  for (const row of parsed.data) {
    const distanceKm = numOrNull(row.distance_km)
    if (distanceKm === null) continue
    const info: AidStationInfo = {
      name: row.name ?? '',
      distanceKm,
    }
    if (row.type) info.type = row.type
    const elev = numOrNull(row.elevation_m)
    if (elev !== null) info.elevationM = elev
    const gain = numOrNull(row.gain_from_prev_m)
    if (gain !== null) info.gainFromPrevM = gain
    const loss = numOrNull(row.loss_from_prev_m)
    if (loss !== null) info.lossFromPrevM = loss
    out.push(info)
  }
  return out
}

export type ParseRaceInput = {
  raceName: string
  splitsText: string
  gpxText?: string | null
  aidStationsText?: string | null
}

export function parseRaceData(input: ParseRaceInput): RaceData {
  return {
    raceName: input.raceName,
    runners: parseRunners(input.splitsText),
    elevation: input.gpxText ? parseElevation(input.gpxText) : [],
    aidStations: input.aidStationsText ? parseAidStations(input.aidStationsText) : [],
  }
}

export async function loadDefaultRaceData(): Promise<RaceData> {
  const [splitsRes, gpxRes, aidRes] = await Promise.all([
    fetch(DEFAULTS.splitsUrl),
    fetch(DEFAULTS.gpxUrl),
    fetch(DEFAULTS.aidStationsUrl),
  ])
  if (!splitsRes.ok) throw new Error(`Failed to load splits (${splitsRes.status})`)
  const splitsText = await splitsRes.text()
  const gpxText = gpxRes.ok ? await gpxRes.text() : null
  const aidText = aidRes.ok ? await aidRes.text() : null
  return parseRaceData({
    raceName: DEFAULTS.raceName,
    splitsText,
    gpxText,
    aidStationsText: aidText,
  })
}

export function storeRaceData(data: RaceData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return true
  } catch (e) {
    console.warn('Could not persist race data:', e)
    return false
  }
}

export function loadStoredRaceData(): RaceData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as RaceData
  } catch {
    return null
  }
}

export function clearStoredRaceData() {
  localStorage.removeItem(STORAGE_KEY)
}

export function getLeader(runners: Runner[]): Runner | null {
  return runners.find((r) => r.rank === 1) ?? runners[0] ?? null
}
