import { useEffect, useRef } from 'react'
import { useI18n } from '@/lib/i18n'
import type { Layout } from '@/types'

export function TypingText({ text, layout, cursor, errorPositions, lastError }: { text: string; layout: Layout; cursor: number; errorPositions: Set<number>; lastError: { position: number; actual: string; at: number } | null }) {
  const { t } = useI18n()
  const current = useRef<HTMLSpanElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const box = viewport.current
    const char = current.current
    if (!box || !char) return
    const visible = box.getBoundingClientRect()
    const active = char.getBoundingClientRect()
    if (active.top < visible.top) box.scrollTop += active.top - visible.top
    else if (active.bottom > visible.bottom) box.scrollTop += active.bottom - visible.bottom
  }, [cursor])
  return (
    <div ref={viewport} className="typing-text" aria-label={t('Текст для набора')} data-testid="typing-text" data-target={text}>
      <span className="sr-only" lang={layout}>{text}</span>
      {Array.from(text).map((char, index) => {
        const isCurrent = index === cursor
        const isDone = index < cursor
        const hasError = errorPositions.has(index) || lastError?.position === index
        return (
          <span
            key={`${index}-${char}`}
            ref={isCurrent ? current : undefined}
            className={`typing-char ${isDone ? 'is-done' : ''} ${isCurrent ? 'is-current' : ''} ${hasError ? 'has-error' : ''}`}
            aria-hidden="true"
          >
            {char === ' ' ? '\u00A0' : char}
          </span>
        )
      })}
    </div>
  )
}
