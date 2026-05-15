export type Split = {
  name: string
  distanceKm: number
  timeStr: string
  seconds: number | null
  segmentSeconds: number | null
  segmentDeltaVsLeaderSeconds: number | null
  segmentPctVsLeader: number | null
  segmentScoreDeltaVsOwn: number | null
}

export type Runner = {
  rank: number
  bib: string
  firstName: string
  lastName: string
  sex: string
  country: string
  category: string
  club: string
  totalTime: string
  // Optional UTMB-specific fields. Absent in races that don't track these.
  utmbIndexRaceDay: number | null
  raceScore: number | null
  currentUtmbIndex: number | null
  splits: Split[]
}

export type ElevationPoint = {
  distanceKm: number
  elevationM: number
}

export type AidStationInfo = {
  name: string
  distanceKm: number
  type?: string
  elevationM?: number
  gainFromPrevM?: number
  lossFromPrevM?: number
}

export type RaceData = {
  raceName: string
  runners: Runner[]
  elevation: ElevationPoint[]
  aidStations: AidStationInfo[]
}
