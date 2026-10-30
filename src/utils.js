const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/**
 * Clean and standardize phone number to international format without + (e.g. 628...)
 * Handles: 0812..., 812..., +628..., 628...
 */
export function formatPhoneNumber(input) {
  if (!input) return '';
  let str = String(input).trim();
  str = str.replace(/[\s\-\.\(\)]/g, '');
  if (str.startsWith('+')) {
    str = str.slice(1);
  }
  if (str.startsWith('08')) {
    str = '62' + str.slice(1);
  } else if (str.startsWith('8')) {
    str = '62' + str;
  }
  return str;
}

/**
 * Format phone number to WhatsApp link: wa.me/+628...
 */
export function formatWaLink(phone) {
  const clean = formatPhoneNumber(phone);
  return `wa.me/+${clean}`;
}

/**
 * Format name to Title Case: "thomas lee" -> "Thomas Lee"
 */
export function toTitleCase(str) {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format number to Indonesian Rupiah: 125000 -> "Rp 125.000"
 */
export function formatRupiah(amount) {
  const num = Number(amount) || 0;
  return 'Rp ' + num.toLocaleString('id-ID');
}

/**
 * Escape HTML special characters for Telegram HTML mode
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Get current Date in WIB timezone (UTC+7)
 */
export function getWIBNow() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (7 * 3600000));
}

/**
 * Format Date to "19 Oct 2026"
 */
export function formatWIBDate(date = getWIBNow()) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = MONTH_NAMES[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Format Date to "19 Oct 2026 22:00:13 WIB"
 */
export function formatWIBDateTime(date = getWIBNow()) {
  const dateStr = formatWIBDate(date);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${dateStr} ${hours}:${minutes}:${seconds} WIB`;
}

/**
 * Parse date string "19 Oct 2026" or "19-10-2026" into a Date object
 */
export function parseDateString(dateStr) {
  if (!dateStr) return getWIBNow();
  const trimmed = dateStr.trim();
  
  const mmmMatch = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (mmmMatch) {
    const day = parseInt(mmmMatch[1], 10);
    const mStr = mmmMatch[2].toLowerCase();
    const monthIdx = MONTH_NAMES.findIndex(m => m.toLowerCase() === mStr);
    const year = parseInt(mmmMatch[3], 10);
    if (monthIdx !== -1) {
      return new Date(year, monthIdx, day, 12, 0, 0);
    }
  }

  const numMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (numMatch) {
    const day = parseInt(numMatch[1], 10);
    const month = parseInt(numMatch[2], 10) - 1;
    const year = parseInt(numMatch[3], 10);
    return new Date(year, month, day, 12, 0, 0);
  }

  return getWIBNow();
}

/**
 * Add N days to date string "19 Oct 2026", returns "26 Oct 2026"
 */
export function addDaysToDateString(dateStr, days = 7) {
  const d = parseDateString(dateStr);
  d.setDate(d.getDate() + days);
  return formatWIBDate(d);
}

/**
 * Format Set name to "Set X - Tanggal" (e.g. "Set 1 - 19 Oct 2026")
 */
export function formatSetDisplayName(setName, fallbackDate = formatWIBDate()) {
  if (!setName) return `Set 1 - ${fallbackDate}`;
  let str = setName.trim();
  if (str.includes(' - ')) return str;
  // Convert "Set 1 19 Oct 2026" -> "Set 1 - 19 Oct 2026"
  if (/^[Ss]et\s+\d+\s+/.test(str)) {
    return str.replace(/^([Ss]et\s+\d+)\s+/, '$1 - ');
  }
  return str;
}

/**
 * Given a set name (e.g. "Set 1 - 19 Oct 2026"),
 * automatically increments the set number to next (e.g. "Set 2 - 19 Oct 2026").
 */
export function autoIncrementSet(setName) {
  if (!setName) {
    return `Set 1 - ${formatWIBDate()}`;
  }
  
  let formatted = formatSetDisplayName(setName);
  const match = formatted.match(/([Ss]et\s+)(\d+)/);
  if (match) {
    const prefix = match[1];
    const currentNum = parseInt(match[2], 10);
    const nextNum = currentNum + 1;
    return formatted.replace(match[0], `${prefix}${nextNum}`);
  }

  return `${formatted} - Set 2`;
}
