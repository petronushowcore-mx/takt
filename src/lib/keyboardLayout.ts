import type { Layout } from '@/types'

export const glyphRows: Record<Layout, [plain: string, shifted: string][]> = {
  ru: [
    ['ё1234567890-=', 'Ё!"№;%:?*()_+'],
    ['йцукенгшщзхъ\\', 'ЙЦУКЕНГШЩЗХЪ/'],
    ['фывапролджэ', 'ФЫВАПРОЛДЖЭ'],
    ['ячсмитьбю.', 'ЯЧСМИТЬБЮ,'],
  ],
  en: [
    ['\u00601234567890-=', '~!@#$%^&*()_+'],
    ['qwertyuiop[]\\', 'QWERTYUIOP{}|'],
    ["asdfghjkl;'", 'ASDFGHJKL:"'],
    ['zxcvbnm,./', 'ZXCVBNM<>?'],
  ],
}

const physicalRows = [
  'Backquote Digit1 Digit2 Digit3 Digit4 Digit5 Digit6 Digit7 Digit8 Digit9 Digit0 Minus Equal',
  'KeyQ KeyW KeyE KeyR KeyT KeyY KeyU KeyI KeyO KeyP BracketLeft BracketRight Backslash',
  'KeyA KeyS KeyD KeyF KeyG KeyH KeyJ KeyK KeyL Semicolon Quote',
  'KeyZ KeyX KeyC KeyV KeyB KeyN KeyM Comma Period Slash',
].map((row) => row.split(' '))

export function isAlternateLayoutStroke(layout: Layout, expected: string, code: string, key: string): boolean {
  if (!expected || expected === key) return false
  const row = physicalRows.findIndex((codes) => codes.includes(code))
  if (row < 0) return false
  const column = physicalRows[row].indexOf(code)
  const selected = glyphRows[layout][row].map((glyphs) => glyphs[column])
  const alternate = glyphRows[layout === 'ru' ? 'en' : 'ru'][row].map((glyphs) => glyphs[column])
  return selected.includes(expected) && !selected.includes(key) && alternate.includes(key)
}
