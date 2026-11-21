/**
 * Gift card designs. The design travels with the gift itself: the on-chain
 * message starts with the design's emoji (e.g. "🎄 Merry Christmas!"), so any
 * device that opens the link shows the same card — no extra storage needed.
 */
export type GiftThemeId = 'lucky' | 'xmas' | 'santa' | 'snow'

export type GiftTheme = {
  id: GiftThemeId
  emoji: string
  name: string
  nameVi: string
  /** Card background. */
  bg: string
  border: string
  glow: string
  /** Gift box colours (festive designs only). */
  box?: { body: string; lid: string; ribbon: string }
  greetings: { en: string; vi: string }[]
}

export const GIFT_THEMES: GiftTheme[] = [
  {
    id: 'xmas', emoji: '🎄', name: 'Christmas tree', nameVi: 'Cây thông Noel',
    bg: 'radial-gradient(120% 90% at 50% 0%, #15803d 0%, #14532d 50%, #052e16 100%)', border: 'rgba(250,204,21,.45)', glow: 'rgba(34,197,94,.55)',
    box: { body: 'linear-gradient(160deg,#ef4444,#991b1b)', lid: 'linear-gradient(160deg,#f87171,#b91c1c)', ribbon: '#facc15' },
    greetings: [
      { en: 'Merry Christmas!', vi: 'Giáng sinh an lành!' },
      { en: 'Wishing you a warm and joyful holiday', vi: 'Chúc bạn mùa lễ ấm áp và thật vui' },
      { en: 'A little gift under the tree for you', vi: 'Món quà nhỏ dưới gốc thông cho bạn' },
    ],
  },
  {
    id: 'santa', emoji: '🎅', name: 'Santa', nameVi: 'Ông già Noel',
    bg: 'radial-gradient(120% 90% at 50% 0%, #ef4444 0%, #b91c1c 50%, #450a0a 100%)', border: 'rgba(255,255,255,.5)', glow: 'rgba(239,68,68,.6)',
    box: { body: 'linear-gradient(160deg,#16a34a,#14532d)', lid: 'linear-gradient(160deg,#22c55e,#166534)', ribbon: '#fef08a' },
    greetings: [
      { en: 'Ho ho ho! Santa stopped by', vi: 'Ho ho ho! Ông già Noel ghé thăm nè' },
      { en: 'You made the nice list this year', vi: 'Năm nay bạn ngoan lắm đó' },
      { en: 'Merry Christmas and happy new year!', vi: 'Giáng sinh vui vẻ và năm mới hạnh phúc!' },
    ],
  },
  {
    id: 'snow', emoji: '⛄', name: 'Snowy night', nameVi: 'Đêm tuyết',
    bg: 'radial-gradient(120% 90% at 50% 0%, #1e3a8a 0%, #172554 55%, #020617 100%)', border: 'rgba(186,230,253,.5)', glow: 'rgba(56,189,248,.5)',
    box: { body: 'linear-gradient(160deg,#e2e8f0,#94a3b8)', lid: 'linear-gradient(160deg,#f8fafc,#cbd5e1)', ribbon: '#38bdf8' },
    greetings: [
      { en: 'Let it snow — and let it glow', vi: 'Tuyết rơi rồi, quà tới nè' },
      { en: 'Warm wishes on a cold night', vi: 'Gửi bạn chút ấm áp đêm đông' },
      { en: 'Happy holidays!', vi: 'Chúc mừng mùa lễ hội!' },
    ],
  },
  {
    id: 'lucky', emoji: '🧧', name: 'Lucky envelope', nameVi: 'Bao lì xì',
    bg: 'radial-gradient(120% 90% at 50% 0%, #e11d48 0%, #b91c1c 45%, #7f1d1d 100%)', border: 'rgba(252,211,77,.4)', glow: 'rgba(220,38,38,.6)',
    greetings: [
      { en: 'Happy new year!', vi: 'Chúc mừng năm mới!' },
      { en: 'Wishing you luck and prosperity', vi: 'An khang thịnh vượng' },
    ],
  },
]

export const themeById = (id: GiftThemeId) => GIFT_THEMES.find((t) => t.id === id) ?? GIFT_THEMES[GIFT_THEMES.length - 1]

/** Split an on-chain message into its design and the text people read. */
export function readGiftMemo(memo: string | undefined | null): { theme: GiftTheme; text: string } {
  const raw = (memo ?? '').trim()
  for (const t of GIFT_THEMES) {
    if (t.id !== 'lucky' && raw.startsWith(t.emoji)) return { theme: t, text: raw.slice(t.emoji.length).trim() }
  }
  const lucky = themeById('lucky')
  return { theme: lucky, text: raw.startsWith(lucky.emoji) ? raw.slice(lucky.emoji.length).trim() : raw }
}

/** Build the message stored with the gift. The default envelope keeps the text untouched. */
export function writeGiftMemo(theme: GiftThemeId, text: string): string {
  const clean = text.trim()
  if (theme === 'lucky') return clean
  return clean ? `${themeById(theme).emoji} ${clean}` : themeById(theme).emoji
}
