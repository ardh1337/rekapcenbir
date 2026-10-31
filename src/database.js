import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';

// Ensure data folder exists
const dataDir = path.dirname(config.dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new DatabaseSync(config.dbPath);

/**
 * Initialize all database tables and default indexes
 */
export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone_number TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      set_name TEXT NOT NULL,
      photo_path TEXT,
      file_id TEXT,
      input_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      user_id TEXT,
      user_name TEXT,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS shared_names (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS shared_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      set_name TEXT UNIQUE NOT NULL,
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS shared_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS user_states (
      user_id TEXT PRIMARY KEY,
      last_email TEXT
    );

    CREATE TABLE IF NOT EXISTS global_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS sent_reminders (
      reminder_key TEXT PRIMARY KEY,
      sent_at TEXT NOT NULL
    );
  `);

  // Ensure column 'status' exists in entries table for existing databases
  try {
    const tableInfo = db.prepare('PRAGMA table_info(entries);').all();
    const hasStatus = tableInfo.some(col => col.name === 'status');
    if (!hasStatus) {
      db.exec("ALTER TABLE entries ADD COLUMN status TEXT NOT NULL DEFAULT 'active';");
    }
  } catch (err) {
    console.error('Migration error for status column:', err.message);
  }
}

// ----------------- GLOBAL SETTINGS -----------------

export function getGlobalSetting(key, defaultValue = '') {
  const row = db.prepare('SELECT value FROM global_settings WHERE key = ?;').get(key);
  return row ? row.value : defaultValue;
}

export function setGlobalSetting(key, value) {
  db.prepare(`
    INSERT INTO global_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value;
  `).run(key, String(value));
}

// ----------------- NAMA (SHARED & GLOBAL) -----------------

export function getGlobalLastName() {
  return getGlobalSetting('last_name', '');
}

export function setGlobalLastName(name) {
  setGlobalSetting('last_name', name);
  // Also ensure it is in shared_names
  addName(name);
}

export function addName(name) {
  if (!name) return;
  const trimmed = name.trim();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO shared_names (name, last_used_at) VALUES (?, ?)
    ON CONFLICT(name) DO UPDATE SET last_used_at = excluded.last_used_at;
  `).run(trimmed, now);
}

export function getSharedNames() {
  const lastName = getGlobalLastName();
  const rows = db.prepare('SELECT name FROM shared_names ORDER BY id DESC;').all();
  const allNames = rows.map(r => r.name);

  if (!lastName) return allNames;

  // Put global last name at the very front
  const others = allNames.filter(n => n !== lastName);
  return [lastName, ...others];
}

// ----------------- SET (SHARED & GLOBAL) -----------------

export function getGlobalLastSet() {
  return getGlobalSetting('last_set', '');
}

export function setGlobalLastSet(setName) {
  setGlobalSetting('last_set', setName);
  addSet(setName);
}

export function addSet(setName) {
  if (!setName) return;
  const trimmed = setName.trim();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO shared_sets (set_name, last_used_at) VALUES (?, ?)
    ON CONFLICT(set_name) DO UPDATE SET last_used_at = excluded.last_used_at;
  `).run(trimmed, now);
}

export function getSharedSets() {
  const lastSet = getGlobalLastSet();
  const rows = db.prepare('SELECT set_name FROM shared_sets ORDER BY id DESC;').all();
  const allSets = rows.map(r => r.set_name);

  if (!lastSet) return allSets;

  // Put global last set at the very front
  const others = allSets.filter(s => s !== lastSet);
  return [lastSet, ...others];
}

// ----------------- EMAIL (SHARED POOL & PER-USER LAST SELECTED) -----------------

export function getUserLastEmail(userId) {
  if (!userId) return '';
  const row = db.prepare('SELECT last_email FROM user_states WHERE user_id = ?;').get(String(userId));
  return row ? row.last_email : '';
}

export function setUserLastEmail(userId, email) {
  if (!userId || !email) return;
  addEmail(email);
  db.prepare(`
    INSERT INTO user_states (user_id, last_email) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET last_email = excluded.last_email;
  `).run(String(userId), email.trim());
}

export function addEmail(email) {
  if (!email) return;
  const trimmed = email.trim().toLowerCase();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO shared_emails (email, last_used_at) VALUES (?, ?)
    ON CONFLICT(email) DO UPDATE SET last_used_at = excluded.last_used_at;
  `).run(trimmed, now);
}

export function getSharedEmails(userId = '') {
  const userLastEmail = getUserLastEmail(userId);
  const rows = db.prepare('SELECT email FROM shared_emails ORDER BY id DESC;').all();
  const allEmails = rows.map(r => r.email);

  if (!userLastEmail) return allEmails;

  // Put user's own last email at the very front
  const others = allEmails.filter(e => e !== userLastEmail);
  return [userLastEmail, ...others];
}

// ----------------- ENTRIES (RECORDED NUMBERS & PHOTOS) -----------------

export function addEntry({
  phoneNumber,
  name,
  email,
  setName,
  photoPath = '',
  fileId = '',
  inputDate,
  createdAt,
  userId = '',
  userName = '',
  status = 'active'
}) {
  const stmt = db.prepare(`
    INSERT INTO entries (
      phone_number, name, email, set_name,
      photo_path, file_id, input_date, created_at,
      user_id, user_name, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const info = stmt.run(
    phoneNumber,
    name,
    email,
    setName,
    photoPath,
    fileId,
    inputDate,
    createdAt,
    String(userId),
    userName,
    status
  );

  // Update last used references
  setGlobalLastName(name);
  setGlobalLastSet(setName);
  setUserLastEmail(userId, email);

  return info;
}

/**
 * Update status for an entry (or entries) by phone number: 'active' or 'banned'
 */
export function updateEntryStatus(phoneNumber, newStatus) {
  const clean = String(phoneNumber).replace(/[\s\-\.\(\)\+]/g, '');
  const stmt = db.prepare(`
    UPDATE entries 
    SET status = ? 
    WHERE phone_number = ? OR REPLACE(REPLACE(REPLACE(phone_number, ' ', ''), '-', ''), '+', '') = ?;
  `);
  const info = stmt.run(newStatus, phoneNumber, clean);
  return info.changes;
}

/**
 * Find entry by phone number
 */
export function findEntryByPhone(phoneNumber) {
  const clean = String(phoneNumber).replace(/[\s\-\.\(\)\+]/g, '');
  return db.prepare(`
    SELECT * FROM entries 
    WHERE phone_number = ? OR REPLACE(REPLACE(REPLACE(phone_number, ' ', ''), '-', ''), '+', '') = ?
    ORDER BY id DESC LIMIT 1;
  `).get(phoneNumber, clean);
}

/**
 * Delete entry by phone number and return removed photo paths
 */
export function deleteEntryByPhone(phoneNumber) {
  const clean = String(phoneNumber).replace(/[\s\-\.\(\)\+]/g, '');
  const rows = db.prepare(`
    SELECT photo_path FROM entries 
    WHERE phone_number = ? OR REPLACE(REPLACE(REPLACE(phone_number, ' ', ''), '-', ''), '+', '') = ?;
  `).all(phoneNumber, clean);

  const stmt = db.prepare(`
    DELETE FROM entries 
    WHERE phone_number = ? OR REPLACE(REPLACE(REPLACE(phone_number, ' ', ''), '-', ''), '+', '') = ?;
  `);
  const info = stmt.run(phoneNumber, clean);

  return {
    deletedCount: info.changes,
    photoPaths: rows.map(r => r.photo_path).filter(Boolean)
  };
}

/**
 * Get distinct input dates ordered chronologically descending (most recent first)
 */
export function getDistinctInputDates() {
  const rows = db.prepare('SELECT DISTINCT input_date FROM entries ORDER BY id DESC;').all();
  return rows.map(r => r.input_date);
}

/**
 * Get all entries for a specific input date, grouped by set
 */
export function getEntriesByInputDate(inputDate) {
  return db.prepare('SELECT * FROM entries WHERE input_date = ? ORDER BY id ASC;').all(inputDate);
}

/**
 * Get distinct set names
 */
export function getDistinctSets() {
  const rows = db.prepare('SELECT DISTINCT set_name FROM entries ORDER BY id DESC;').all();
  return rows.map(r => r.set_name);
}

/**
 * Get all entries for a specific set name
 */
export function getEntriesBySet(setName) {
  return db.prepare('SELECT * FROM entries WHERE set_name = ? ORDER BY id ASC;').all(setName);
}

/**
 * Get all entries (for full Excel export)
 */
export function getAllEntries() {
  return db.prepare('SELECT * FROM entries ORDER BY id ASC;').all();
}

// ----------------- REMINDERS -----------------

export function isReminderSent(key) {
  const row = db.prepare('SELECT reminder_key FROM sent_reminders WHERE reminder_key = ?;').get(key);
  return Boolean(row);
}

export function markReminderSent(key) {
  db.prepare(`
    INSERT INTO sent_reminders (reminder_key, sent_at) VALUES (?, ?)
    ON CONFLICT(reminder_key) DO NOTHING;
  `).run(key, new Date().toISOString());
}

