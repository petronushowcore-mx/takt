import type { AppState, Layout, Lesson, SessionMode, SessionResult, Settings } from '@/types'
import { weakKeys } from '@/lib/analytics'
import { isPracticePaceMode } from '@/lib/sessionModes'

const ru = (level: number, title: string, subtitle: string, keys: string, targetWpm: number, words: string[], patterns?: string[]): Lesson => ({
  id: `ru-${String(level).padStart(2, '0')}`, layout: 'ru', level, title, subtitle, keys, targetWpm, minAccuracy: 94, words, patterns,
})
const en = (level: number, title: string, subtitle: string, keys: string, targetWpm: number, words: string[], patterns?: string[]): Lesson => ({
  id: `en-${String(level).padStart(2, '0')}`, layout: 'en', level, title, subtitle, keys, targetWpm, minAccuracy: 94, words, patterns,
})

export const lessons: Lesson[] = [
  ru(1, 'Домашний ряд', 'ФЫВА и ОЛДЖ — исходная позиция пальцев', 'ф ы в а о л д ж', 16, ['фа', 'фал', 'вол', 'два', 'лад', 'жало', 'вал'], ['фыва', 'олдж', 'фж ов', 'ады лож', 'фалд олж']),
  ru(2, 'П и Р', 'Добавляем указательные пальцы', 'п р', 18, ['пар', 'пора', 'плов', 'прав', 'дар', 'жар', 'дрова', 'фара'], ['пр фыва', 'пар олдж', 'ржа лоп']),
  ru(3, 'М, Ь и Я', 'Нижний ряд: два указательных и левый мизинец', 'м ь я', 20, ['мор', 'мыло', 'дом', 'моль', 'поля', 'моя', 'яма', 'мял', 'роль', 'драма']),
  ru(4, 'Т, И и Б', 'Чередуем руки в нижнем ряду', 'т и б', 22, ['тип', 'тир', 'пир', 'троп', 'мотор', 'трио', 'бит', 'борт', 'был', 'быть', 'мир', 'брал']),
  ru(5, 'Е, Н и Й', 'Верхний ряд: указательные и левый мизинец', 'е н й', 24, ['нет', 'день', 'тень', 'меня', 'пение', 'лето', 'мирный', 'план', 'лей', 'пой', 'ранний']),
  ru(6, 'К, Г и Ё', 'Дотягиваемся до Ё левым мизинцем и возвращаем руку', 'к г ё', 26, ['кот', 'кит', 'гром', 'книга', 'когда', 'город', 'гнёт', 'конь', 'картина', 'лёд', 'полёт', 'берёг']),
  ru(7, 'С, Ч и Ц', 'Упражнение для левых среднего и безымянного пальцев', 'с ч ц', 28, ['сон', 'час', 'часть', 'свет', 'счёт', 'чисто', 'слово', 'черта', 'сила', 'цена', 'лицо', 'танец']),
  ru(8, 'У, Ш и Щ', 'Верхний ряд обеих рук', 'у ш щ', 30, ['шум', 'уши', 'шар', 'душа', 'школа', 'суша', 'широко', 'учёт', 'шаг', 'щит', 'щель', 'пища', 'ищу']),
  ru(9, 'З, Х и Ю', 'Правые мизинец и безымянный', 'з х ю', 32, ['знак', 'заход', 'хор', 'храм', 'звук', 'знать', 'холод', 'закат', 'хит', 'юг', 'юбка', 'поют', 'люблю']),
  ru(10, 'Ъ и Э', 'Редкие буквы без потери ритма', 'ъ э', 33, ['эхо', 'этап', 'эра', 'подъём', 'объект', 'съезд', 'экран', 'эпоха', 'объём', 'это']),
  ru(11, 'Заглавные и знаки', 'Shift, точка, запятая и знаки в конце предложения', 'shift . , ? !', 34, ['Привет, мир.', 'Как дела?', 'Сегодня хороший день.', 'Тише едешь, дальше будешь.', 'Москва, Россия.', 'Верно!']),
  ru(12, 'Цифры и скорость', 'Числа, проценты и двоеточие в предложениях', '0 1 2 3 4 5 6 7 8 9 % :', 38, ['В 2026 году я занимаюсь 15 минут.', 'Скорость 40 слов в минуту.', 'Точность 98% важнее спешки.', '3 повтора по 5 строк.', 'День 7: новый результат.']),

  en(1, 'Home row', 'ASDF and JKL; — your starting position', 'a s d f j k l ;', 18, ['as', 'fad', 'lad', 'salad', 'fall', 'ask', 'dad', 'flask'], ['asdf', 'jkl;', 'a; fj', 'dads lask', 'fall salad']),
  en(2, 'G and H', 'Move both index fingers inward', 'g h', 20, ['gad', 'has', 'half', 'glad', 'hash', 'flag', 'hall', 'dash']),
  en(3, 'E and R', 'Reach up without leaving the home row', 'e r', 22, ['her', 'here', 'read', 'dear', 'free', 'share', 'gear', 'heard']),
  en(4, 'T and Y', 'Build a steady alternating rhythm', 't y', 24, ['they', 'try', 'year', 'heart', 'start', 'stay', 'style', 'there']),
  en(5, 'U and I', 'Right index and middle fingers', 'u i', 26, ['guide', 'issue', 'light', 'right', 'sure', 'suit', 'fruit', 'future']),
  en(6, 'O and P', 'Train the ring and little fingers', 'o p', 28, ['pilot', 'people', 'group', 'hope', 'post', 'support', 'popular', 'output']),
  en(7, 'W and Q', 'Upper-left reaches and return', 'w q', 30, ['work', 'quit', 'quiet', 'world', 'request', 'equal', 'flow', 'quality']),
  en(8, 'V and B', 'Lower row with the left index finger', 'v b', 31, ['value', 'brave', 'above', 'vibe', 'better', 'verb', 'bright', 'vivid']),
  en(9, 'N and M', 'Lower-row practice with the right index finger', 'n m', 32, ['name', 'many', 'moment', 'number', 'main', 'mind', 'normal', 'meaning']),
  en(10, 'C, X and Z', 'Lower-row practice for the middle, ring and little fingers', 'c x z', 33, ['code', 'next', 'exact', 'zoom', 'complex', 'zero', 'create', 'exercise']),
  en(11, 'Capitals & punctuation', 'Shift, period, comma and sentence endings', 'shift . , ? !', 35, ['Hello, world.', 'How are you?', 'Practice makes progress.', 'London, England.', 'Well done!']),
  en(12, 'Numbers & flow', 'Numbers, percentages and colons in sentences', '0 1 2 3 4 5 6 7 8 9 % :', 40, ['In 2026, I practice for 15 minutes.', 'Speed is 40 words per minute.', 'Aim for 98% accuracy.', 'Repeat 3 sets of 5 lines.', 'Day 7: a new record.']),
]

export const arcadeWords: Record<Layout, string[]> = {
  ru: ['мир', 'код', 'ритм', 'точно', 'свет', 'слово', 'клавиша', 'поток', 'скорость', 'фокус', 'уровень', 'результат', 'движение', 'пальцы', 'практика', 'спокойно', 'рекорд', 'космос', 'орбита', 'импульс', 'точность', 'команда', 'победа', 'маршрут'],
  en: ['flow', 'code', 'focus', 'speed', 'keyboard', 'orbit', 'rhythm', 'practice', 'result', 'level', 'record', 'steady', 'future', 'signal', 'rocket', 'accuracy', 'motion', 'finger', 'victory', 'cosmos', 'energy', 'typing'],
}

export function lessonsFor(layout: Layout) {
  return lessons.filter((lesson) => lesson.layout === layout).sort((a, b) => a.level - b.level)
}

export function isUnlocked(lesson: Lesson, state: AppState): boolean {
  if (lesson.level === 1) return true
  const previous = lessonsFor(lesson.layout)[lesson.level - 2]
  return Boolean(state.lessonProgress[previous.id]?.completed)
}

export function nextLesson(state: AppState, layout: Layout): Lesson {
  const values = lessonsFor(layout)
  return values.find((lesson) => isUnlocked(lesson, state) && !state.lessonProgress[lesson.id]?.completed)
    ?? [...values].reverse().find((lesson) => isUnlocked(lesson, state))
    ?? values[0]
}

type LessonIncrease = 5 | 10 | 15

interface LessonDifficulty {
  targetWpm: number
  increasePercent?: LessonIncrease
}

const lessonIncreases: LessonIncrease[] = [5, 10, 15]

function increasedTarget(targetWpm: number, increasePercent: LessonIncrease): number {
  const scaledTenths = Math.round(targetWpm * 10) * (100 + increasePercent)
  const round = increasePercent === 5 ? Math.ceil : Math.floor
  return round(scaledTenths / 100) / 10
}

function selectedIncrease(targetWpm: number, result: Pick<SessionResult, 'wpm' | 'accuracy'>): LessonIncrease {
  const targetTenths = Math.round(targetWpm * 10)
  const speedTenths = Math.round(result.wpm * 10)
  if (result.accuracy >= 99 && speedTenths * 100 >= targetTenths * 110) return 15
  if (result.accuracy >= 97 && speedTenths * 100 >= targetTenths * 105) return 10
  return 5
}

export function lessonDifficulty(lesson: Lesson, state: AppState): LessonDifficulty {
  const saved = state.lessonProgress[lesson.id]
  const assigned = saved?.targetWpm
  if (assigned !== undefined && saved?.increasePercent !== undefined) {
    return { targetWpm: assigned, increasePercent: saved.increasePercent }
  }
  const previous = lessonsFor(lesson.layout)[lesson.level - 2]
  const previousProgress = previous && state.lessonProgress[previous.id]
  if (!previousProgress?.completed) return { targetWpm: assigned ?? lesson.targetWpm }

  const lastPass = [...state.sessions].reverse().find((session) =>
    session.mode === 'lesson' && session.lessonId === previous.id && session.layout === previous.layout &&
    session.completedText === true && session.accuracy >= previous.minAccuracy &&
    session.wpm >= (previousProgress.targetWpm ?? session.targetWpm ?? previous.targetWpm),
  )
  const previousTarget = previousProgress.targetWpm ?? lastPass?.targetWpm ?? previous.targetWpm
  if (assigned !== undefined) {
    return {
      targetWpm: assigned,
      increasePercent: lessonIncreases.find((increase) => increasedTarget(previousTarget, increase) === assigned),
    }
  }
  const increasePercent = lastPass ? selectedIncrease(previousTarget, lastPass) : 5
  return { targetWpm: increasedTarget(previousTarget, increasePercent), increasePercent }
}

export function nextLessonDifficulty(
  lesson: Lesson,
  issuedTargetWpm: number,
  result: Pick<SessionResult, 'wpm' | 'accuracy'>,
  fullCompletion: boolean,
): { lesson: Lesson; targetWpm: number; increasePercent: LessonIncrease } | undefined {
  const next = lessonsFor(lesson.layout)[lesson.level]
  if (!next || !fullCompletion || result.accuracy < lesson.minAccuracy || result.wpm < issuedTargetWpm) return undefined

  const increasePercent = selectedIncrease(issuedTargetWpm, result)
  return { lesson: next, targetWpm: increasedTarget(issuedTargetWpm, increasePercent), increasePercent }
}

function randomFrom<T>(values: T[], random: () => number): T {
  return values[Math.floor(random() * values.length)]
}

export function seededRandom(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6D2B79F5) | 0
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export const lessonTextLengths: Record<Settings['lessonLength'], number> = { short: 80, normal: 150, long: 230 }

function containsKey(value: string, key: string): boolean {
  const lowerCase = value.toLowerCase()
  return key === 'shift' ? value !== lowerCase : lowerCase.includes(key)
}

export function buildDrill(source: string[], keys: string[], target: number, random: () => number): string {
  if (!source.length) return ''
  const output: string[] = []
  for (const key of keys) {
    if (output.some((value) => containsKey(value, key))) continue
    const matches = source.filter((value) => containsKey(value, key))
    if (matches.length) output.push(randomFrom(matches, random))
  }
  let length = output.join(' ').length
  while (length < target) {
    const value = randomFrom(source, random)
    length += value.length + (output.length ? 1 : 0)
    output.push(value)
  }
  return output.join(' ')
}

export function generateLessonText(lesson: Lesson, length: Settings['lessonLength'] = 'normal', seed = Date.now()): string {
  const source = [...(lesson.patterns ?? []), ...lesson.words]
  return buildDrill(source, lesson.keys.split(' '), lessonTextLengths[length] + lesson.level * 4, seededRandom(seed))
}

export function generateAdaptiveText(
  layout: Layout,
  sessions: SessionResult[],
  length: Settings['lessonLength'] = 'normal',
  throughLevel = lessonsFor(layout).length,
): { text: string; keys: string[]; difficulty: string } {
  const layoutSessions = sessions.filter((session) =>
    session.layout === layout && isPracticePaceMode(session.mode),
  )
  const weak = weakKeys(layoutSessions.slice(-15), 4)
  const values = lessonsFor(layout).slice(0, Math.max(1, throughLevel))
  const pool = values.flatMap((lesson) => lesson.words)
  const candidates = [...pool, ...values.flatMap((lesson) => lesson.patterns ?? [])]
  const keys = weak.map((item) => item.key).filter((key) => key !== 'space' && candidates.some((value) => containsKey(value, key)))
  const focused = candidates.filter((value) => keys.some((key) => containsKey(value, key)))
  const source = focused.length >= 3 ? focused : [...focused, ...pool.filter((word) => !/[0-9]/.test(word) && !focused.includes(word))]
  const recent = layoutSessions.slice(-5)
  const averageWpm = recent.length ? recent.reduce((sum, item) => sum + item.wpm, 0) / recent.length : 0
  const difficulty = averageWpm >= 40 && keys.length === 0 ? 'интенсив' : keys.length ? 'работа над ошибками' : 'мягкий старт'
  const target = lessonTextLengths[length] + (difficulty === 'интенсив' ? 70 : 0)
  return { text: buildDrill(source, keys, target, seededRandom(Date.now())), keys, difficulty }
}

export function sessionLabel(mode: SessionMode): string {
  return {
    lesson: 'Урок', adaptive: 'Адаптивная', orbit: 'Орбита', sprint: 'Спринт',
    diagnostic: 'Диагностика', benchmark: 'Контроль', precision: 'Точность', review: 'Повтор',
    transition: 'Переходы между буквами', 'transfer-practice': 'Свой текст',
    'transfer-control': 'Новый отрывок', 'layout-switch': 'Смена раскладки', hardcore: 'Хардкор',
  }[mode]
}
