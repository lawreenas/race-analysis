import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { loadRunners } from './loadRunners'
import { RunnersTable } from './RunnersTable'
import { AidStationChart } from './AidStationChart'
import type { Runner } from './types'

const STORAGE_KEY = 'utmb-selected-bibs'

type Page = 'table' | 'analysis'

function pageFromHash(): Page {
  const h = window.location.hash.replace(/^#\/?/, '')
  return h === 'analysis' || h === 'analysis' ? 'analysis' : 'table'
}

function readSelected(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? (arr as string[]) : [])
  } catch {
    return new Set()
  }
}

function App() {
  const [runners, setRunners] = useState<Runner[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(() => readSelected())
  const [page, setPage] = useState<Page>(pageFromHash)

  useEffect(() => {
    loadRunners()
      .then(setRunners)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...selected]))
  }, [selected])

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

  const outperformedCount = runners.filter((r) => r.raceScore > r.utmbIndexRaceDay).length

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-top">
          <h1>UTMB 2025 — Performance Analysis</h1>
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
          </nav>
        </div>
        <p className="subtitle">
          {page === 'table'
            ? 'Top 100 — checkpoint % is gap vs Tom EVANS (1st place). Rows highlighted in green outperformed their race-day UTMB index. Click a row to mark a runner.'
            : 'Time delta vs Tom EVANS at each aid station for selected runners. Hover a point for the absolute time.'}
          {runners.length > 0 && page === 'table' && (
            <> · {outperformedCount}/{runners.length} outperformed</>
          )}
          {selected.size > 0 && (
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
        {!loading && !error && page === 'table' && (
          <RunnersTable runners={runners} selected={selected} onToggle={toggleSelected} />
        )}
        {!loading && !error && page === 'analysis' && (
          <AidStationChart runners={runners} selected={selected} />
        )}
      </main>
    </div>
  )
}

export default App
