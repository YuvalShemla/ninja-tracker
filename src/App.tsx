import { useEffect, useMemo, useState } from 'react'
import './App.css'

const OBSTACLES = [
  'Steps',
  'Log Grip',
  'Ring Toss',
  'Balance Tank',
  'Cliffhanger',
  'Salmon Ladder',
  'Flying Bar',
  'Warped Wall',
] as const

type Status = 'obstacle' | 'rest' | 'fallen' | 'finished'
type Tab = 'track' | 'results' | 'stats'

type Attempt = {
  obstacle: number
  startedAt: number
  endedAt?: number
  outcome?: 'done' | 'fall'
}

type Rest = {
  afterObstacle: number
  startedAt: number
  endedAt?: number
}

type Competitor = {
  id: string
  name: string
  runStartedAt: number
  status: Status
  currentObstacle: number
  attempts: Attempt[]
  rests: Rest[]
}

type Sample = { name: string; value: number }

const STORAGE_KEY = 'ninja-tracker-competition-v1'

const Icon = ({ name }: { name: 'timer' | 'podium' | 'chart' | 'plus' | 'trash' | 'chevron' }) => {
  const paths = {
    timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 1.5M9 2h6M12 2v3" /></>,
    podium: <><path d="M3 20v-6h5v6M8 20V9h8v11M16 20v-8h5v8M10.5 5.5 12 4l1.5 1.5" /></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
  }
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

const formatTime = (milliseconds: number) => {
  const totalHundredths = Math.max(0, Math.floor(milliseconds / 10))
  const minutes = Math.floor(totalHundredths / 6000)
  const seconds = Math.floor((totalHundredths % 6000) / 100)
  const hundredths = totalHundredths % 100
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`
}

const summarize = (samples: Sample[]) => {
  if (!samples.length) return null
  const values = samples.map((sample) => sample.value)
  return {
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    minimum: Math.min(...values),
    maximum: Math.max(...values),
  }
}

const StatCard = ({ title, label, samples }: { title: string; label: string; samples: Sample[] }) => {
  const [open, setOpen] = useState(false)
  const summary = summarize(samples)

  return (
    <article className={`stat-card ${open ? 'open' : ''}`}>
      <button className="stat-card-trigger" onClick={() => setOpen(!open)} aria-expanded={open}>
        <div>
          <span className="stat-kicker">{label}</span>
          <h3>{title}</h3>
        </div>
        <Icon name="chevron" />
      </button>
      {summary ? (
        <>
          <div className="stat-values">
            <div><span>Average</span><strong>{formatTime(summary.average)}</strong></div>
            <div><span>Minimum</span><strong>{formatTime(summary.minimum)}</strong></div>
            <div><span>Maximum</span><strong>{formatTime(summary.maximum)}</strong></div>
          </div>
          {open && (
            <div className="sample-list">
              {samples.sort((a, b) => a.value - b.value).map((sample, index) => (
                <div key={`${sample.name}-${index}`}>
                  <span>{sample.name}</span>
                  <strong>{formatTime(sample.value)}</strong>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="no-data">No recorded times yet</p>
      )}
    </article>
  )
}

function App() {
  const [tab, setTab] = useState<Tab>('track')
  const [name, setName] = useState('')
  const [now, setNow] = useState(Date.now())
  const [competitors, setCompetitors] = useState<Competitor[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(competitors))
  }, [competitors])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 50)
    return () => window.clearInterval(timer)
  }, [])

  const active = competitors.find((competitor) => competitor.status === 'obstacle' || competitor.status === 'rest')

  const startCompetitor = () => {
    const cleanName = name.trim()
    if (!cleanName || active) return
    const startedAt = Date.now()
    setCompetitors((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: cleanName,
        runStartedAt: startedAt,
        status: 'obstacle',
        currentObstacle: 0,
        attempts: [{ obstacle: 0, startedAt }],
        rests: [],
      },
    ])
    setName('')
  }

  const finishObstacle = () => {
    if (!active || active.status !== 'obstacle') return
    const endedAt = Date.now()
    setCompetitors((current) => current.map((competitor) => {
      if (competitor.id !== active.id) return competitor
      const attempts = competitor.attempts.map((attempt, index) =>
        index === competitor.attempts.length - 1 ? { ...attempt, endedAt, outcome: 'done' as const } : attempt
      )
      if (competitor.currentObstacle === OBSTACLES.length - 1) {
        return { ...competitor, attempts, status: 'finished' }
      }
      return {
        ...competitor,
        attempts,
        status: 'rest',
        rests: [...competitor.rests, { afterObstacle: competitor.currentObstacle, startedAt: endedAt }],
      }
    }))
  }

  const startNextObstacle = () => {
    if (!active || active.status !== 'rest') return
    const startedAt = Date.now()
    setCompetitors((current) => current.map((competitor) => {
      if (competitor.id !== active.id) return competitor
      const nextObstacle = competitor.currentObstacle + 1
      return {
        ...competitor,
        status: 'obstacle',
        currentObstacle: nextObstacle,
        rests: competitor.rests.map((rest, index) =>
          index === competitor.rests.length - 1 ? { ...rest, endedAt: startedAt } : rest
        ),
        attempts: [...competitor.attempts, { obstacle: nextObstacle, startedAt }],
      }
    }))
  }

  const recordFall = () => {
    if (!active || active.status !== 'obstacle') return
    const endedAt = Date.now()
    setCompetitors((current) => current.map((competitor) =>
      competitor.id === active.id
        ? {
            ...competitor,
            status: 'fallen',
            attempts: competitor.attempts.map((attempt, index) =>
              index === competitor.attempts.length - 1
                ? { ...attempt, endedAt, outcome: 'fall' as const }
                : attempt
            ),
          }
        : competitor
    ))
  }

  const ranked = useMemo(() => {
    const resultTime = (competitor: Competitor) => {
      const lastAttempt = competitor.attempts[competitor.attempts.length - 1]
      if (competitor.status === 'finished' && lastAttempt?.endedAt) {
        return lastAttempt.endedAt - competitor.runStartedAt
      }
      return lastAttempt.startedAt - competitor.runStartedAt
    }
    return [...competitors].sort((a, b) => {
      const aFinished = a.status === 'finished' ? 1 : 0
      const bFinished = b.status === 'finished' ? 1 : 0
      return bFinished - aFinished || b.currentObstacle - a.currentObstacle || resultTime(a) - resultTime(b)
    }).map((competitor) => ({ ...competitor, resultTime: resultTime(competitor) }))
  }, [competitors])

  const deleteCompetitor = (id: string) => {
    if (window.confirm('Delete this competitor and all recorded times?')) {
      setCompetitors((current) => current.filter((competitor) => competitor.id !== id))
    }
  }

  const obstacleSamples = (obstacle: number): Sample[] => competitors.flatMap((competitor) => {
    const attempt = competitor.attempts.find((item) => item.obstacle === obstacle)
    return attempt?.endedAt ? [{ name: competitor.name, value: attempt.endedAt - attempt.startedAt }] : []
  })

  const arrivalSamples = (obstacle: number): Sample[] => competitors.flatMap((competitor) => {
    const attempt = competitor.attempts.find((item) => item.obstacle === obstacle)
    return attempt ? [{ name: competitor.name, value: attempt.startedAt - competitor.runStartedAt }] : []
  })

  const restSamples = (restIndex: number): Sample[] => competitors.flatMap((competitor) => {
    const rest = competitor.rests.find((item) => item.afterObstacle === restIndex)
    return rest?.endedAt ? [{ name: competitor.name, value: rest.endedAt - rest.startedAt }] : []
  })

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setTab('track')} aria-label="Ninja Tracker home">
          <span className="brand-mark">N</span>
          <span>Ninja <b>Tracker</b></span>
        </button>
        <span className={`status-pill ${active ? 'live' : ''}`}><i />{active ? 'Course live' : 'Ready'}</span>
      </header>

      <main>
        {tab === 'track' && (
          <section className="page track-page">
            <div className="page-heading">
              <span className="eyebrow">Competition control</span>
              <h1>Track the run.<br /><em>Beat the clock.</em></h1>
              <p>Eight obstacles. One buzzer. Every hundredth counts.</p>
            </div>

            {!active ? (
              <div className="new-run-card">
                <div className="number-stamp">01</div>
                <div className="new-run-copy">
                  <span className="field-label">Next competitor</span>
                  <h2>Who’s on the start line?</h2>
                </div>
                <div className="start-form">
                  <label>
                    <span className="sr-only">Competitor name</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      onKeyDown={(event) => event.key === 'Enter' && startCompetitor()}
                      placeholder="Enter competitor name"
                      autoComplete="off"
                    />
                  </label>
                  <button className="button primary" onClick={startCompetitor} disabled={!name.trim()}>
                    Start run <span>→</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="live-card">
                <div className="live-meta">
                  <div>
                    <span className="field-label">On course</span>
                    <h2>{active.name}</h2>
                  </div>
                  <div className="master-clock">
                    <span>Total time</span>
                    <strong>{formatTime(now - active.runStartedAt)}</strong>
                  </div>
                </div>

                <div className="course-rail" aria-label={`Obstacle ${active.currentObstacle + 1} of 8`}>
                  {OBSTACLES.map((obstacle, index) => {
                    const complete = index < active.currentObstacle || active.status === 'finished'
                    const current = index === active.currentObstacle
                    return (
                      <div className={`rail-stop ${complete ? 'complete' : ''} ${current ? 'current' : ''}`} key={obstacle}>
                        <div className="rail-dot">{complete ? '✓' : index + 1}</div>
                        <span>{obstacle}</span>
                      </div>
                    )
                  })}
                </div>

                <div className={`action-panel ${active.status}`}>
                  <div>
                    <span className="phase-label">{active.status === 'rest' ? `Rest ${active.currentObstacle + 1}` : `Obstacle ${active.currentObstacle + 1} of 8`}</span>
                    <h3>{active.status === 'rest' ? 'Recovery time' : OBSTACLES[active.currentObstacle]}</h3>
                  </div>
                  <div className="phase-clock">
                    {formatTime(now - (
                      active.status === 'rest'
                        ? active.rests[active.rests.length - 1].startedAt
                        : active.attempts[active.attempts.length - 1].startedAt
                    ))}
                  </div>
                  <div className="action-buttons">
                    {active.status === 'obstacle' ? (
                      <>
                        <button className="button danger" onClick={recordFall}>Fall</button>
                        <button className="button success" onClick={finishObstacle}>
                          {active.currentObstacle === 7 ? 'Hit buzzer' : 'Done'} <span>✓</span>
                        </button>
                      </>
                    ) : (
                      <button className="button primary wide" onClick={startNextObstacle}>
                        Start obstacle {active.currentObstacle + 2} <span>→</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="course-key">
              <span>Course map</span>
              <div />
              <small>8 obstacles · 7 rests · 1 buzzer</small>
            </div>
          </section>
        )}

        {tab === 'results' && (
          <section className="page">
            <div className="page-heading compact">
              <span className="eyebrow">Live standings</span>
              <h1>The leaderboard.</h1>
              <p>Farthest obstacle first. Ties are decided by the fastest arrival time.</p>
            </div>
            <div className="leaderboard">
              {ranked.length ? ranked.map((competitor, index) => (
                <article className={`result-row rank-${index + 1}`} key={competitor.id}>
                  <div className="rank">{String(index + 1).padStart(2, '0')}</div>
                  <div className="result-name">
                    <strong>{competitor.name}</strong>
                    <span>
                      {competitor.status === 'finished'
                        ? 'Course complete'
                        : `${OBSTACLES[competitor.currentObstacle]} · ${competitor.status === 'fallen' ? 'Fell' : 'In progress'}`}
                    </span>
                  </div>
                  <div className="result-progress">
                    <span>{competitor.status === 'finished' ? 'Buzzer' : `Obstacle ${competitor.currentObstacle + 1}`}</span>
                    <strong>{formatTime(competitor.resultTime)}</strong>
                  </div>
                  <button className="icon-button" onClick={() => deleteCompetitor(competitor.id)} aria-label={`Delete ${competitor.name}`}>
                    <Icon name="trash" />
                  </button>
                </article>
              )) : (
                <div className="empty-state"><span>8</span><h2>The course is waiting</h2><p>Start the first competitor to build the leaderboard.</p></div>
              )}
            </div>
          </section>
        )}

        {tab === 'stats' && (
          <section className="page">
            <div className="page-heading compact">
              <span className="eyebrow">Course intelligence</span>
              <h1>Every split, <em>exposed.</em></h1>
              <p>Tap any card to see the individual times behind the numbers.</p>
            </div>

            <div className="stats-section">
              <div className="section-title"><span>01</span><div><h2>Obstacle time</h2><p>Time spent on each obstacle, including falls</p></div></div>
              <div className="stats-grid">
                {OBSTACLES.map((obstacle, index) => (
                  <StatCard key={obstacle} title={obstacle} label={`Obstacle ${index + 1}`} samples={obstacleSamples(index)} />
                ))}
              </div>
            </div>

            <div className="stats-section">
              <div className="section-title"><span>02</span><div><h2>Rest time</h2><p>Recovery time between obstacles</p></div></div>
              <div className="stats-grid">
                {OBSTACLES.slice(0, -1).map((_, index) => (
                  <StatCard key={index} title={`After ${OBSTACLES[index]}`} label={`Rest ${index + 1}`} samples={restSamples(index)} />
                ))}
              </div>
            </div>

            <div className="stats-section">
              <div className="section-title"><span>03</span><div><h2>Arrival time</h2><p>Elapsed time from the start to each obstacle</p></div></div>
              <div className="stats-grid">
                {OBSTACLES.map((obstacle, index) => (
                  <StatCard key={obstacle} title={obstacle} label={`Start obstacle ${index + 1}`} samples={arrivalSamples(index)} />
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        <button className={tab === 'track' ? 'active' : ''} onClick={() => setTab('track')}>
          <Icon name={active ? 'timer' : 'plus'} /><span>Track</span>
        </button>
        <button className={tab === 'results' ? 'active' : ''} onClick={() => setTab('results')}>
          <Icon name="podium" /><span>Results</span>
        </button>
        <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>
          <Icon name="chart" /><span>Statistics</span>
        </button>
      </nav>
    </div>
  )
}

export default App
