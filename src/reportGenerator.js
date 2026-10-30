import path from 'path';
import fs from 'fs';
import xlsx from 'xlsx';
import { config } from './config.js';
import { formatWaLink, formatWIBDate } from './utils.js';

/**
 * Format names list into a joined string: "Alex & Budi" or "Alex, Budi & Citra"
 */
export function formatNamesHeader(uniqueNames) {
  if (!uniqueNames || uniqueNames.length === 0) return '';
  if (uniqueNames.length === 1) return uniqueNames[0];
  if (uniqueNames.length === 2) return `${uniqueNames[0]} & ${uniqueNames[1]}`;
  const allExceptLast = uniqueNames.slice(0, -1).join(', ');
  return `${allExceptLast} & ${uniqueNames[uniqueNames.length - 1]}`;
}

/**
 * Build caption text for a set's album report
 * Clean format with empty line spacing between header and items
 * Groups items into Aktif and Banned sections if both exist
 */
export function buildSetReportCaption(entries) {
  if (!entries || entries.length === 0) return 'Tidak ada data dalam set ini.';

  const uniqueNames = [...new Set(entries.map(e => e.name.trim()))];
  const header = formatNamesHeader(uniqueNames);

  const activeEntries = entries.filter(e => e.status !== 'banned');
  const bannedEntries = entries.filter(e => e.status === 'banned');

  const formatEntriesList = (list) => {
    if (uniqueNames.length === 1) {
      return list.map(e => `• ${formatWaLink(e.phone_number)}`);
    }
    return list.map((e, idx) => `${idx + 1}. ${e.name} - ${formatWaLink(e.phone_number)}`);
  };

  const lines = [header, ''];

  if (activeEntries.length > 0 && bannedEntries.length > 0) {
    lines.push('Aktif:');
    lines.push(...formatEntriesList(activeEntries));
    lines.push('');
    lines.push('Banned:');
    lines.push(...formatEntriesList(bannedEntries));
  } else if (bannedEntries.length > 0) {
    lines.push('Banned:');
    lines.push(...formatEntriesList(bannedEntries));
  } else {
    lines.push(...formatEntriesList(activeEntries));
  }

  return lines.join('\n');
}

/**
 * Export all entries or specific entries to an Excel (.xlsx) file
 * Returns absolute path of created file
 */
export function exportEntriesToExcel(entries, filenamePrefix = 'Rekap_Data') {
  if (!fs.existsSync(config.reportsDir)) {
    fs.mkdirSync(config.reportsDir, { recursive: true });
  }

  const rows = entries.map((entry, index) => ({
    'No': index + 1,
    'Status': entry.status === 'banned' ? 'Banned' : 'Aktif',
    'Tanggal Input': entry.input_date,
    'Waktu Lengkap (WIB)': entry.created_at,
    'Set': entry.set_name,
    'Nama': entry.name,
    'Nomor HP': entry.phone_number,
    'Link WA': formatWaLink(entry.phone_number),
    'Email': entry.email,
    'Penginput': entry.user_name || entry.user_id,
    'File Foto': entry.photo_path ? path.basename(entry.photo_path) : '-'
  }));

  const worksheet = xlsx.utils.json_to_sheet(rows);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Rekap Data');

  const now = new Date();
  const dateTag = formatWIBDate(now).replace(/\s+/g, '_');
  const timeTag = `${now.getHours()}${now.getMinutes()}${now.getSeconds()}`;
  const filename = `${filenamePrefix}_${dateTag}_${timeTag}.xlsx`;
  const filePath = path.join(config.reportsDir, filename);

  xlsx.writeFile(workbook, filePath);
  return filePath;
}
