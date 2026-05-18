import { useCallback, useEffect, useState } from 'react'
import './App.css'
import {
  clearStoredRaceData,
  getLeader,
  loadDefaultRaceData,
  loadStoredRaceData,
  storeRaceData,
} from './raceData'
import { RunnersTable, type DeltaMode } from './RunnersTable'
import { AidStationChart } from './AidStationChart'
import { DataPage } from './DataPage'
import type { RaceData } from './types'

const SELECTED_KEY = 'selected-bibs-v1'
const DELTA_MODE_KEY = 'table-delta-mode-v1'

function readDeltaMode(): DeltaMode {
  const v = localStorage.getItem(DELTA_MODE_KEY)
  return v === 'time' || v === 'percent' ? v : 'percent'
}

type Page = 'table' | 'analysis' | 'data'

function pageFromHash(): Page {
  const h = window.location.hash.replace(/^#\/?/, '')
  if (h === 'analysis' || h === 'chart') return 'analysis'
  if (h === 'data') return 'data'
  return 'table'
}

function readSelected(): Set<string> {
  try {
    const raw = localStorage.getItem(SELECTED_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? (arr as string[]) : [])
  } catch {
    return new Set()
  }
}

function App() {
  const [raceData, setRaceData] = useState<RaceData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(() => readSelected())
  const [page, setPage] = useState<Page>(pageFromHash)
  const [deltaMode, setDeltaMode] = useState<DeltaMode>(readDeltaMode)

  useEffect(() => {
    const stored = loadStoredRaceData()
    if (stored && stored.runners && stored.runners.length > 0) {
      setRaceData(stored)
      setLoading(false)
      return
    }
    loadDefaultRaceData()
      .then(setRaceData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    localStorage.setItem(SELECTED_KEY, JSON.stringify([...selected]))
  }, [selected])

  useEffect(() => {
    localStorage.setItem(DELTA_MODE_KEY, deltaMode)
  }, [deltaMode])

  useEffect(() => {
    const handler = () => setPage(pageFromHash())
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  const toggleSelected = useCallback((bib: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(bib)) next.delete(bib)
      else next.add(bib)
      return next
    })
  }, [])

  const clearSelected = () => setSelected(new Set())

  const navigate = (p: Page) => {
    window.location.hash = `#/${p}`
  }

  const handleApplyData = (data: RaceData) => {
    setRaceData(data)
    setSelected(new Set())
    storeRaceData(data)
    navigate('table')
  }

  const handleResetData = () => {
    clearStoredRaceData()
    setSelected(new Set())
    setLoading(true)
    setError(null)
    loadDefaultRaceData()
      .then(setRaceData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }

  const runners = raceData?.runners ?? []
  const leader = getLeader(runners)
  const outperformedCount = runners.filter(
    (r) =>
      r.raceScore !== null &&
      r.utmbIndexRaceDay !== null &&
      r.raceScore > r.utmbIndexRaceDay,
  ).length
  const showOutperformedStat = runners.some(
    (r) => r.raceScore !== null && r.utmbIndexRaceDay !== null,
  )

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-top">
          <h1>{raceData ? `${raceData.raceName} — Race Analysis` : 'Race Analysis'}</h1>
          <nav className="page-nav">
            <button
              className={`nav-btn ${page === 'table' ? 'active' : ''}`}
              onClick={() => navigate('table')}
            >
              Table
            </button>
            <button
              className={`nav-btn ${page === 'analysis' ? 'active' : ''}`}
              onClick={() => navigate('analysis')}
            >
              Analysis
            </button>
            <button
              className={`nav-btn ${page === 'data' ? 'active' : ''}`}
              onClick={() => navigate('data')}
            >
              Data
            </button>
          </nav>
        </div>
        <p className="subtitle">
          {page === 'table' &&
            (leader
              ? `Δ on each segment is vs ${leader.firstName} ${leader.lastName} (1st place). Click a row to mark a runner.`
              : 'Click a row to mark a runner.')}
          {page === 'analysis' &&
            (leader
              ? `Time delta vs ${leader.firstName} ${leader.lastName} (1st place) at each aid station. Hover for absolute times.`
              : 'Time delta vs 1st place at each aid station. Hover for absolute times.')}
          {page === 'data' && 'Load a different race by uploading its files.'}
          {runners.length > 0 && page === 'table' && showOutperformedStat && (
            <> · {outperformedCount}/{runners.length} outperformed</>
          )}
          {selected.size > 0 && page !== 'data' && (
            <>
              {' · '}
              <span className="selected-pill">{selected.size} selected</span>{' '}
              <button className="link-btn" onClick={clearSelected}>
                clear
              </button>
            </>
          )}
        </p>
      </header>
      <main className="app-main">
        {loading && <p className="placeholder">Loading…</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && raceData && page === 'table' && (
          <>
            <div className="config-bar">
              <div className="config-item">
                <span className="config-label">Δ format</span>
                <div className="segmented">
                  <button
                    className={`seg-btn ${deltaMode === 'percent' ? 'active' : ''}`}
                    onClick={() => setDeltaMode('percent')}
                  >
                    %
                  </button>
                  <button
                    className={`seg-btn ${deltaMode === 'time' ? 'active' : ''}`}
                    onClick={() => setDeltaMode('time')}
                  >
                    Time
                  </button>
                </div>
              </div>
            </div>
            <RunnersTable
              runners={runners}
              selected={selected}
              onToggle={toggleSelected}
              deltaMode={deltaMode}
            />
          </>
        )}
        {!loading && !error && raceData && page === 'analysis' && (
          <AidStationChart raceData={raceData} selected={selected} />
        )}
        {!loading && !error && raceData && page === 'data' && (
          <DataPage
            raceData={raceData}
            onApply={handleApplyData}
            onReset={handleResetData}
          />
        )}
      </main>
    </div>
  )
}

export default App
