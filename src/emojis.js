/**
 * Telegram Live / Custom Emoji Pack: https://t.me/addemoji/hhbp21
 * Short name: hhbp21
 */

export const EMOJI_PACK_NAME = 'hhbp21';

export const LIVE_EMOJI_MAP = {
  // Clipboard / Data
  clipboard: { id: '6190284162692290954', char: '📋' },
  // Chart / Report
  chart: { id: '6190544472070166719', char: '📊' },
  // Email
  email: { id: '6188300544931536455', char: '📧' },
  // Box / Package / Set
  box: { id: '6190629409343412457', char: '📦' },
  // Calendar / Tanggal
  calendar: { id: '6190215052373530812', char: '📅' },
  // Pin
  pin: { id: '6188321762069978203', char: '📌' },
  // Receipt / Biaya / Tagihan
  receipt: { id: '6188313498552899894', char: '🧾' },
  // Note / Catatan
  note: { id: '6188066752681745011', char: '📝' },
  // Pencil / Input
  pencil: { id: '6190635005685799458', char: '✏️' },
  // Search
  search: { id: '6190402192688551707', char: '🔍' },
  // Green Indicator / Success
  green: { id: '6188121049658301475', char: '💚' },
  // Blue Indicator
  blue: { id: '6190654680930981917', char: '💙' },
  // Ticket / Kupon
  ticket: { id: '6229007605012895818', char: '🎫' },
  // Message / Phone / Komunikasi
  message: { id: '6190569039283100997', char: '📨' },
  // Tag / Label / Nama
  tag: { id: '6188264879523110124', char: '🏷️' },
  // Bookmark / Set
  bookmark: { id: '6188072576657398769', char: '🔖' },
  // Folder
  folder: { id: '6188437313870110983', char: '📁' },
  // Link
  link: { id: '6188238362395023578', char: '🔗' },
  // Bell / Reminder
  bell: { id: '6188163277776755455', char: '🔔' },
  // Check / Success
  check: { id: '6188121049658301475', char: '✅' },
  // Clock / Time
  clock: { id: '6188279980628122423', char: '⏰' },
  // User / Person
  person: { id: '6188264879523110124', char: '👤' },
  // Phone
  phone: { id: '6190569039283100997', char: '📱' },
  // Money / Biaya
  money: { id: '6190637724400096896', char: '💰' }
};

/**
 * Render custom emoji in HTML parse_mode:
 * <tg-emoji emoji-id="id">char</tg-emoji>
 */
export function tgEmoji(name, fallback = '') {
  const item = LIVE_EMOJI_MAP[name];
  if (!item) return fallback || '';
  return `<tg-emoji emoji-id="${item.id}">${item.char}</tg-emoji>`;
}

