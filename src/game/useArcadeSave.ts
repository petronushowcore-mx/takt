import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAppState } from '@/hooks/useAppState'
import { useI18n } from '@/lib/i18n'
import type { SessionResult } from '@/types'

type SaveStatus = 'saving' | 'saved' | 'failed'

export function useArcadeSave() {
  const { t } = useI18n()
  const { recordSession } = useAppState()
  const [save, setSave] = useState<{ id: string; status: SaveStatus } | null>(null)
  const pending = useRef(new Set<string>())

  const saveResult = useCallback(async (session: SessionResult) => {
    if (pending.current.has(session.id)) return
    pending.current.add(session.id)
    setSave({ id: session.id, status: 'saving' })

    const finishSave = (status: SaveStatus) => {
      setSave((current) => current?.id === session.id ? { ...current, status } : current)
    }

    try {
      const unlocked = await recordSession(session)
      finishSave('saved')
      unlocked.forEach((item) => toast.success(t('Достижение: {name}', { name: t(item.title) })))
    } catch {
      finishSave('failed')
    } finally {
      pending.current.delete(session.id)
    }
  }, [recordSession, t])

  return { saveStatus: save?.status ?? 'saving', saveResult }
}
