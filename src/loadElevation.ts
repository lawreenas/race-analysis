export type ElevationPoint = { distanceKm: number; elevationM: number }

const GPX_URL = `${import.meta.env.BASE_URL}UTMB_2025.gpx`

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

export async function loadElevationProfile(): Promise<ElevationPoint[]> {
  const res = await fetch(GPX_URL)
  if (!res.ok) throw new Error(`Failed to load GPX (${res.status})`)
  const text = await res.text()
  const doc = new DOMParser().parseFromString(text, 'application/xml')
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
