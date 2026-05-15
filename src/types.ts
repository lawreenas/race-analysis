export type Split = {
  name: string
  distanceKm: number
  timeStr: string
  seconds: number | null
  segmentSeconds: number | null
  segmentDeltaVsTomSeconds: number | null
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
  utmbIndexRaceDay: number
  raceScore: number
  currentUtmbIndex: number
  splits: Split[]
}
