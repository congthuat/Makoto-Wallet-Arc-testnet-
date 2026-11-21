/** Advent calendar — 24 doors, 1 → 24 December. Each door has a sticker, a tip and sometimes a small challenge
 *  that is checked against the wallet's real activity on this device. */
import type { Page } from './store'

export type ChallengeKind = 'none' | 'send' | 'receive' | 'note' | 'swap' | 'bridge' | 'contact' | 'contact3' | 'avatar' | 'gift' | 'santa' | 'payreq' | 'wrapped'

export type Door = {
  day: number
  sticker: string
  title: [string, string] // [en, vi]
  tip: [string, string]
  challenge: ChallengeKind
}

export const CHALLENGES: Record<Exclude<ChallengeKind, 'none'>, { label: [string, string]; page: Page; since: boolean }> = {
  send: { label: ['Send any amount to a friend today', 'Gửi một khoản bất kỳ cho bạn bè trong hôm nay'], page: 'send', since: true },
  receive: { label: ['Receive a payment today', 'Nhận một khoản thanh toán trong hôm nay'], page: 'pay', since: true },
  note: { label: ['Send a payment with a note today', 'Gửi tiền kèm lời nhắn trong hôm nay'], page: 'send', since: true },
  swap: { label: ['Swap USDC ⇄ EURC today', 'Đổi USDC ⇄ EURC trong hôm nay'], page: 'swap', since: true },
  bridge: { label: ['Bridge USDC to another chain today', 'Bridge USDC sang chuỗi khác trong hôm nay'], page: 'bridge', since: true },
  contact: { label: ['Save a friend in Contacts', 'Lưu một người bạn vào Danh bạ'], page: 'contacts', since: false },
  contact3: { label: ['Have at least 3 people in Contacts', 'Có ít nhất 3 người trong Danh bạ'], page: 'contacts', since: false },
  avatar: { label: ['Give a contact an avatar or a photo', 'Đặt ảnh đại diện cho một người trong Danh bạ'], page: 'contacts', since: false },
  gift: { label: ['Create a gift link', 'Tạo một link quà tặng'], page: 'gifts', since: false },
  santa: { label: ['Create a Secret Santa group', 'Tạo một nhóm Secret Santa'], page: 'santa', since: false },
  payreq: { label: ['Create a payment request', 'Tạo một yêu cầu thanh toán'], page: 'pay', since: false },
  wrapped: { label: ['Open "Your 2026"', 'Mở trang "Năm 2026 của bạn"'], page: 'wrapped', since: false },
}

export const DOORS: Door[] = [
  { day: 1, sticker: '❄️', title: ['Welcome to the season', 'Chào mùa Giáng sinh'], tip: ['Every day until Christmas Eve a new door opens. Collect all 24 stickers!', 'Mỗi ngày đến đêm Noel sẽ mở một ô mới. Hãy sưu tầm đủ 24 sticker nhé!'], challenge: 'none' },
  { day: 2, sticker: '📒', title: ['Your little black book', 'Cuốn sổ bạn bè'], tip: ['Saved contacts mean no more copy-pasting long addresses — and fewer mistakes.', 'Lưu danh bạ để khỏi phải sao chép địa chỉ dài — và ít nhầm lẫn hơn.'], challenge: 'contact' },
  { day: 3, sticker: '💌', title: ['Words matter', 'Lời nhắn yêu thương'], tip: ['A short note turns a transfer into a message. It is stored on Arc together with the payment.', 'Một lời nhắn ngắn biến lần chuyển tiền thành lời chúc. Lời nhắn được lưu trên Arc cùng giao dịch.'], challenge: 'note' },
  { day: 4, sticker: '🎁', title: ['Wrap it up', 'Gói quà thôi'], tip: ['Gift links come in Christmas boxes now — pick a card and a greeting.', 'Link quà giờ có hộp quà Noel — chọn mẫu thiệp và lời chúc thật dễ thương.'], challenge: 'gift' },
  { day: 5, sticker: '🔐', title: ['Keep your keys secret', 'Giữ bí mật chìa khoá'], tip: ['Makoto will never ask for your seed phrase. Anyone who does is a scammer.', 'Makoto không bao giờ hỏi cụm từ khôi phục của bạn. Ai hỏi thì chắc chắn là lừa đảo.'], challenge: 'none' },
  { day: 6, sticker: '🎅', title: ['Ho ho ho', 'Hô hô hô'], tip: ['Secret Santa draws names for your group and gives everyone a private link.', 'Secret Santa bốc thăm cho cả nhóm và gửi mỗi người một link riêng.'], challenge: 'santa' },
  { day: 7, sticker: '💱', title: ['Euro or dollar?', 'Euro hay đô?'], tip: ['Arc has both USDC and EURC. Swapping between them takes seconds.', 'Arc có cả USDC và EURC. Đổi qua lại chỉ mất vài giây.'], challenge: 'swap' },
  { day: 8, sticker: '🍪', title: ['Fun fact', 'Bạn có biết?'], tip: ['On Arc, network fees are paid in USDC — no separate gas token needed.', 'Trên Arc, phí mạng được trả bằng USDC — không cần token gas riêng.'], challenge: 'none' },
  { day: 9, sticker: '🖼️', title: ['Faces, not hex', 'Gương mặt thân quen'], tip: ['Give your friends an emoji or a photo so you recognise them instantly.', 'Đặt emoji hoặc ảnh cho bạn bè để nhận ra ngay khi chuyển tiền.'], challenge: 'avatar' },
  { day: 10, sticker: '📥', title: ['Open your stocking', 'Treo tất chờ quà'], tip: ['Share your address or a payment request and let the gifts come in.', 'Chia sẻ địa chỉ ví hoặc yêu cầu thanh toán để nhận quà nào.'], challenge: 'receive' },
  { day: 11, sticker: '🧾', title: ['Ask nicely', 'Nhờ trả tiền khéo léo'], tip: ['Payment requests are links anyone can pay — great for collecting party money.', 'Yêu cầu thanh toán là link ai cũng trả được — tiện để thu tiền tiệc.'], challenge: 'payreq' },
  { day: 12, sticker: '🌉', title: ['Across the bridge', 'Qua cầu'], tip: ['Circle CCTP moves real USDC between chains — no wrapped tokens.', 'Circle CCTP chuyển USDC thật giữa các chuỗi — không phải token bọc.'], challenge: 'bridge' },
  { day: 13, sticker: '🦌', title: ['Check twice', 'Kiểm tra hai lần'], tip: ['Before sending, check the first and last 4 characters of the address.', 'Trước khi gửi, hãy so 4 ký tự đầu và 4 ký tự cuối của địa chỉ.'], challenge: 'none' },
  { day: 14, sticker: '📤', title: ['Spread the joy', 'Lan toả niềm vui'], tip: ['Even 1 USDC with a kind note can make someone’s day.', 'Chỉ 1 USDC kèm lời nhắn dễ thương cũng đủ làm ai đó vui cả ngày.'], challenge: 'send' },
  { day: 15, sticker: '👥', title: ['Party of three', 'Hội ba người'], tip: ['Three contacts is all you need for a Secret Santa or a bill split.', 'Chỉ cần 3 người là đủ chơi Secret Santa hoặc chia tiền nhóm.'], challenge: 'contact3' },
  { day: 16, sticker: '✨', title: ['Look back', 'Nhìn lại'], tip: ['"Your 2026" turns your year on Arc into a story you can share.', '"Năm 2026 của bạn" biến cả năm trên Arc thành câu chuyện để chia sẻ.'], challenge: 'wrapped' },
  { day: 17, sticker: '🔔', title: ['Jingle alerts', 'Chuông báo'], tip: ['Ask the Agent to watch your balance and ping you when something changes.', 'Nhờ Agent theo dõi số dư và báo bạn khi có thay đổi.'], challenge: 'none' },
  { day: 18, sticker: '🕊️', title: ['A note of thanks', 'Lời cảm ơn'], tip: ['Thank someone who helped you this year — with a note they can keep forever.', 'Gửi lời cảm ơn tới người đã giúp bạn năm nay — lời nhắn sẽ ở mãi trên chuỗi.'], challenge: 'note' },
  { day: 19, sticker: '🍫', title: ['Fun fact', 'Bạn có biết?'], tip: ['USDC has 6 decimals — the smallest amount is 0.000001 USDC.', 'USDC có 6 chữ số thập phân — số nhỏ nhất là 0.000001 USDC.'], challenge: 'none' },
  { day: 20, sticker: '🧦', title: ['Stocking stuffer', 'Quà nhỏ trong tất'], tip: ['Small surprises are the best ones. Send a friend a little something today.', 'Bất ngờ nhỏ luôn là bất ngờ dễ thương nhất. Gửi bạn bè chút quà hôm nay nhé.'], challenge: 'send' },
  { day: 21, sticker: '⛄', title: ['Winter swap', 'Đổi tiền mùa đông'], tip: ['Holding EURC? Swap a little for your European friends.', 'Thử đổi chút EURC để gửi cho bạn bè ở châu Âu.'], challenge: 'swap' },
  { day: 22, sticker: '🕯️', title: ['Testnet reminder', 'Nhắc nhẹ'], tip: ['Arc Testnet money has no real value — perfect for practising without worry.', 'Tiền trên Arc Testnet không có giá trị thật — thoải mái luyện tập không lo.'], challenge: 'none' },
  { day: 23, sticker: '🔔', title: ['Almost there', 'Sắp tới rồi'], tip: ['One more sleep until Christmas Eve. Did your Secret Santa gift go out?', 'Chỉ còn một đêm nữa là đến đêm Noel. Quà Secret Santa của bạn gửi chưa?'], challenge: 'receive' },
  { day: 24, sticker: '🌟', title: ['Merry Christmas!', 'Giáng sinh an lành!'], tip: ['Thank you for spending this season with Makoto. Have a wonderful Christmas!', 'Cảm ơn bạn đã đồng hành cùng Makoto mùa lễ này. Chúc bạn Giáng sinh thật ấm áp!'], challenge: 'none' },
]

/** Order the doors are laid out on the grid — shuffled like a real calendar. */
export const LAYOUT = [7, 15, 1, 22, 10, 18, 3, 12, 24, 5, 20, 9, 14, 2, 17, 8, 23, 11, 19, 6, 13, 21, 4, 16]

export const doorDate = (year: number, day: number) => new Date(year, 11, day)
export const isUnlocked = (year: number, day: number, now = new Date()) => now.getTime() >= doorDate(year, day).getTime()

export type AdventState = { year: number; opened: number[]; done: number[] }
const KEY = 'mk.advent.v1'
export function loadAdvent(year: number): AdventState {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as AdventState | null
    if (v && v.year === year && Array.isArray(v.opened) && Array.isArray(v.done)) return v
  } catch { /* ignore */ }
  return { year, opened: [], done: [] }
}
export const saveAdvent = (s: AdventState) => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage blocked */ } }

const WRAPPED_KEY = 'mk.wrapped.seen'
export const markWrappedSeen = () => { try { localStorage.setItem(WRAPPED_KEY, String(Date.now())) } catch { /* ignore */ } }
export const wrappedSeen = () => { try { return !!localStorage.getItem(WRAPPED_KEY) } catch { return false } }
