import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { DataStore } = require('../electron/store.cjs')
let directory: string

function roundFixture() {
  const before = {
    version: 1, profileId: 'legacy-profile', createdAt: '2026-01-02T10:00:00Z',
    settings: { layout: 'ru', theme: 'dark', profileName: 'Учебный профиль' },
    sessions: [], lessonProgress: {}, achievements: {},
  }
  const session = {
    schemaVersion: 1, id: 'round', mode: 'lesson', layout: 'ru', lessonId: 'ru-01', completedText: true,
    startedAt: '2026-11-26T11:59:00.000Z', endedAt: '2026-11-26T12:00:00.000Z',
    targetWpm: 16, wpm: 18, accuracy: 99, correctChars: 90,
  }
  const after = {
    ...before, sessions: [session], achievements: { 'first-session': session.endedAt },
    lessonProgress: {
      'ru-01': { completed: true, attempts: 1, targetWpm: 16, bestWpm: 18, bestAccuracy: 99 },
      'ru-02': { completed: false, attempts: 0, targetWpm: 18.4, increasePercent: 15, bestWpm: 0, bestAccuracy: 0 },
    },
  }
  const cleared = { ...after, sessions: [], lessonProgress: {}, achievements: {} }
  return { before, after, cleared, session }
}

function logPath(store: { logDirectory: string }) {
  return path.join(store.logDirectory, 'sessions-2026-11-26.jsonl')
}

async function readJson(file: string) {
  return JSON.parse(await fs.readFile(file, 'utf8'))
}

async function readRows(file: string) {
  return (await fs.readFile(file, 'utf8')).trim().split('\n').map((line) => JSON.parse(line))
}

beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'klavish-test-')) })
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }) })

describe('desktop-хранилище', () => {
  it('атомарно сохраняет профиль, добавляет JSONL и очищает данные', async () => {
    const store = new DataStore(directory)
    expect(await store.load()).toBeNull()
    const state = { version: 1, sessions: [], settings: {}, lessonProgress: {}, achievements: {} }
    await store.save(state)
    expect((await store.load()).version).toBe(1)
    const session = { schemaVersion: 1, id: 'session-1', endedAt: '2026-11-26T12:00:00.000Z' }
    const logFile = await store.appendSession(session, '0.1.0')
    const lines = (await fs.readFile(logFile, 'utf8')).trim().split('\n')
    expect(lines).toHaveLength(1)
    const event = JSON.parse(lines[0])
    expect(event.schema).toBe('klavish.event.v1')
    expect(event.data.id).toBe('session-1')
    await store.clear()
    expect(await store.load()).toBeNull()
    expect((await fs.readdir(store.logDirectory)).length).toBe(0)
  })
  it('сохраняет параллельные запросы в порядке поступления', async () => {
    const store = new DataStore(directory)
    const writes = Array.from({ length: 8 }, (_, index) => store.save({
      version: 1, sessions: [], settings: { lessonLength: index },
    }))
    expect((await Promise.allSettled(writes)).map((result) => result.status)).toEqual(Array(8).fill('fulfilled'))
    expect((await store.load()).settings.lessonLength).toBe(7)
  })

  it('записывает повторное сохранение тренировки одной строкой', async () => {
    const store = new DataStore(directory)
    const session = { schemaVersion: 1, id: 'retry', endedAt: '2026-11-26T12:00:00.000Z' }
    const file = await store.appendSession(session, '0.1.0')
    await store.appendSession(session, '0.1.0')
    expect((await fs.readFile(file, 'utf8')).trim().split('\n')).toHaveLength(1)
    await store.clear()
    await store.appendSession(session, '0.1.0')
    expect((await fs.readFile(file, 'utf8')).trim().split('\n')).toHaveLength(1)
  })

  it('отклоняет повреждённые данные', async () => {
    const store = new DataStore(directory)
    await expect(store.save(null)).rejects.toThrow()
    await expect(store.appendSession({}, '0.1.0')).rejects.toThrow()
  })

  it('не публикует тренировку до появления полной записи восстановления', async () => {
    const store = new DataStore(directory)
    const { before, after, session } = roundFixture()
    await store.save(before)
    await fs.mkdir(store.pendingPath + '.tmp')
    await expect(store.save(after, session, '0.1.0')).rejects.toThrow()
    expect(await new DataStore(directory).load()).toEqual(before)
    expect(await fs.readdir(store.logDirectory)).toEqual([])
  })

  it('восстанавливает профиль, цели и достижения после отказа замены профиля', async () => {
    const store = new DataStore(directory)
    const { before, after, session } = roundFixture()
    await store.save(before)
    const blocker = store.profilePath + '.tmp'
    await fs.mkdir(blocker)
    await expect(store.save(after, session, '0.1.0')).rejects.toThrow()

    const log = logPath(store)
    expect(await readJson(store.profilePath)).toEqual(before)
    expect(await readRows(log)).toMatchObject([{ appVersion: '0.1.0', data: session }])
    const reopened = new DataStore(directory)
    const stale = { ...before, settings: { ...before.settings, theme: 'waves' } }
    await expect(reopened.save(stale)).rejects.toThrow('Сначала восстановите')
    const unrelated = { ...session, id: 'unrelated' }
    await expect(reopened.save({ ...stale, sessions: [unrelated] }, unrelated, '0.1.0'))
      .rejects.toThrow('Сначала восстановите')

    await fs.rmdir(blocker)
    expect(await reopened.load()).toEqual(after)
    await new DataStore(directory).save(after, session, '0.2.0')
    expect(await readRows(log)).toMatchObject([{ appVersion: '0.1.0', data: session }])
    expect(await new DataStore(directory).load()).toEqual(after)
    await expect(fs.stat(store.pendingPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('возобновляет запись той же тренировки после отказа журнала', async () => {
    const store = new DataStore(directory)
    const { before, after, session } = roundFixture()
    await store.save(before)
    const log = logPath(store)
    await fs.mkdir(log)
    await expect(store.save(after, session, '0.1.0')).rejects.toThrow()
    expect(await readJson(store.profilePath)).toEqual(before)
    await fs.rmdir(log)

    const reopened = new DataStore(directory)
    await reopened.save(after, session, '0.2.0')
    expect(await readRows(log)).toMatchObject([{ appVersion: '0.1.0', data: session }])
    expect(await reopened.load()).toEqual(after)
  })

  it('пишет новую строку после оборванной и не дублирует её после перезапуска', async () => {
    const store = new DataStore(directory)
    const { before, after, session } = roundFixture()
    await store.save(before)
    const log = logPath(store)
    const partial = '{"schema":"klavish.event.v1","data":'
    await fs.writeFile(log, partial, 'utf8')
    await store.save(after, session, '0.1.0')
    await new DataStore(directory).appendSession(session, '0.1.0')
    const rows = (await fs.readFile(log, 'utf8')).trimEnd().split('\n')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toBe(partial)
    expect(JSON.parse(rows[1]).data).toEqual(session)
  })

  it('оставляет старый профиль и журнал при отказе записи сброса', async () => {
    const store = new DataStore(directory)
    const { after, cleared, session } = roundFixture()
    await store.save(after, session, '0.1.0')
    const log = logPath(store)
    const blocker = store.profilePath + '.tmp'
    await fs.mkdir(blocker)

    await expect(store.clear(cleared)).rejects.toThrow()
    expect(await readJson(store.profilePath)).toEqual(after)
    expect(await readRows(log)).toMatchObject([{ data: session }])

    const reopened = new DataStore(directory)
    await expect(reopened.load()).resolves.toEqual(after)
    await expect(reopened.save({ ...after, settings: { ...after.settings, profileName: 'Другое имя' } })).rejects.toThrow()
    expect(await readJson(store.pendingPath)).toMatchObject({ kind: 'reset', state: cleared })

    await fs.rmdir(blocker)
    expect(await reopened.load()).toEqual(cleared)
    expect(await fs.readdir(store.logDirectory)).toEqual([])
    expect(await new DataStore(directory).load()).toEqual(cleared)
  })

  it('завершает удаление журналов после сброса без потери сохранённого профиля', async () => {
    const store = new DataStore(directory)
    const { after, cleared, session } = roundFixture()
    await store.save(after, session, '0.1.0')
    const remove = fs.rm
    const blocked = vi.spyOn(fs, 'rm').mockImplementation(async (file, options) => {
      if (file === store.logDirectory) throw Object.assign(new Error('Журнал занят'), { code: 'EBUSY' })
      return remove(file, options)
    })
    try {
      await expect(store.clear()).rejects.toMatchObject({ code: 'EBUSY' })
      expect(await readJson(store.profilePath)).toEqual(after)
      await expect(store.clear(cleared)).rejects.toMatchObject({ code: 'EBUSY' })
      expect(await readJson(store.profilePath)).toEqual(cleared)
      expect(await readRows(logPath(store))).toMatchObject([{ data: session }])
    } finally {
      blocked.mockRestore()
    }
    expect(await new DataStore(directory).load()).toEqual(cleared)
    expect(await fs.readdir(store.logDirectory)).toEqual([])
    await expect(fs.stat(store.pendingPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('сброс отменяет ожидающую тренировку и не поднимает старую историю из журнала', async () => {
    const store = new DataStore(directory)
    const { before, after, cleared, session } = roundFixture()
    await store.save(before)
    const historic = { ...session, id: 'historic-journal-only' }
    await store.appendSession(historic, '0.0.9')
    expect(await new DataStore(directory).load()).toEqual(before)

    const blocker = store.profilePath + '.tmp'
    await fs.mkdir(blocker)
    await expect(store.save(after, session, '0.1.0')).rejects.toThrow()
    await fs.rmdir(blocker)
    await store.clear(cleared)
    expect(await new DataStore(directory).load()).toEqual(cleared)
    expect(await fs.readdir(store.logDirectory)).toEqual([])
  })

  it('сохраняет профиль при повреждённой записи восстановления', async () => {
    const store = new DataStore(directory)
    const { before } = roundFixture()
    await store.save(before)
    await fs.writeFile(store.pendingPath, 'null', 'utf8')
    await expect(new DataStore(directory).load()).rejects.toThrow('Некорректная запись восстановления')
    await expect(store.save({ ...before, sessions: [] })).rejects.toThrow('Некорректная запись восстановления')
    expect(await readJson(store.profilePath)).toEqual(before)
  })
})
