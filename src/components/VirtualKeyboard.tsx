import type { CSSProperties } from 'react'
import { useI18n } from '@/lib/i18n'
import type { Layout } from '@/types'
import { glyphRows } from '@/lib/keyboardLayout'

type Finger = 'left-pinky' | 'left-ring' | 'left-middle' | 'left-index' | 'right-index' | 'right-middle' | 'right-ring' | 'right-pinky'
const fingerNames: Record<Finger | 'thumb', string> = {
  'left-pinky': 'левый мизинец', 'left-ring': 'левый безымянный', 'left-middle': 'левый средний', 'left-index': 'левый указательный',
  'right-index': 'правый указательный', 'right-middle': 'правый средний', 'right-ring': 'правый безымянный', 'right-pinky': 'правый мизинец', thumb: 'большой палец',
}
const fingerOrder: Finger[] = ['left-pinky', 'left-ring', 'left-middle', 'left-index', 'right-index', 'right-middle', 'right-ring', 'right-pinky']
const fingersByPosition = [
  [0, 0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7, 7],
  [0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7, 7, 7],
  [0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7],
  [0, 1, 2, 3, 3, 4, 4, 5, 6, 7],
]
const shiftKeys = [
  { code: 'ShiftLeft', name: 'левый Shift', finger: 'left-pinky' },
  { code: 'ShiftRight', name: 'правый Shift', finger: 'right-pinky' },
] as const

function fingerStyle(finger: Finger | 'thumb'): CSSProperties {
  return { '--finger': 'var(--finger-' + finger + ')' } as CSSProperties
}

export function VirtualKeyboard({ layout, nextKey, pressedKey }: { layout: Layout; nextKey: string; pressedKey: string }) {
  const { t } = useI18n()
  const rows = glyphRows[layout].map(([plain, shifted], row) => Array.from(plain, (key, column) => ({
    plain: key,
    shifted: shifted[column],
    finger: fingerOrder[fingersByPosition[row][column]],
  })))
  const next = rows.flat().find((key) => key.plain === nextKey || key.shifted === nextKey)
  const shift = next && next.shifted === nextKey ? shiftKeys[next.finger.startsWith('left-') ? 1 : 0] : undefined
  const nextFinger = nextKey === ' ' ? 'thumb' : next?.finger
  const renderShift = (key: typeof shiftKeys[number]) => (
    <kbd className={'shift-key' + (shift === key ? ' is-next' : '')} data-key={key.code} title={t(key.name)} style={fingerStyle(key.finger)}>{t('Shift')}</kbd>
  )

  return (
    <div className="keyboard-wrap" aria-label={t('Подсказка на экранной клавиатуре')}>
      <div className="keyboard-hint">
        <span>{t('Следующая клавиша')}</span>
        <strong>{nextKey === ' ' ? t('ПРОБЕЛ') : nextKey || '—'}</strong>
        <small>{shift ? t(shift.name) + ' + ' : ''}{t(nextFinger ? fingerNames[nextFinger] : 'сохраняйте исходную позицию')}</small>
      </div>
      <div className="keyboard-with-legend">
        <div className="keyboard" role="img" aria-label={t('Клавиатура с цветовыми зонами пальцев и подсветкой нужных клавиш')}>
          {rows.map((row, index) => (
            <div className="keyboard-row" key={row[0].plain}>
              {index === rows.length - 1 && renderShift(shiftKeys[0])}
              {row.map((key) => {
                const pressed = pressedKey === key.plain || pressedKey === key.shifted
                const showShifted = nextKey === key.shifted || key.shifted.toLocaleLowerCase() !== key.plain
                return (
                  <kbd
                    key={key.plain}
                    data-key={key.plain}
                    title={t(fingerNames[key.finger])}
                    style={fingerStyle(key.finger)}
                    className={[next === key && 'is-next', pressed && 'is-pressed'].filter(Boolean).join(' ')}
                  >
                    {showShifted && <span className="shifted-glyph">{key.shifted}</span>}
                    <span>{key.plain}</span>
                  </kbd>
                )
              })}
              {index === rows.length - 1 && renderShift(shiftKeys[1])}
            </div>
          ))}
          <div className="keyboard-row"><kbd className={'space-key' + (nextKey === ' ' ? ' is-next' : '') + (pressedKey === ' ' ? ' is-pressed' : '')} data-key="Space" style={fingerStyle('thumb')}>{t('пробел')}</kbd></div>
        </div>
        <div className="finger-legend" aria-label={t('Легенда цветов пальцев')}>
          {fingerOrder.map((finger) => <span key={finger} title={t(fingerNames[finger])}><i style={{ background: `var(--finger-${finger})` }} />{t(fingerNames[finger])}</span>)}
        </div>
      </div>
    </div>
  )
}
