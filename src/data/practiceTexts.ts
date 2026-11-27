import type { Layout, Lesson, Settings } from '@/types'
import { glyphRows } from '@/lib/keyboardLayout'
import { buildDrill, lessonTextLengths, lessonsFor, seededRandom } from './lessons'

export interface LessonStage {
  kind: 'fingers' | 'words' | 'transfer'
  text: string
}

export interface ConfusionPair {
  expected: string
  actual: string
}

const transferTexts: Record<Layout, readonly (readonly string[])[]> = {
  ru: [
    ['вдова дала два фала', 'лава дала два вала', 'вдова дала вола'],
    ['папа дал плов а вдова дала дар', 'папа продал два фала а вдова дала дрова'],
    ['мама мыла пол а папа мыл два вала', 'мама мыла пол а вдова мыла рамы'],
    ['папа мыл рамы и мама мыла пол', 'брат мыл пол а папа брал дрова'],
    ['папа принял план и брат наладил мотор', 'длинный день миновал и брат наладил мотор'],
    ['когда лёд таял брат колол дрова а мама грела дом', 'кот глядел на огонь а брат колол дрова'],
    ['на станции брат читал план города а кот грел лапы', 'часы били а брат читал и кот грел лапы'],
    ['утром мы шли на площадь и читали надписи', 'мы искали щенка на площади а щенок спал у школы'],
    ['мы шли по холодной площади и увидели знак на двери', 'кот ходил по залу а дети смотрели на юг из окна'],
    ['мы объехали площадь и нашли подъём к старому дому эта дорога оказалась короче', 'мы вошли в подъезд и увидели эскиз старого города рядом стоял ящик с книгами'],
    ['Зажёгся свет, и мы увидели реку. Где же мост? Он прямо за поворотом!', 'Юля раскрыла карту, и мы сравнили дороги. Здесь короче? Да, пойдём через площадь!'],
    ['Магазин откроется в 09:15. На верхней полке 4 чашки, а на нижней 7. Цена напитка выросла на 8%.', 'Мы сели на автобус в 18:40 и проехали 6 остановок. До дома осталось 2 минуты. Заряд телефона 35%.'],
  ],
  en: [
    ['ask dad; add salad', 'a sad lad asks dad; dad adds salad', 'ask al; al asks dad'],
    ['dad has a flag; ask dad', 'a lad has a flag; dad asks a lad'],
    ['dad has a glass; a lad shares a glass', 'dad reads a saga; she hears dad'],
    ['they read the saga; dad had a rest', 'they stay here; dad had a rest'],
    ['they read the guide; the trail is hard', 'they guide us; the trail is high'],
    ['they stop at the gate; a guard reads the guide', 'they see the port; a light guides the pilot'],
    ['they wait at the quay; a pilot guides the group', 'a quiet group waits at the port; a light guides the pilot'],
    ['a brave dog waits at the gate; the pilot waves as he goes away', 'they leave the boat at the quay; a quiet group waves goodbye'],
    ['a small bird lands near the boat; a quiet group waits on the quay', 'a bright moon rises over the water; the pilot waits until dawn'],
    ['a fox crosses the lane as we walk home; the last light fades behind the hills', 'a cozy house stands by the river; six children run over the old bridge'],
    ['We stopped at the river, where the lights were bright. Could we cross here? Yes, the bridge was open!', 'Maya opened the map, and we compared the paths. Is this route shorter? Yes, follow the river!'],
    ['The museum opens at 09:15. There are 4 chairs on this side and 7 by the door. Ticket prices rose by 8%.', 'We took the bus at 18:40 and passed 6 stops. We are 2 minutes from home. The phone has 35% charge.'],
  ],
}

export function lessonTextAllowance(issuedPace: number, previousPace: number): number {
  if (issuedPace <= 0 || previousPace <= 0) return 10
  return Math.max(0, Math.min(10, Math.floor(1000 * (1.15 * previousPace / issuedPace - 1)) / 10))
}

function boundedWords(source: string[], familiar: string[], cost: (text: string) => number, target: number, allowance: number, random: () => number): string {
  const challenges = source.map((word) => ({ word, cost: cost(word) })).filter((item) => item.cost > 0)
  const plain = [...source, ...familiar].filter((word) => cost(word) === 0)
  const output: string[] = []
  let count = 0
  let used = 0
  while (count < target) {
    const challenge = challenges.filter((item) => 100 * (used + item.cost) <= allowance * (count + item.word.length))
    const selected = challenge.length ? challenge[Math.floor(random() * challenge.length)] : undefined
    const word = selected?.word ?? plain[Math.floor(random() * plain.length)]
    if (output.length) count += 1
    count += word.length
    used += selected?.cost ?? 0
    output.push(word)
  }
  return output.join(' ')
}

export function generateLessonStages(lesson: Lesson, length: Settings['lessonLength'] = 'normal', seed = Date.now(), allowance = 10): LessonStage[] {
  const random = seededRandom(seed)
  const assigned = lesson.keys.split(' ')
  const anchors = lesson.layout === 'ru' ? 'ао' : 'fj'
  const reaches = assigned.map((key, index) => {
    const anchor = anchors[index % anchors.length]
    return key === 'shift' ? `${anchor}${anchor.toUpperCase()}${anchor}` : `${anchor}${key}${anchor} ${key}${key}`
  })
  const passages = transferTexts[lesson.layout][lesson.level - 1]
  const examples = [...lesson.words, ...passages].flatMap((text) => text.split(' '))
  if (lesson.id === 'ru-01') examples.push('вы')
  const context: string[] = []
  for (const key of assigned) {
    const includesKey = (text: string) => key === 'shift' ? text !== text.toLowerCase() : text.toLowerCase().includes(key)
    if (context.some(includesKey)) continue
    const example = examples.find((word) => word.length > 1 && includesKey(word))
    if (example) context.push(example)
  }
  const target = lessonTextLengths[length] + lesson.level * 4
  const motions = buildDrill([...(lesson.patterns ?? []), ...reaches], assigned, Math.round(target * 0.22), random)
  const fingers = [motions, ...context].join(' ')
  const tokens = lesson.words.flatMap((value) => value.split(' '))
  if (lesson.level === 1) {
    const transfer = passages[Math.floor(random() * passages.length)]
    const words = buildDrill(tokens, assigned, Math.max(12, target - motions.length - transfer.length - 2), random)
    return [{ kind: 'fingers', text: fingers }, { kind: 'words', text: words }, { kind: 'transfer', text: transfer }]
  }
  const previous = lessonsFor(lesson.layout).slice(0, lesson.level - 1)
  const known = new Set([' ', ...previous.flatMap((item) => item.keys.split(' '))])
  const direct = new Set(glyphRows[lesson.layout].map(([plain]) => plain).join(''))
  const shifted = new Set([...glyphRows[lesson.layout].map(([, glyphs]) => glyphs).join('')].filter((glyph) => !direct.has(glyph)))
  const cost = (text: string) => [...text].reduce((sum, glyph) =>
    sum + Number(!known.has(glyph.toLowerCase())) + Number(shifted.has(glyph)), 0)
  const allowed = (passage: string) => cost(passage) * 100 <= allowance * passage.length
  const nearby = transferTexts[lesson.layout].slice(Math.max(0, lesson.level - 4), lesson.level).flat().filter(allowed)
  const candidates = nearby.length ? nearby : transferTexts[lesson.layout][0]
  const transfer = candidates[Math.floor(random() * candidates.length)]
  const familiar = previous.flatMap((item) => item.words.flatMap((value) => value.split(' ')))
  const words = boundedWords(tokens, familiar, cost, Math.max(12, target - motions.length - transfer.length - 2), allowance, random)
  return [{ kind: 'fingers', text: fingers }, { kind: 'words', text: words }, { kind: 'transfer', text: transfer }]
}

const diagnosticTexts: Record<Layout, readonly string[]> = {
  ru: [
    'Фёдор вымыл два фужера. Дождь лил. Папа принёс мяту и стал мять. Бери, брат. Налей чай. Как гогочет гусь!',
    'Утром я вышел за хлебом и записал два адреса. На площади шёл дождь, но у входа уже ждали друзья. Фёдор налил Юле чай, а на стол поставил яблочный пирог с корицей. Объём заказа вырос на 25%, а в 18:40 курьер привёз ещё 3 коробки. Эту цифру легко проверить: в накладной стоит 7, в отчёте 9. Кто заберёт багаж к 06:00?',
    'В окне зажёгся свет. Юля открыла дверь и впустила мокрого щенка, а Марк нашёл для него старое полотенце. Чуть позже во двор въехала машина с книгами, эскизом и ящиком мела. За рулём был Фёдор, а рядом шёл пожилой сосед. В 07:45 дети пришли за 2 книгами, а в 10:39 взяли ещё 6. Почему на полке осталось 8 книг? Мы пересчитали их дважды!',
    'У широкого подъезда Фёдор заметил табличку с расписанием. Эту сторону улицы раньше закрывали, зато теперь здесь ходит автобус. Он проходит тихий сквер, цех, большую площадь и поворачивает к старой школе у края площади. В 02:36 в салоне было 7 человек, в 08:45 прибавилось 19, а в 13:20 уже вышли 5. Изменилась ли нагрузка на 6%? Посмотрим после обеда!',
    'После уроков сосед принёс яблоки и свежий хлеб. На кухне Юля поставила чайник, а Фёдор открыл окно, чтобы выпустить тёплый воздух. Потом они нашли эскиз комнаты и обсудили, где лучше поставить шкаф. На подъезде висел план новой улицы. В 05:18 пришло 4 письма, в 09:37 ещё 2, на 60% из них ответили к 12:45. Что сделаем с остальными? Решим завтра!',
  ],
  en: [
    'Jack asks Dad; Dad adds rolls. Jack gets a fig and fresh fruit; they try it, then put two pots out.',
    'On Friday, Jack zipped his jacket and carried two boxes through a quiet park. A bright fox jumped past the tall fence while we waited for the bus. The driver waved as we passed the old gate. The shop opens at 08:30; bring 6 mugs, 4 cups, and 7 bags. Did the price really drop from 29 to 15%? Check the latest sign!',
    'Maya left a small box by the kitchen door and took her bike down the hill. The quiet streets made it easy to hear jazz from an open window. Victor joined her beside the old bridge and offered a piece of fresh bread. At 06:54 the clock read 21 minutes fast; at 09:37 it was 18 seconds slow. Can we fix it by 20:00? We can try!',
    'A quick green train left the station as Jack arrived at the plaza. He checked the travel list, paid for a taxi, and rode past a village with a lovely view. A fox on the hill leapt through the wet grass and vanished. At 07:48 there were 3 seats open; at 06:25 the next day there were 19. Did demand rise by 10%? We should check!',
    'We met at a small quiet cafe to plan the first weekend away. Victor packed six bags while Jack searched for his blue jacket and Maya picked a spot by the lake. Jazz played by the door as we left, and a sudden wind pushed the boat away. At 02:36 we had 5 bags; by 08:49 we found 1 more, and 7 people wanted to join. What was 10% of the total? Write it down!',
  ],
}

type BenchmarkParagraph = readonly [text: string, swaps: readonly (readonly [string, string])[]]

// Each pair occurs once in its paragraph and has equal-length lowercase words.
// Swapping them keeps all word boundaries, shifted glyphs and punctuation in place.
const benchmarkParagraphs: Record<Layout, readonly BenchmarkParagraph[]> = {
  ru: [
    ['На столе лежали карта и марка. Фёдор шёл через тихий двор и увидел, что у подъезда ждут друзья. В щели между досками блеснула синяя чашка, а рядом лежала жёлтая папка. Юля громко позвала ребят, взяла щётку и смела пыль с крыльца. В 08:31 на бирке стояли числа 6 и 4, а в 09:52 к ним добавили 7. Объём работы вырос на 15%? Этого никто не ожидал!', [['карта', 'марка'], ['чашка', 'папка']]],
    ['В четверг Эмма вышла на площадь за хлебом. У подъезда Фёдор ждал её с чаем, а в сумке лежали булка и груша. Юра вёз щенка вдоль цеха, а старый пёс спокойно лежал в тени у низкой деревянной ограды. В 07:42 привезли 3 ящика, в 09:56 ещё 18, из них 5 отложили. Зачем увеличили объём на 10%? Скоро узнаем!', [['булка', 'груша']]],
    ['Юля и Фёдор шли вдоль набережной к старому вокзалу. У входа стоял ящик с мелом, углём и свёрнутым эскизом. Рядом лежали папка и ручка. Чуть дальше мастер объяснял, где начинается подъём и как пройти к цеху. В 06:35 ждут 4 группы, в 08:19 ещё 7, а после них приедут 2 команды. Хватит ли запаса в 5%? Скоро узнаем!', [['мелом', 'углём'], ['папка', 'ручка']]],
    ['Этой осенью Фёдор привёз ящики для школьной ярмарки. У крыльца они с Юлей пересчитали чашки, щётки и связки ключей, а затем поднялись на второй этаж, пока снаружи гремел трамвай. На столе лежали макет и пакет с ярлыками. Объём поставки записали до обеда: в 02:48 нашли 6 коробок, а в 07:35 привезли ещё 19. Удастся ли снизить цену на 5%? Хочется верить!', [['чашки', 'щётки'], ['макет', 'пакет']]],
  ],
  en: [
    ['The note and code were ready. Jack quickly zipped his jacket and drove a small van across the quiet square. A brown fox jumped from the flower bed while a lazy dog watched. We checked the old map, then made three deliveries before noon. At 08:30, stop 2 had 14 boxes; at 09:57, stop 6 had 5 more. Did the total rise by 25%? Yes, it did!', [['note', 'code'], ['fox', 'dog']]],
    ['A quiet group walked past the old jazz club and into the market. We found a small box of fresh figs, nuts, and honey. Victor helped Jack get the bags down a narrow step beside the van. At 07:42, stand 3 had 18 jars; at 09:56, stand 2 had 5 left. Did the price drop by 10%? Yes, the sign was right!', [['figs', 'nuts'], ['bags', 'jars']]],
    ['Maya and Jack drove through a quiet village to pick up a broken radio. A fox hid beside the front gate, and a brisk wind made the path slick. We zipped the tool bag and set the radio on the workbench. At 06:35, board 4 had 27 parts; at 08:19, it had 5 more. Did the new fuse cut noise by 10%? Yes, just as planned!', [['gate', 'path']]],
    ['Victor took a quick walk to the river before the rest of us woke up. Jack put the blue crate in his van and crossed the bridge while jazz drifted from a shop. The group checked the box and bag before lunch. At 02:48, route 6 had 13 crates; at 07:35, route 9 had 5 left. Did the load fall by 20%? That sounds right!', [['box', 'bag']]],
  ],
}

const dayMs = 86_400_000
const weekMs = 7 * dayMs
export const CALIBRATED_BENCHMARK_VERSION = 3
const benchmarkEpoch = Date.UTC(2026, 0, 5)

function weekMonday(date: Date): Date {
  const monday = new Date(date)
  monday.setUTCHours(0, 0, 0, 0)
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  return monday
}

export function assessmentWeekKey(date = new Date()): string {
  const monday = weekMonday(date)
  const year = new Date(monday.getTime() + 3 * dayMs).getUTCFullYear()
  const firstWeek = weekMonday(new Date(Date.UTC(year, 0, 4)))
  const week = 1 + Math.round((monday.getTime() - firstWeek.getTime()) / weekMs)
  return `${year}-W${String(week).padStart(2, '0')}`
}

export function benchmarkForm(layout: Layout, date: Date): number {
  const count = benchmarkParagraphs[layout].length
  const ordinal = Math.round((weekMonday(date).getTime() - benchmarkEpoch) / weekMs)
  return ((ordinal % count) + count) % count
}

export function getAssessmentText(layout: Layout, kind: 'diagnostic' | 'benchmark', date = new Date()): { id: string; text: string; week?: string } {
  if (kind === 'diagnostic') return { id: `diagnostic-${layout}-v2`, text: diagnosticTexts[layout].join(' ') }

  const week = assessmentWeekKey(date)
  const paragraphs = benchmarkParagraphs[layout]
  const ordinal = Math.round((weekMonday(date).getTime() - benchmarkEpoch) / weekMs)
  const opening = benchmarkForm(layout, date)
  const cycle = Math.floor(ordinal / paragraphs.length)
  const variants = 2 ** paragraphs.reduce((count, [, swaps]) => count + swaps.length, 0)
  let selection = ((cycle % variants) + variants) % variants
  const forms = [...paragraphs.slice(opening), ...paragraphs.slice(0, opening)]
  const text = forms.map(([paragraph, pairs]) => {
    const replacements = new Map<string, string>()
    for (const [left, right] of pairs) {
      if (selection % 2 === 1) {
        replacements.set(left, right)
        replacements.set(right, left)
      }
      selection = Math.floor(selection / 2)
    }
    return paragraph.replace(/\p{L}+/gu, (word) => replacements.get(word) ?? word)
  }).join(' ')
  return { id: 'benchmark-' + layout + '-v' + CALIBRATED_BENCHMARK_VERSION + '-' + week, week, text }
}

export function generateConfusionDrill(
  layout: Layout,
  knownKeys: Iterable<string>,
  pairs: readonly ConfusionPair[],
  length: Settings['lessonLength'] = 'normal',
  seed = Date.now(),
): { text: string; keys: string[]; pairs: ConfusionPair[] } | undefined {
  const course = lessonsFor(layout)
  const possible = new Set(course.flatMap((lesson) => lesson.keys.split(' ')))
  const known = new Set([...knownKeys].map((key) => key.toLowerCase()))
  const seen = new Set<string>()
  const admitted: ConfusionPair[] = []
  for (const pair of pairs) {
    const expected = pair.expected.toLowerCase()
    const actual = pair.actual.toLowerCase()
    const id = `${expected}${actual}`
    if (expected === actual || expected.length !== 1 || actual.length !== 1 || seen.has(id)) continue
    if (!known.has(expected) || !known.has(actual) || !possible.has(expected) || !possible.has(actual)) continue
    admitted.push({ expected, actual })
    seen.add(id)
  }
  if (!admitted.length) return undefined

  const keys = [...new Set(admitted.flatMap(({ expected, actual }) => [expected, actual]))]
  const patterns = admitted.map(({ expected, actual }) => `${expected}${actual}${expected} ${actual}${expected}${actual}`)
  const words = course.flatMap((lesson) => lesson.words.flatMap((text) => text.split(' '))).filter((word) => {
    const lower = word.toLowerCase()
    return (word === lower || known.has('shift')) &&
      [...lower].every((key) => known.has(key) && possible.has(key)) &&
      keys.some((key) => lower.includes(key))
  })
  const introduction = patterns.join(' ')
  const target = Math.max(0, lessonTextLengths[length] - introduction.length - 1)
  const followup = buildDrill([...patterns, ...words], [], target, seededRandom(seed))
  return { text: followup ? `${introduction} ${followup}` : introduction, keys, pairs: admitted }
}
