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
type Tab = 'track' | 'results' | 'stats' | 'settings'

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
  group: string
  obstacles?: string[]
  runStartedAt: number
  status: Status
  currentObstacle: number
  attempts: Attempt[]
  rests: Rest[]
}

type ArchivedSession = {
  id: string
  startedAt: number
  endedAt: number
  obstacles: string[]
  groupObstacles?: Record<string, string[]>
  groups: string[]
  competitors: Competitor[]
}

type StoredData = {
  sessionStartedAt: number
  obstacles: string[]
  groupObstacles?: Record<string, string[]>
  groups: string[]
  competitors: Competitor[]
  history: ArchivedSession[]
}

type Sample = { name: string; value: number }

const STORAGE_KEY = 'ninja-tracker-competition-v2'
const LEGACY_STORAGE_KEY = 'ninja-tracker-competition-v1'

const loadData = (): StoredData => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const data = JSON.parse(saved) as StoredData
      const fallbackObstacles = data.obstacles ?? [...OBSTACLES]
      const groupObstacles = data.groupObstacles ?? Object.fromEntries(
        data.groups.map((group) => [group, [...fallbackObstacles]])
      )
      return {
        ...data,
        obstacles: fallbackObstacles,
        groupObstacles,
        competitors: data.competitors.map((competitor) => ({
          ...competitor,
          obstacles: competitor.obstacles ?? [...(groupObstacles[competitor.group] ?? fallbackObstacles)],
        })),
        history: data.history.map((session) => {
          const sessionObstacles = session.obstacles ?? [...OBSTACLES]
          const sessionGroupObstacles = session.groupObstacles ?? Object.fromEntries(
            session.groups.map((group) => [group, [...sessionObstacles]])
          )
          return {
            ...session,
            obstacles: sessionObstacles,
            groupObstacles: sessionGroupObstacles,
            competitors: session.competitors.map((competitor) => ({
              ...competitor,
              obstacles: competitor.obstacles ?? [...(sessionGroupObstacles[competitor.group] ?? sessionObstacles)],
            })),
          }
        }),
      }
    }
    const legacy: Competitor[] = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) ?? '[]')
    return {
      sessionStartedAt: Date.now(),
      obstacles: [...OBSTACLES],
      groupObstacles: { General: [...OBSTACLES] },
      groups: ['General'],
      competitors: legacy.map((competitor) => ({ ...competitor, group: competitor.group ?? 'General' })),
      history: [],
    }
  } catch {
    return {
      sessionStartedAt: Date.now(),
      obstacles: [...OBSTACLES],
      groupObstacles: { General: [...OBSTACLES] },
      groups: ['General'],
      competitors: [],
      history: [],
    }
  }
}

const Icon = ({ name }: { name: 'timer' | 'podium' | 'chart' | 'plus' | 'trash' | 'chevron' | 'settings' }) => {
  const paths = {
    timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 1.5M9 2h6M12 2v3" /></>,
    podium: <><path d="M3 20v-6h5v6M8 20V9h8v11M16 20v-8h5v8M10.5 5.5 12 4l1.5 1.5" /></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.97 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88L4.2 7.06l2.83-2.83.06.06A1.7 1.7 0 0 0 8.97 4.6 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15.03 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9 1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" /></>,
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

const formatSessionDate = (timestamp: number) => new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}).format(timestamp)

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
  const initialData = useMemo(loadData, [])
  const [tab, setTab] = useState<Tab>('track')
  const [name, setName] = useState('')
  const [group, setGroup] = useState(initialData.groups[0] ?? 'General')
  const [newGroup, setNewGroup] = useState('')
  const [addingGroup, setAddingGroup] = useState(false)
  const [groupObstacles, setGroupObstacles] = useState<Record<string, string[]>>(
    initialData.groupObstacles ?? { General: [...initialData.obstacles] }
  )
  const [settingsGroup, setSettingsGroup] = useState(initialData.groups[0] ?? 'General')
  const [groups, setGroups] = useState(initialData.groups)
  const [sessionStartedAt, setSessionStartedAt] = useState(initialData.sessionStartedAt)
  const [history, setHistory] = useState<ArchivedSession[]>(initialData.history)
  const [viewSessionId, setViewSessionId] = useState('current')
  const [statsGroup, setStatsGroup] = useState('all')
  const [now, setNow] = useState(Date.now())
  const [competitors, setCompetitors] = useState<Competitor[]>(initialData.competitors)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      sessionStartedAt,
      obstacles: groupObstacles.General ?? [...OBSTACLES],
      groupObstacles,
      groups,
      competitors,
      history,
    }))
  }, [sessionStartedAt, groupObstacles, groups, competitors, history])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 50)
    return () => window.clearInterval(timer)
  }, [])

  const active = competitors.find((competitor) => competitor.status === 'obstacle' || competitor.status === 'rest')
  const activeObstacles = active?.obstacles ?? (active ? groupObstacles[active.group] : undefined) ?? [...OBSTACLES]
  const viewedSession = viewSessionId === 'current'
    ? { id: 'current', startedAt: sessionStartedAt, obstacles: groupObstacles.General ?? [...OBSTACLES], groupObstacles, groups, competitors }
    : history.find((session) => session.id === viewSessionId) ?? {
        id: 'current',
        startedAt: sessionStartedAt,
        obstacles: groupObstacles.General ?? [...OBSTACLES],
        groupObstacles,
        groups,
        competitors,
      }
  const viewedCompetitors = viewedSession.competitors
  const viewedGroupObstacles = viewedSession.groupObstacles ?? Object.fromEntries(
    viewedSession.groups.map((group) => [group, [...viewedSession.obstacles]])
  )
  const viewedGroups = viewedSession.groups.filter((item) => viewedCompetitors.some((competitor) => competitor.group === item))
  const statsCompetitors = statsGroup === 'all'
    ? viewedCompetitors
    : viewedCompetitors.filter((competitor) => competitor.group === statsGroup)

  const addGroup = () => {
    const cleanGroup = newGroup.trim()
    if (!cleanGroup) return
    const existingGroup = groups.find((item) => item.toLowerCase() === cleanGroup.toLowerCase())
    if (!existingGroup) {
      setGroups((current) => [...current, cleanGroup])
      setGroupObstacles((current) => ({
        ...current,
        [cleanGroup]: [...(current.General ?? OBSTACLES)],
      }))
    }
    setGroup(existingGroup ?? cleanGroup)
    setNewGroup('')
    setAddingGroup(false)
  }

  const startCompetitor = () => {
    const cleanName = name.trim()
    if (!cleanName || !group || active) return
    const startedAt = Date.now()
    setCompetitors((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: cleanName,
        group,
        obstacles: [...(groupObstacles[group] ?? groupObstacles.General ?? OBSTACLES)],
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
      if (competitor.currentObstacle === activeObstacles.length - 1) {
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

  const rankCompetitors = (list: Competitor[]) => {
    const resultTime = (competitor: Competitor) => {
      const lastAttempt = competitor.attempts[competitor.attempts.length - 1]
      if (competitor.status === 'finished' && lastAttempt?.endedAt) {
        return lastAttempt.endedAt - competitor.runStartedAt
      }
      return lastAttempt.startedAt - competitor.runStartedAt
    }
    return [...list].sort((a, b) => {
      const aFinished = a.status === 'finished' ? 1 : 0
      const bFinished = b.status === 'finished' ? 1 : 0
      return bFinished - aFinished || b.currentObstacle - a.currentObstacle || resultTime(a) - resultTime(b)
    }).map((competitor) => ({ ...competitor, resultTime: resultTime(competitor) }))
  }

  const resetSession = () => {
    const message = active
      ? 'A competitor is still on course. Archive this session and start a new one?'
      : 'Archive this session and start a new recording session?'
    if (!window.confirm(message)) return
    const endedAt = Date.now()
    setHistory((current) => [{
      id: crypto.randomUUID(),
      startedAt: sessionStartedAt,
      endedAt,
      obstacles: [...(groupObstacles.General ?? OBSTACLES)],
      groupObstacles: Object.fromEntries(
        Object.entries(groupObstacles).map(([groupName, names]) => [groupName, [...names]])
      ),
      groups,
      competitors,
    }, ...current])
    setCompetitors([])
    setGroups(['General'])
    setGroupObstacles({ General: [...(groupObstacles.General ?? OBSTACLES)] })
    setGroup('General')
    setSettingsGroup('General')
    setSessionStartedAt(endedAt)
    setViewSessionId('current')
    setStatsGroup('all')
    setTab('track')
  }

  const deleteHistorySession = (id: string) => {
    if (!window.confirm('Permanently delete this recorded session?')) return
    setHistory((current) => current.filter((session) => session.id !== id))
    if (viewSessionId === id) {
      setViewSessionId('current')
      setStatsGroup('all')
      setTab('track')
    }
  }

  const deleteCompetitor = (id: string) => {
    if (window.confirm('Delete this competitor and all recorded times?')) {
      setCompetitors((current) => current.filter((competitor) => competitor.id !== id))
    }
  }

  const normalizeObstacle = (name: string) => name.trim().toLocaleLowerCase()
  const courseForCompetitor = (competitor: Competitor) =>
    competitor.obstacles ?? viewedGroupObstacles[competitor.group] ?? viewedSession.obstacles
  const statsObstacleNames = (() => {
    const source = statsCompetitors.length
      ? statsCompetitors.flatMap(courseForCompetitor)
      : statsGroup === 'all'
        ? viewedGroups.flatMap((groupName) => viewedGroupObstacles[groupName] ?? [])
        : viewedGroupObstacles[statsGroup] ?? []
    const unique = new Map<string, string>()
    source.forEach((name) => {
      const normalized = normalizeObstacle(name)
      if (normalized && !unique.has(normalized)) unique.set(normalized, name.trim())
    })
    return [...unique.values()]
  })()
  const statsRestNames = (() => {
    const courses = statsCompetitors.length
      ? statsCompetitors.map(courseForCompetitor)
      : statsGroup === 'all'
        ? viewedGroups.map((groupName) => viewedGroupObstacles[groupName] ?? [])
        : [viewedGroupObstacles[statsGroup] ?? []]
    const unique = new Map<string, string>()
    courses.flatMap((course) => course.slice(0, -1)).forEach((name) => {
      const normalized = normalizeObstacle(name)
      if (normalized && !unique.has(normalized)) unique.set(normalized, name.trim())
    })
    return [...unique.values()]
  })()
  const sampleName = (competitor: Competitor) =>
    statsGroup === 'all' ? `${competitor.name} · ${competitor.group}` : competitor.name

  const obstacleSamples = (obstacleName: string): Sample[] => statsCompetitors.flatMap((competitor) =>
    competitor.attempts.flatMap((attempt) => {
      const courseName = courseForCompetitor(competitor)[attempt.obstacle]
      return attempt.endedAt && normalizeObstacle(courseName ?? '') === normalizeObstacle(obstacleName)
        ? [{ name: sampleName(competitor), value: attempt.endedAt - attempt.startedAt }]
        : []
    })
  )

  const arrivalSamples = (obstacleName: string): Sample[] => statsCompetitors.flatMap((competitor) =>
    competitor.attempts.flatMap((attempt) => {
      const courseName = courseForCompetitor(competitor)[attempt.obstacle]
      return normalizeObstacle(courseName ?? '') === normalizeObstacle(obstacleName)
        ? [{ name: sampleName(competitor), value: attempt.startedAt - competitor.runStartedAt }]
        : []
    })
  )

  const restSamples = (obstacleName: string): Sample[] => statsCompetitors.flatMap((competitor) =>
    competitor.rests.flatMap((rest) => {
      const courseName = courseForCompetitor(competitor)[rest.afterObstacle]
      return rest.endedAt && normalizeObstacle(courseName ?? '') === normalizeObstacle(obstacleName)
        ? [{ name: sampleName(competitor), value: rest.endedAt - rest.startedAt }]
        : []
    })
  )
  const settingsObstacles = groupObstacles[settingsGroup] ?? groupObstacles.General ?? [...OBSTACLES]

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setTab('track')} aria-label="Ninja Tracker home">
          <span className="brand-mark">N</span>
          <span>Ninja <b>Tracker</b></span>
        </button>
        <div className="topbar-actions">
          <span className={`status-pill ${active ? 'live' : ''}`}><i />{active ? 'Course live' : 'Ready'}</span>
          <button className="reset-button" onClick={resetSession}>New session</button>
        </div>
      </header>

      <div className="session-bar">
        <span>History</span>
        <div className="session-scroll">
          <button
            className={viewSessionId === 'current' ? 'active' : ''}
            onClick={() => { setViewSessionId('current'); setStatsGroup('all') }}
          >
            <i /> Current · {formatSessionDate(sessionStartedAt)}
          </button>
          {history.map((session) => (
            <div className={`history-item ${viewSessionId === session.id ? 'active' : ''}`} key={session.id}>
              <button onClick={() => { setViewSessionId(session.id); setStatsGroup('all'); setTab('results') }}>
                {formatSessionDate(session.startedAt)}
              </button>
              <button
                className="history-delete"
                onClick={() => deleteHistorySession(session.id)}
                aria-label={`Delete session from ${formatSessionDate(session.startedAt)}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <main>
        {tab === 'track' && (
          <section className={`page track-page ${active ? 'run-active' : ''}`}>
            {!active ? (
              <div className="new-run-card">
                <div className="number-stamp">01</div>
                <div className="new-run-copy">
                  <span className="field-label">Next competitor</span>
                  <h2>Who’s on the start line?</h2>
                </div>
                <div className="start-form">
                  <div className="group-picker">
                    <label>
                      <span className="sr-only">Competitor group</span>
                      <select value={group} onChange={(event) => setGroup(event.target.value)}>
                        {groups.map((item) => <option key={item}>{item}</option>)}
                      </select>
                    </label>
                    <button className="add-group-button" onClick={() => setAddingGroup(!addingGroup)} aria-expanded={addingGroup}>
                      + Group
                    </button>
                  </div>
                  {addingGroup && (
                    <div className="new-group-row">
                      <input
                        value={newGroup}
                        onChange={(event) => setNewGroup(event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && addGroup()}
                        placeholder="Group name"
                        autoFocus
                      />
                      <button className="button primary" onClick={addGroup} disabled={!newGroup.trim()}>Add</button>
                    </div>
                  )}
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
                    <span className="field-label">On course · {active.group}</span>
                    <h2>{active.name}</h2>
                  </div>
                  <div className="master-clock">
                    <span>Total time</span>
                    <strong>{formatTime(now - active.runStartedAt)}</strong>
                  </div>
                </div>

                <div className="course-rail" aria-label={`Obstacle ${active.currentObstacle + 1} of 8`}>
                  {activeObstacles.map((obstacle, index) => {
                    const complete = index < active.currentObstacle || active.status === 'finished'
                    const current = index === active.currentObstacle
                    return (
                      <div className={`rail-stop ${complete ? 'complete' : ''} ${current ? 'current' : ''}`} key={index}>
                        <div className="rail-dot">{complete ? '✓' : index + 1}</div>
                        <span>{obstacle}</span>
                      </div>
                    )
                  })}
                </div>

                <div className={`action-panel ${active.status}`}>
                  <div>
                    <span className="phase-label">{active.status === 'rest' ? `Rest ${active.currentObstacle + 1}` : `Obstacle ${active.currentObstacle + 1} of 8`}</span>
                    <h3>{active.status === 'rest' ? 'Recovery time' : activeObstacles[active.currentObstacle]}</h3>
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
              {viewedCompetitors.length ? viewedGroups.map((groupName) => {
                const groupRanked = rankCompetitors(viewedCompetitors.filter((competitor) => competitor.group === groupName))
                return (
                  <section className="group-results" key={groupName}>
                    <div className="group-heading">
                      <span>{groupName}</span>
                      <small>{groupRanked.length} competitor{groupRanked.length === 1 ? '' : 's'}</small>
                    </div>
                    {groupRanked.map((competitor, index) => (
                      <article className={`result-row rank-${index + 1}`} key={competitor.id}>
                        <div className="rank">{String(index + 1).padStart(2, '0')}</div>
                        <div className="result-name">
                          <strong>{competitor.name}</strong>
                          <span>
                            {competitor.status === 'finished'
                              ? 'Course complete'
                              : `${courseForCompetitor(competitor)[competitor.currentObstacle]} · ${competitor.status === 'fallen' ? 'Fell' : 'In progress'}`}
                          </span>
                        </div>
                        <div className="result-progress">
                          <span>{competitor.status === 'finished' ? 'Buzzer' : `Obstacle ${competitor.currentObstacle + 1}`}</span>
                          <strong>{formatTime(competitor.resultTime)}</strong>
                        </div>
                        {viewSessionId === 'current' && (
                          <button className="icon-button" onClick={() => deleteCompetitor(competitor.id)} aria-label={`Delete ${competitor.name}`}>
                            <Icon name="trash" />
                          </button>
                        )}
                      </article>
                    ))}
                  </section>
                )
              }) : (
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

            <div className="stats-filter" aria-label="Statistics scope">
              <span>Showing</span>
              <button className={statsGroup === 'all' ? 'active' : ''} onClick={() => setStatsGroup('all')}>All groups</button>
              {viewedGroups.map((item) => (
                <button key={item} className={statsGroup === item ? 'active' : ''} onClick={() => setStatsGroup(item)}>{item}</button>
              ))}
            </div>

            <div className="stats-section">
              <div className="section-title"><span>01</span><div><h2>Obstacle time</h2><p>Time spent on each obstacle, including falls</p></div></div>
              <div className="stats-grid">
                {statsObstacleNames.map((obstacle, index) => (
                  <StatCard
                    key={normalizeObstacle(obstacle)}
                    title={obstacle}
                    label={statsGroup === 'all' ? 'All groups' : `Obstacle ${index + 1}`}
                    samples={obstacleSamples(obstacle)}
                  />
                ))}
              </div>
            </div>

            <div className="stats-section">
              <div className="section-title"><span>02</span><div><h2>Rest time</h2><p>Recovery time between obstacles</p></div></div>
              <div className="stats-grid">
                {statsRestNames.map((obstacle, index) => (
                  <StatCard
                    key={normalizeObstacle(obstacle)}
                    title={`After ${obstacle}`}
                    label={statsGroup === 'all' ? 'All groups' : `Rest ${index + 1}`}
                    samples={restSamples(obstacle)}
                  />
                ))}
              </div>
            </div>

            <div className="stats-section">
              <div className="section-title"><span>03</span><div><h2>Arrival time</h2><p>Elapsed time from the start to each obstacle</p></div></div>
              <div className="stats-grid">
                {statsObstacleNames.map((obstacle) => (
                  <StatCard key={normalizeObstacle(obstacle)} title={obstacle} label={`Start ${obstacle}`} samples={arrivalSamples(obstacle)} />
                ))}
              </div>
            </div>
          </section>
        )}

        {tab === 'settings' && (
          <section className="page settings-page">
            <div className="page-heading compact">
              <span className="eyebrow">Course setup</span>
              <h1>Name the obstacles.</h1>
              <p>Each group can have its own course. Matching obstacle names are combined in global statistics.</p>
            </div>
            <div className="settings-groups">
              <span>Edit course for</span>
              {groups.map((groupName) => (
                <button
                  key={groupName}
                  className={settingsGroup === groupName ? 'active' : ''}
                  onClick={() => setSettingsGroup(groupName)}
                >
                  {groupName}
                </button>
              ))}
            </div>
            <div className="obstacle-settings">
              {settingsObstacles.map((obstacle, index) => (
                <label key={index}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <small>Obstacle {index + 1}</small>
                    <input
                      value={obstacle}
                      onChange={(event) => setGroupObstacles((current) => ({
                        ...current,
                        [settingsGroup]: settingsObstacles.map((item, itemIndex) =>
                          itemIndex === index ? event.target.value : item
                        ),
                      }))}
                      onBlur={() => {
                        if (!obstacle.trim()) {
                          setGroupObstacles((current) => ({
                            ...current,
                            [settingsGroup]: settingsObstacles.map((item, itemIndex) =>
                              itemIndex === index ? OBSTACLES[index] : item
                            ),
                          }))
                        }
                      }}
                    />
                  </div>
                </label>
              ))}
            </div>
            <button
              className="restore-button"
              onClick={() => setGroupObstacles((current) => ({ ...current, [settingsGroup]: [...OBSTACLES] }))}
            >
              Restore default names for {settingsGroup}
            </button>
          </section>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        <button className={tab === 'track' ? 'active' : ''} onClick={() => { setViewSessionId('current'); setTab('track') }}>
          <Icon name={active ? 'timer' : 'plus'} /><span>Track</span>
        </button>
        <button className={tab === 'results' ? 'active' : ''} onClick={() => setTab('results')}>
          <Icon name="podium" /><span>Results</span>
        </button>
        <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>
          <Icon name="chart" /><span>Statistics</span>
        </button>
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => { setViewSessionId('current'); setTab('settings') }}>
          <Icon name="settings" /><span>Settings</span>
        </button>
      </nav>
    </div>
  )
}

export default App
