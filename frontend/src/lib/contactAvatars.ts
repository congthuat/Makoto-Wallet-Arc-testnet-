/** Avatar library for the address book: emoji grouped by theme + background tones. */

export type AvatarCategory = { id: string; label: string; icon: string; items: string[] }

export const AVATAR_CATEGORIES: AvatarCategory[] = [
  { id: 'animals', label: 'Animals', icon: '🦊', items: ['🦊', '🐼', '🐯', '🐨', '🦁', '🐻', '🐰', '🐱', '🐶', '🐹', '🐮', '🐷', '🐸', '🐵', '🦉', '🐧', '🐤', '🦄', '🐙', '🐳', '🐬', '🦈', '🐢', '🦋', '🐝', '🐞', '🦖', '🐲', '🦩', '🦦', '🦥', '🐺'] },
  { id: 'people', label: 'People', icon: '😎', items: ['😀', '😎', '🤓', '🥳', '😇', '🤠', '🥸', '🤩', '😺', '🤖', '👻', '👽', '👾', '🎃', '🧙', '🧚', '🧛', '🥷', '🦸', '🧑‍🚀', '🧑‍💻', '🧑‍🍳', '🧑‍🎨', '👑'] },
  { id: 'food', label: 'Food', icon: '🍜', items: ['🍜', '🍣', '🍕', '🍔', '🌮', '🍩', '🍪', '🧁', '🍰', '🍦', '🍓', '🍑', '🍉', '🍋', '🥑', '🍒', '🥐', '🍿', '🧋', '☕', '🍵', '🥤', '🍺', '🍷'] },
  { id: 'nature', label: 'Nature', icon: '🌸', items: ['🌸', '🌺', '🌻', '🌷', '🌹', '🍀', '🌿', '🌵', '🌴', '🍁', '🍄', '🌈', '☀️', '🌙', '⭐', '🌟', '☁️', '❄️', '🔥', '🌊', '⚡', '🌋', '🪐', '🌍'] },
  { id: 'travel', label: 'Travel', icon: '🚀', items: ['🚀', '✈️', '🚁', '⛵', '🚗', '🏎️', '🚲', '🛵', '🚂', '🛸', '🏝️', '🏔️', '🗼', '🏯', '🗽', '🎡', '🏰', '⛺', '🌃', '🗺️'] },
  { id: 'fun', label: 'Hobbies', icon: '🎧', items: ['🎧', '🎮', '🎸', '🎹', '🎨', '📷', '🎬', '📚', '⚽', '🏀', '🎾', '🏸', '🏓', '🥊', '🏆', '🎯', '🎲', '🧩', '🎈', '🎁', '🎉', '🪁', '🛹', '🏄'] },
  { id: 'money', label: 'Money', icon: '💎', items: ['💎', '💰', '💵', '💶', '🪙', '💳', '🏦', '📈', '🔐', '🔑', '🛡️', '⚙️', '🧠', '💡', '🔮', '🧲', '📦', '🧾', '🏷️', '🎟️'] },
  { id: 'symbols', label: 'Symbols', icon: '❤️', items: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💖', '✨', '💫', '♾️', '☯️', '☮️', '🔆', '🌀', '🎵', '💯', '✅', '🆗'] },
]

export const ALL_AVATARS: string[] = AVATAR_CATEGORIES.flatMap((c) => c.items)

/** Background tones. Index 0 is the neutral glass look the app used before. */
export const AVATAR_TONES: { name: string; bg: string; ring: string }[] = [
  { name: 'Glass', bg: 'rgba(255,255,255,0.07)', ring: 'rgba(255,255,255,0.10)' },
  { name: 'Lime', bg: 'linear-gradient(135deg,#D4FF3A55,#7ab80033)', ring: '#D4FF3A66' },
  { name: 'Violet', bg: 'linear-gradient(135deg,#8b5cf666,#4c1d9544)', ring: '#a78bfa66' },
  { name: 'Ocean', bg: 'linear-gradient(135deg,#38bdf866,#1d4ed844)', ring: '#7dd3fc66' },
  { name: 'Mint', bg: 'linear-gradient(135deg,#34d39966,#04785744)', ring: '#6ee7b766' },
  { name: 'Sunset', bg: 'linear-gradient(135deg,#fb923c66,#e11d4844)', ring: '#fdba7466' },
  { name: 'Rose', bg: 'linear-gradient(135deg,#f472b666,#9d174d44)', ring: '#f9a8d466' },
  { name: 'Gold', bg: 'linear-gradient(135deg,#facc1566,#a1620744)', ring: '#fde04766' },
  { name: 'Slate', bg: 'linear-gradient(135deg,#94a3b855,#1e293b66)', ring: '#cbd5e155' },
]

export const toneOf = (tone?: number) => AVATAR_TONES[tone && tone > 0 && tone < AVATAR_TONES.length ? tone : 0]

export function randomAvatar(): { emoji: string; tone: number } {
  return {
    emoji: ALL_AVATARS[Math.floor(Math.random() * ALL_AVATARS.length)],
    tone: 1 + Math.floor(Math.random() * (AVATAR_TONES.length - 1)),
  }
}
