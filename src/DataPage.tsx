import { useState } from 'react'
import type { RaceData } from './types'
import { parseAidStations, parseElevation, parseRaceData } from './raceData'

type Props = {
  raceData: RaceData
  onApply: (data: RaceData) => void
  onReset: () => void
}

export function DataPage({ raceData, onApply, onReset }: Props) {
  const [raceName, setRaceName] = useState(raceData.raceName)
  const [splitsFile, setSplitsFile] = useState<File | null>(null)
  const [gpxFile, setGpxFile] = useState<File | null>(null)
  const [aidFile, setAidFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleApply() {
    if (!splitsFile && !gpxFile && !aidFile && raceName === raceData.raceName) {
      setError('Pick at least one file (or change the race name) before applying.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const splitsText = splitsFile ? await splitsFile.text() : null
      const gpxText = gpxFile ? await gpxFile.text() : null
      const aidText = aidFile ? await aidFile.text() : null

      let next: RaceData
      if (splitsText) {
        next = parseRaceData({
          raceName: raceName || 'Race',
          splitsText,
          gpxText,
          aidStationsText: aidText,
        })
      } else {
        next = {
          raceName: raceName || raceData.raceName,
          runners: raceData.runners,
          elevation: gpxText ? parseElevation(gpxText) : raceData.elevation,
          aidStations: aidText ? parseAidStations(aidText) : raceData.aidStations,
        }
      }

      onApply(next)
      setSplitsFile(null)
      setGpxFile(null)
      setAidFile(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function handleReset() {
    if (!confirm('Reset to bundled UTMB 2025 data? Any uploaded data will be cleared.')) return
    setRaceName('UTMB 2025')
    setSplitsFile(null)
    setGpxFile(null)
    setAidFile(null)
    setError(null)
    onReset()
  }

  const leader = raceData.runners[0]

  return (
    <div className="data-page">
      <section className="data-section">
        <h2>Currently loaded</h2>
        <dl className="data-summary">
          <dt>Race</dt>
          <dd>{raceData.raceName}</dd>
          <dt>Finishers</dt>
          <dd>{raceData.runners.length}</dd>
          <dt>1st place</dt>
          <dd>{leader ? `${leader.firstName} ${leader.lastName}` : '—'}</dd>
          <dt>Aid stations (from splits)</dt>
          <dd>{leader ? leader.splits.length : 0}</dd>
          <dt>Aid station metadata rows</dt>
          <dd>{raceData.aidStations.length}</dd>
          <dt>Elevation samples</dt>
          <dd>{raceData.elevation.length}</dd>
        </dl>
      </section>

      <section className="data-section">
        <h2>Upload new race</h2>
        <p className="hint">
          Replace any of the files below. Splits CSV is required for a full reload; uploading
          only GPX or aid-stations keeps the existing finishers.
        </p>

        <div className="form-row">
          <label htmlFor="race-name">Race name</label>
          <input
            id="race-name"
            type="text"
            value={raceName}
            onChange={(e) => setRaceName(e.target.value)}
            placeholder="e.g., UTMB 2025"
          />
        </div>

        <FilePicker
          label="Finishers CSV (with aid-station times)"
          help="Headers must include rank, bib, first_name, last_name, total_time, and one column per aid station formatted as “Name (12.3km)”."
          file={splitsFile}
          onChange={setSplitsFile}
          accept=".csv,text/csv"
        />

        <FilePicker
          label="Course (GPX)"
          help="Used to render the elevation profile under the chart."
          file={gpxFile}
          onChange={setGpxFile}
          accept=".gpx,application/gpx+xml,application/xml,text/xml"
        />

        <FilePicker
          label="Aid stations CSV (optional)"
          help="Columns: name, type, distance_km, elevation_m, gain_from_prev_m, loss_from_prev_m. Only used for metadata; aid-station positions are read from the finishers CSV."
          file={aidFile}
          onChange={setAidFile}
          accept=".csv,text/csv"
        />

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          <button className="btn-primary" onClick={handleApply} disabled={busy}>
            {busy ? 'Loading…' : 'Apply'}
          </button>
          <button className="btn-secondary" onClick={handleReset} disabled={busy}>
            Reset to bundled UTMB 2025
          </button>
        </div>
      </section>
    </div>
  )
}

function FilePicker({
  label,
  help,
  file,
  onChange,
  accept,
}: {
  label: string
  help?: string
  file: File | null
  onChange: (f: File | null) => void
  accept: string
}) {
  return (
    <div className="file-picker">
      <div className="file-label">{label}</div>
      {help && <div className="file-help">{help}</div>}
      <div className="file-row">
        <label className="file-btn">
          {file ? 'Change…' : 'Choose file…'}
          <input
            type="file"
            accept={accept}
            onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          />
        </label>
        <span className="file-name">{file ? file.name : 'No file selected'}</span>
        {file && (
          <button className="link-btn" onClick={() => onChange(null)}>
            remove
          </button>
        )}
      </div>
    </div>
  )
}
