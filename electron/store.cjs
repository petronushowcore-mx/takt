const fs = require('node:fs/promises')
const path = require('node:path')
const { isDeepStrictEqual } = require('node:util')

const missingFile = Symbol('missing file')

function validProfile(state) {
  return state?.version === 1 && Array.isArray(state.sessions)
}

function validSession(session) {
  return session?.schemaVersion === 1 && typeof session.id === 'string' && session.id.length > 0 &&
    typeof session.endedAt === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(session.endedAt) &&
    Number.isFinite(Date.parse(session.endedAt))
}

function validReset(state) {
  return validProfile(state) && state.sessions.length === 0 &&
    Object.keys(state.lessonProgress ?? {}).length === 0 && Object.keys(state.achievements ?? {}).length === 0
}

function sameSession(left, right) {
  return isDeepStrictEqual(JSON.parse(JSON.stringify(left)), JSON.parse(JSON.stringify(right)))
}

function requireSessionIn(state, session) {
  const matches = state.sessions.filter((item) => item?.id === session.id)
  if (matches.length !== 1 || !sameSession(matches[0], session)) {
    throw new Error('Снимок профиля не совпадает с сохраняемой тренировкой')
  }
}

class DataStore {
  #writes = Promise.resolve()
  #journals = new Map()

  constructor(baseDirectory) {
    this.baseDirectory = baseDirectory
    this.profilePath = path.join(baseDirectory, 'profile.json')
    this.logDirectory = path.join(baseDirectory, 'logs')
    this.pendingPath = path.join(baseDirectory, 'pending-session.json')
  }

  async ensure() {
    await fs.mkdir(this.baseDirectory, { recursive: true })
    await fs.mkdir(this.logDirectory, { recursive: true })
  }

  #enqueue(write) {
    const result = this.#writes.then(write)
    this.#writes = result.catch(() => {})
    return result
  }

  async #readJson(file, missing = null) {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') return missing
      throw error
    }
  }

  async #writeJson(file, value) {
    const temporary = file + '.tmp'
    await fs.writeFile(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', flush: true })
    await fs.rename(temporary, file)
  }

  async #readPending() {
    const pending = await this.#readJson(this.pendingPath, missingFile)
    if (pending === missingFile) return null
    if (pending?.version !== 1 || !validProfile(pending.state)) throw new Error('Некорректная запись восстановления')
    if (pending.kind === 'reset' && validReset(pending.state)) return pending
    if (pending.kind === 'session' && pending.event?.schema === 'klavish.event.v1' &&
        pending.event.type === 'session_completed' && validSession(pending.event.data)) {
      requireSessionIn(pending.state, pending.event.data)
      return pending
    }
    throw new Error('Некорректная запись восстановления')
  }

  #event(session, appVersion) {
    return {
      schema: 'klavish.event.v1',
      type: 'session_completed',
      recordedAt: new Date().toISOString(),
      appVersion,
      data: session,
    }
  }

  async #readJournal(file) {
    let contents
    try {
      contents = await fs.readFile(file, 'utf8')
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      contents = ''
    }
    const sessions = new Map()
    for (const line of contents.split('\n')) {
      if (!line.trim()) continue
      let event
      try { event = JSON.parse(line) } catch { continue }
      if (event?.schema === 'klavish.event.v1' && event.type === 'session_completed' && validSession(event.data)) {
        sessions.set(event.data.id, event.data)
      }
    }
    return { sessions, needsSeparator: contents.length > 0 && !contents.endsWith('\n') }
  }

  async #appendEvent(event) {
    const session = event.data
    const file = path.join(this.logDirectory, 'sessions-' + session.endedAt.slice(0, 10) + '.jsonl')
    let journal = this.#journals.get(file)
    if (!journal) {
      journal = await this.#readJournal(file)
      this.#journals.set(file, journal)
    }
    const saved = journal.sessions.get(session.id)
    if (saved) {
      if (!sameSession(saved, session)) throw new Error('В журнале уже есть другая тренировка с этим идентификатором')
      return file
    }
    const separator = journal.needsSeparator ? '\n' : ''
    try {
      await fs.appendFile(file, separator + JSON.stringify(event) + '\n', { encoding: 'utf8', flush: true })
    } catch (error) {
      // A failed append can have written a full row or a partial one.
      this.#journals.delete(file)
      throw error
    }
    journal.sessions.set(session.id, session)
    journal.needsSeparator = false
    return file
  }

  async #clearLogs() {
    this.#journals.clear()
    await fs.rm(this.logDirectory, { recursive: true, force: true })
    await fs.mkdir(this.logDirectory, { recursive: true })
  }

  async #finishPending(pending) {
    const current = await this.#readJson(this.profilePath)
    if (current && (!validProfile(current) ||
        (typeof current.profileId === 'string' && current.profileId !== pending.state.profileId))) {
      throw new Error('Незавершённая запись относится к другому профилю')
    }

    if (pending.kind === 'reset') {
      await this.#writeJson(this.profilePath, pending.state)
      await this.#clearLogs()
    } else {
      const session = pending.event.data
      const saved = current?.sessions.find((item) => item?.id === session.id)
      if (saved && !sameSession(saved, session)) throw new Error('Сохранённая тренировка не совпадает с записью восстановления')
      await this.#appendEvent(pending.event)
      if (!saved) await this.#writeJson(this.profilePath, pending.state)
    }
    await fs.rm(this.pendingPath, { force: true })
  }

  async load() {
    return this.#enqueue(async () => {
      await this.ensure()
      const pending = await this.#readPending()
      if (pending) {
        try {
          await this.#finishPending(pending)
        } catch (error) {
          if (pending.kind !== 'reset' || !error?.code) throw error
          const current = await this.#readJson(this.profilePath)
          if (!validProfile(current) ||
              (typeof current.profileId === 'string' && current.profileId !== pending.state.profileId)) throw error
          // Keep the last readable profile available while the reset is pending.
          return current
        }
      }
      return this.#readJson(this.profilePath)
    })
  }

  async save(state, session, appVersion) {
    if (!validProfile(state)) throw new Error('Некорректная структура профиля')
    if (session !== undefined) {
      if (!validSession(session)) throw new Error('Некорректная структура тренировки')
      requireSessionIn(state, session)
    }
    return this.#enqueue(async () => {
      await this.ensure()
      const pending = await this.#readPending()
      if (pending) {
        if (pending.kind !== 'session' || session?.id !== pending.event.data.id || !sameSession(session, pending.event.data)) {
          throw new Error('Сначала восстановите незавершённую запись профиля')
        }
        await this.#finishPending(pending)
        return
      }
      if (session === undefined) {
        await this.#writeJson(this.profilePath, state)
        return
      }

      const current = await this.#readJson(this.profilePath)
      if (current && (!validProfile(current) ||
          (typeof current.profileId === 'string' && state.profileId !== current.profileId))) {
        throw new Error('Тренировка относится к другому профилю')
      }
      const saved = current?.sessions.find((item) => item?.id === session.id)
      if (saved) {
        if (!sameSession(saved, session)) throw new Error('В профиле уже есть другая тренировка с этим идентификатором')
        return
      }
      const intent = { version: 1, kind: 'session', state, event: this.#event(session, appVersion) }
      await this.#writeJson(this.pendingPath, intent)
      await this.#finishPending(intent)
    })
  }

  async appendSession(session, appVersion) {
    if (!validSession(session)) throw new Error('Некорректная структура тренировки')
    return this.#enqueue(async () => {
      await this.ensure()
      if (await this.#readPending()) throw new Error('Сначала восстановите незавершённую запись профиля')
      return this.#appendEvent(this.#event(session, appVersion))
    })
  }

  async clear(next) {
    if (next !== undefined && !validReset(next)) throw new Error('Некорректный снимок сброса профиля')
    return this.#enqueue(async () => {
      await this.ensure()
      if (next === undefined) {
        await fs.rm(this.pendingPath, { force: true })
        await fs.rm(this.pendingPath + '.tmp', { force: true })
        await this.#clearLogs()
        await fs.rm(this.profilePath, { force: true })
        return
      }
      const current = await this.#readJson(this.profilePath)
      if (current && (!validProfile(current) ||
          (typeof current.profileId === 'string' && next.profileId !== current.profileId))) {
        throw new Error('Сброс относится к другому профилю')
      }
      const intent = { version: 1, kind: 'reset', state: next }
      await this.#writeJson(this.pendingPath, intent)
      await this.#finishPending(intent)
    })
  }
}

module.exports = { DataStore }
