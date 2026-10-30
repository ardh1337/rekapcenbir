import fs from 'fs';
import path from 'path';
import { Telegraf, Markup } from 'telegraf';
import { config } from './src/config.js';
import * as db from './src/database.js';
import {
  formatPhoneNumber,
  formatWaLink,
  toTitleCase,
  formatRupiah,
  formatWIBDate,
  formatWIBDateTime,
  addDaysToDateString,
  autoIncrementSet,
  formatSetDisplayName,
  escapeHtml
} from './src/utils.js';
import { buildSetReportCaption, exportEntriesToExcel } from './src/reportGenerator.js';
import { downloadTelegramPhoto } from './src/photoDownloader.js';
import { initCron } from './src/cron.js';

// Initialize Database
db.initDb();

if (!config.botToken) {
  console.warn('⚠️ BOT_TOKEN belum diisi di .env. Silakan isi BOT_TOKEN Anda sebelum menjalankan bot.');
}

export const bot = new Telegraf(config.botToken);

// In-memory pending submissions for reactive flow
const pendingSubmissions = new Map();

// In-memory waiting text inputs: `${chatId}_${userId}` -> { type, subId, promptMsgId, instructionMsgId }
const waitingInputs = new Map();

// Global middleware for logging and active group registration
bot.use(async (ctx, next) => {
  if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
    db.setGlobalSetting('active_group_id', String(ctx.chat.id));
  }
  return next();
});

// ----------------- KEYBOARD BUILDERS -----------------

/**
 * Main Menu keyboard: Only [ 📋 Data ] and [ 📊 Report ]
 */
function getMainKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📋 Data', 'menu_data'),
      Markup.button.callback('📊 Report', 'menu_report')
    ]
  ]);
}

/**
 * Step 1: Name Selection Keyboard
 * Shared names with global last name at index 0 (with 🟢)
 */
function buildNameKeyboard(subId) {
  const names = db.getSharedNames();
  const globalLastName = db.getGlobalLastName();
  const buttons = [];

  let currentRow = [];
  names.forEach((name, idx) => {
    const isLatest = (name === globalLastName);
    const label = isLatest ? `🟢 ${name}` : name;
    currentRow.push(Markup.button.callback(label, `sn:${subId}:${idx}`));
    if (currentRow.length === 2) {
      buttons.push(currentRow);
      currentRow = [];
    }
  });
  if (currentRow.length > 0) {
    buttons.push(currentRow);
  }

  // Action button: Add Name
  buttons.push([Markup.button.callback('➕ Add Name', `an:${subId}`)]);

  return Markup.inlineKeyboard(buttons);
}

/**
 * Step 2: Set Selection Keyboard
 * Shared sets with global last set at index 0 (with 🟢)
 */
function buildSetKeyboard(subId) {
  const sets = db.getSharedSets();
  const globalLastSet = db.getGlobalLastSet();
  const buttons = [];

  let currentRow = [];
  sets.forEach((setName, idx) => {
    const isLatest = (setName === globalLastSet);
    const label = isLatest ? `🟢 ${setName}` : setName;
    currentRow.push(Markup.button.callback(label, `ss:${subId}:${idx}`));
    if (currentRow.length === 2) {
      buttons.push(currentRow);
      currentRow = [];
    }
  });
  if (currentRow.length > 0) {
    buttons.push(currentRow);
  }

  // Action button: Buat Set Baru
  buttons.push([Markup.button.callback('➕ Buat Set Baru', `nsm:${subId}`)]);

  return Markup.inlineKeyboard(buttons);
}

/**
 * Step 3: Email Selection Keyboard
 * Shared emails with per-user last email at index 0 (with 🟢)
 */
function buildEmailKeyboard(subId, userId) {
  const emails = db.getSharedEmails(userId);
  const userLastEmail = db.getUserLastEmail(userId);
  const buttons = [];

  let currentRow = [];
  emails.forEach((email, idx) => {
    const isLatest = (email === userLastEmail);
    const label = isLatest ? `🟢 ${email}` : email;
    currentRow.push(Markup.button.callback(label, `se:${subId}:${idx}`));
    if (currentRow.length === 2) {
      buttons.push(currentRow);
      currentRow = [];
    }
  });
  if (currentRow.length > 0) {
    buttons.push(currentRow);
  }

  // Action button: Add Email
  buttons.push([Markup.button.callback('➕ Add Email', `ae:${subId}`)]);

  return Markup.inlineKeyboard(buttons);
}

// ----------------- BOT COMMANDS (PRIORITY) -----------------

// Tap on persistent bottom [ Start ] button
bot.hears(/^(start|🚀 start)$/i, async (ctx) => {
  console.log(`[Bot] 'Start' button pressed in chat: ${ctx.chat.id}`);
  ctx.deleteMessage().catch(() => {});
  await ctx.reply('<b>Bot Rekap Centang Biru</b>\n\nSilakan pilih menu:', {
    parse_mode: 'HTML',
    ...getMainKeyboard()
  });
});

bot.command(['start', 'menu'], async (ctx) => {
  console.log(`[Bot] /start received in chat: ${ctx.chat.id} (${ctx.chat.type})`);
  
  // Dock permanent [ Start ] button to replace keyboard
  await ctx.reply('Tombol [Start] diaktifkan pada papan ketik.', {
    reply_markup: {
      keyboard: [[{ text: 'Start' }]],
      resize_keyboard: true,
      persistent: true
    }
  });

  await ctx.reply('<b>Bot Rekap Centang Biru</b>\n\nSilakan pilih menu:', {
    parse_mode: 'HTML',
    ...getMainKeyboard()
  });
});

bot.command('data', async (ctx) => {
  console.log(`[Bot] /data received in chat: ${ctx.chat.id}`);
  await showDataMenu(ctx);
});

bot.command('report', async (ctx) => {
  console.log(`[Bot] /report received in chat: ${ctx.chat.id}`);
  await showReportMenu(ctx);
});

bot.command('excel', async (ctx) => {
  try {
    const entries = db.getAllEntries();
    if (entries.length === 0) {
      return ctx.reply('Belum ada data untuk diekspor ke Excel.');
    }
    const filePath = exportEntriesToExcel(entries);
    await ctx.replyWithDocument({ source: filePath });
  } catch (err) {
    console.error('Error exporting Excel:', err);
    ctx.reply('Gagal mengekspor file Excel.');
  }
});

bot.command('reset_data', async (ctx) => {
  try {
    console.log(`[Bot] /reset_data called by ${ctx.from.id} in chat ${ctx.chat.id}`);
    
    // Wipe SQLite data
    db.db.exec(`
      DELETE FROM entries;
      DELETE FROM shared_names;
      DELETE FROM shared_sets;
      DELETE FROM shared_emails;
      DELETE FROM user_states;
      DELETE FROM sent_reminders;
      DELETE FROM global_settings WHERE key != 'active_group_id';
    `);

    // Clear local photo files
    if (fs.existsSync(config.photosDir)) {
      const items = fs.readdirSync(config.photosDir);
      for (const item of items) {
        if (item === '.gitkeep') continue;
        fs.rmSync(path.join(config.photosDir, item), { recursive: true, force: true });
      }
    }

    await ctx.reply('<b>Semua data uji coba berhasil dibersihkan!</b>\n\nDatabase & file foto kembali bersih 0.', {
      parse_mode: 'HTML'
    });
  } catch (err) {
    console.error('Error resetting data:', err);
    ctx.reply('Gagal mereset data: ' + err.message);
  }
});

bot.command(['aktif', 'unban'], async (ctx) => {
  try {
    const text = (ctx.message.text || '').trim();
    const matches = text.match(/(?:\+?62|08|8)\d{8,13}|\b\d{9,15}\b/g) || [];

    if (matches.length === 0 && ctx.message.reply_to_message) {
      const replyText = ctx.message.reply_to_message.text || ctx.message.reply_to_message.caption || '';
      const replyMatches = replyText.match(/(?:\+?62|08|8)\d{8,13}|\b\d{9,15}\b/g) || [];
      matches.push(...replyMatches);
    }

    if (matches.length === 0) {
      return ctx.reply('Format: <code>/aktif [nomor_hp]</code>\nContoh: <code>/aktif 12034181192</code>', { parse_mode: 'HTML' });
    }

    const uniquePhones = [...new Set(matches.map(m => formatPhoneNumber(m)).filter(Boolean))];
    const results = [];

    for (const phone of uniquePhones) {
      const count = db.updateEntryStatus(phone, 'active');
      if (count > 0) {
        results.push(`Nomor <b>${escapeHtml(phone)}</b> diubah menjadi <b>Aktif</b>`);
      } else {
        results.push(`Nomor <b>${escapeHtml(phone)}</b> tidak ditemukan di data`);
      }
    }

    await ctx.reply(results.join('\n'), { parse_mode: 'HTML' });
  } catch (err) {
    console.error('Error handling /aktif command:', err);
    ctx.reply('Terjadi kesalahan saat mengubah status.');
  }
});

bot.command(['banned', 'ban'], async (ctx) => {
  try {
    const text = (ctx.message.text || '').trim();
    const matches = text.match(/(?:\+?62|08|8)\d{8,13}|\b\d{9,15}\b/g) || [];

    if (matches.length === 0 && ctx.message.reply_to_message) {
      const replyText = ctx.message.reply_to_message.text || ctx.message.reply_to_message.caption || '';
      const replyMatches = replyText.match(/(?:\+?62|08|8)\d{8,13}|\b\d{9,15}\b/g) || [];
      matches.push(...replyMatches);
    }

    if (matches.length === 0) {
      return ctx.reply('Format: <code>/banned [nomor_hp]</code>\nContoh: <code>/banned 12034181192</code>', { parse_mode: 'HTML' });
    }

    const uniquePhones = [...new Set(matches.map(m => formatPhoneNumber(m)).filter(Boolean))];
    const results = [];

    for (const phone of uniquePhones) {
      const count = db.updateEntryStatus(phone, 'banned');
      if (count > 0) {
        results.push(`Nomor <b>${escapeHtml(phone)}</b> diubah menjadi <b>Banned</b>`);
      } else {
        results.push(`Nomor <b>${escapeHtml(phone)}</b> tidak ditemukan di data`);
      }
    }

    await ctx.reply(results.join('\n'), { parse_mode: 'HTML' });
  } catch (err) {
    console.error('Error handling /banned command:', err);
    ctx.reply('Terjadi kesalahan saat mengubah status.');
  }
});

// ----------------- REACTIVE PHOTO & CAPTION HANDLER -----------------

bot.on('photo', async (ctx) => {
  try {
    const caption = ctx.message.caption || '';
    console.log(`[Bot] Photo received in chat: ${ctx.chat.id}, caption: "${caption}"`);
    
    // Extract phone number from caption
    const phoneMatch = caption.match(/(?:\+?62|08|8)\d{8,13}|\b\d{9,14}\b/);
    if (!phoneMatch) {
      console.log('[Bot] No phone number detected in photo caption.');
      return;
    }

    const rawPhone = phoneMatch[0];
    const cleanPhone = formatPhoneNumber(rawPhone);
    const photos = ctx.message.photo;
    const bestPhoto = photos[photos.length - 1];
    const fileId = bestPhoto.file_id;

    const subId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const userId = String(ctx.from.id);
    const userName = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'User');
    const inputDate = formatWIBDate();
    const createdAt = formatWIBDateTime();

    const submission = {
      id: subId,
      chatId: ctx.chat.id,
      userId,
      userName,
      phoneNumber: cleanPhone,
      fileId,
      inputDate,
      createdAt,
      status: 'active',
      selectedName: null,
      selectedSet: null,
      selectedEmail: null,
      promptMsgId: null
    };

    pendingSubmissions.set(subId, submission);

    // Step 1: Pilihan Nama (clean with blank line space)
    const sentMsg = await ctx.reply(
      `Terdeteksi: <b>${escapeHtml(cleanPhone)}</b>\n\nPilih <b>NAMA</b>:`,
      {
        parse_mode: 'HTML',
        reply_to_message_id: ctx.message.message_id,
        ...buildNameKeyboard(subId)
      }
    );

    submission.promptMsgId = sentMsg.message_id;
  } catch (err) {
    console.error('Error handling photo message:', err);
  }
});

// ----------------- TEXT MESSAGE HANDLER (FOR WAITING INPUTS & BANNED NUMBERS) -----------------

bot.on('text', async (ctx, next) => {
  try {
    const text = (ctx.message.text || '').trim();
    // Do not intercept slash commands
    if (text.startsWith('/')) {
      return next();
    }

    const chatId = ctx.chat.id;
    const userId = String(ctx.from.id);
    const key = `${chatId}_${userId}`;
    const waiting = waitingInputs.get(key);

    if (!waiting) {
      // Check if message is a phone number without photo (Banned input)
      const cleanedDigits = text.replace(/[\s\+\-\.\(\)]/g, '');
      const isPureDigits = /^\d{9,16}$/.test(cleanedDigits);
      const phoneMatch = text.match(/(?:\+?62|08|8)\d{8,13}|\b\d{9,14}\b/);

      // Trigger if message is primarily a phone number
      if (isPureDigits || (phoneMatch && text.length <= 25 && text.split(/\s+/).length <= 3)) {
        const rawPhone = isPureDigits ? cleanedDigits : phoneMatch[0];
        const cleanPhone = formatPhoneNumber(rawPhone);
        if (cleanPhone) {
          const subId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const userName = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'User');
          const inputDate = formatWIBDate();
          const createdAt = formatWIBDateTime();

          const submission = {
            id: subId,
            chatId: ctx.chat.id,
            userId,
            userName,
            phoneNumber: cleanPhone,
            fileId: null,
            photoPath: '',
            inputDate,
            createdAt,
            status: 'banned',
            selectedName: null,
            selectedSet: null,
            selectedEmail: null,
            promptMsgId: null
          };

          pendingSubmissions.set(subId, submission);

          // Step 1: Pilihan Nama (clean with blank line space)
          const sentMsg = await ctx.reply(
            `Terdeteksi (Banned): <b>${escapeHtml(cleanPhone)}</b>\n\nPilih <b>NAMA</b>:`,
            {
              parse_mode: 'HTML',
              reply_to_message_id: ctx.message.message_id,
              ...buildNameKeyboard(subId)
            }
          );

          submission.promptMsgId = sentMsg.message_id;
          return;
        }
      }

      return next();
    }

    const sub = pendingSubmissions.get(waiting.subId);

    // 1. Delete user's text message in group to keep chat clean
    ctx.deleteMessage().catch(() => {});

    // 2. Delete the bot's prompt message ("Add Name", "Add Set", "Add Email")
    if (waiting.instructionMsgId) {
      ctx.telegram.deleteMessage(chatId, waiting.instructionMsgId).catch(() => {});
    }

    if (!sub) {
      waitingInputs.delete(key);
      return next();
    }

    if (waiting.type === 'name') {
      const formattedName = toTitleCase(text);
      db.setGlobalLastName(formattedName);
      sub.selectedName = formattedName;
      waitingInputs.delete(key);

      // Advance to Step 2: Set (with blank line spacing)
      await ctx.telegram.editMessageText(
        chatId,
        sub.promptMsgId,
        null,
        `Nomor: <b>${escapeHtml(sub.phoneNumber)}</b>\nNama: <b>${escapeHtml(sub.selectedName)}</b>\n\nPilih <b>SET</b>:`,
        {
          parse_mode: 'HTML',
          ...buildSetKeyboard(sub.id)
        }
      );
    } else if (waiting.type === 'set') {
      const formattedSet = formatSetDisplayName(text);
      db.setGlobalLastSet(formattedSet);
      sub.selectedSet = formattedSet;
      waitingInputs.delete(key);

      // Advance to Step 3: Email (with blank line spacing)
      await ctx.telegram.editMessageText(
        chatId,
        sub.promptMsgId,
        null,
        `Nomor: <b>${escapeHtml(sub.phoneNumber)}</b>\nNama: <b>${escapeHtml(sub.selectedName)}</b>\nSet: <b>${escapeHtml(sub.selectedSet)}</b>\n\nPilih <b>EMAIL</b>:`,
        {
          parse_mode: 'HTML',
          ...buildEmailKeyboard(sub.id, userId)
        }
      );
    } else if (waiting.type === 'email') {
      const formattedEmail = text.toLowerCase();
      db.setUserLastEmail(userId, formattedEmail);
      sub.selectedEmail = formattedEmail;
      waitingInputs.delete(key);

      // Finalize and save!
      await finalizeSubmission(ctx, sub);
    }
  } catch (err) {
    console.error('Error handling text input:', err);
    return next();
  }
});

// ----------------- CALLBACK QUERY HANDLERS -----------------

bot.on('callback_query', async (ctx) => {
  try {
    const data = ctx.callbackQuery.data || '';
    const userId = String(ctx.from.id);

    // Helper to safely answer callback queries without throwing on expired queries
    const safeAnswerCb = (text, alert = false) => ctx.answerCbQuery(text, { show_alert: alert }).catch(() => {});

    // Sender Protection: Only the user who sent the photo can click its buttons
    if (
      data.startsWith('sn:') ||
      data.startsWith('an:') ||
      data.startsWith('ss:') ||
      data.startsWith('nsm:') ||
      data.startsWith('nsa:') ||
      data.startsWith('ns_manual:') ||
      data.startsWith('back_set:') ||
      data.startsWith('se:') ||
      data.startsWith('ae:')
    ) {
      const parts = data.split(':');
      const subId = parts[1];
      const sub = pendingSubmissions.get(subId);
      if (!sub) {
        return safeAnswerCb('Data submission sudah selesai atau kedaluwarsa.');
      }
      if (sub.userId && sub.userId !== userId) {
        return safeAnswerCb('⚠️ Tombol ini khusus untuk pengirim foto tersebut.', true);
      }
    }

    // --- STEP 1: SELECT NAME ---
    if (data.startsWith('sn:')) {
      const [, subId, nameIdx] = data.split(':');
      const sub = pendingSubmissions.get(subId);
      if (!sub) return safeAnswerCb('Data submission sudah selesai atau kedaluwarsa.');

      const names = db.getSharedNames();
      const selectedName = names[parseInt(nameIdx, 10)];
      if (!selectedName) return safeAnswerCb('Nama tidak valid.');

      sub.selectedName = selectedName;
      db.setGlobalLastName(selectedName);
      await safeAnswerCb(`Nama: ${selectedName}`);

      // Advance to Step 2: Set (with blank line spacing)
      await ctx.editMessageText(
        `Nomor: <b>${escapeHtml(sub.phoneNumber)}</b>\nNama: <b>${escapeHtml(sub.selectedName)}</b>\n\nPilih <b>SET</b>:`,
        {
          parse_mode: 'HTML',
          ...buildSetKeyboard(sub.id)
        }
      );
    }

    // --- STEP 1: ADD NEW NAME ---
    else if (data.startsWith('an:')) {
      const [, subId] = data.split(':');
      const sub = pendingSubmissions.get(subId);
      if (!sub) return safeAnswerCb('Submission kedaluwarsa.');

      await safeAnswerCb();
      // Simple prompt text: "Add Name"
      const askMsg = await ctx.reply('Add Name', { parse_mode: 'HTML' });

      waitingInputs.set(`${ctx.chat.id}_${userId}`, {
        type: 'name',
        subId,
        promptMsgId: sub.promptMsgId,
        instructionMsgId: askMsg.message_id
      });
    }

    // --- STEP 2: SELECT SET ---
    else if (data.startsWith('ss:')) {
      const [, subId, setIdx] = data.split(':');
      const sub = pendingSubmissions.get(subId);
      if (!sub) return safeAnswerCb('Submission kedaluwarsa.');

      const sets = db.getSharedSets();
      const selectedSet = sets[parseInt(setIdx, 10)];
      if (!selectedSet) return safeAnswerCb('Set tidak valid.');

      sub.selectedSet = selectedSet;
      db.setGlobalLastSet(selectedSet);
      await safeAnswerCb(`Set: ${selectedSet}`);

      // Advance to Step 3: Email (with blank line spacing)
      await ctx.editMessageText(
        `Nomor: <b>${escapeHtml(sub.phoneNumber)}</b>\nNama: <b>${escapeHtml(sub.selectedName)}</b>\nSet: <b>${escapeHtml(sub.selectedSet)}</b>\n\nPilih <b>EMAIL</b>:`,
        {
          parse_mode: 'HTML',
          ...buildEmailKeyboard(sub.id, userId)
        }
      );
    }

    // --- STEP 2: NEW SET MENU ---
    else if (data.startsWith('nsm:')) {
      const [, subId] = data.split(':');
      const sub = pendingSubmissions.get(subId);
      if (!sub) return safeAnswerCb('Submission kedaluwarsa.');

      const currentLastSet = db.getGlobalLastSet() || `Set 1 - ${formatWIBDate()}`;
      const nextSuggestedSet = autoIncrementSet(currentLastSet);

      const buttons = [
        [Markup.button.callback(`⏩ ${nextSuggestedSet}`, `nsa:${subId}`)],
        [Markup.button.callback('✍️ Input Manual', `ns_manual:${subId}`)],
        [Markup.button.callback('⬅️ Kembali', `back_set:${subId}`)]
      ];

      await safeAnswerCb();
      await ctx.editMessageText(
        `Nomor: <b>${escapeHtml(sub.phoneNumber)}</b>\nNama: <b>${escapeHtml(sub.selectedName)}</b>\n\n<b>Pilih Cara Pembuatan Set Baru:</b>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard(buttons)
        }
      );
    }

    // --- STEP 2: AUTO-INCREMENT SET SELECTED ---
    else if (data.startsWith('nsa:')) {
      const [, subId] = data.split(':');
      const sub = pendingSubmissions.get(subId);
      if (!sub) return safeAnswerCb('Submission kedaluwarsa.');

      const currentLastSet = db.getGlobalLastSet() || `Set 1 - ${formatWIBDate()}`;
      const nextSuggestedSet = autoIncrementSet(currentLastSet);

      db.setGlobalLastSet(nextSuggestedSet);
      sub.selectedSet = nextSuggestedSet;
      await safeAnswerCb(`Set baru: ${nextSuggestedSet}`);

      // Advance to Step 3: Email (with blank line spacing)
      await ctx.editMessageText(
        `Nomor: <b>${escapeHtml(sub.phoneNumber)}</b>\nNama: <b>${escapeHtml(sub.selectedName)}</b>\nSet: <b>${escapeHtml(sub.selectedSet)}</b>\n\nPilih <b>EMAIL</b>:`,
        {
          parse_mode: 'HTML',
          ...buildEmailKeyboard(sub.id, userId)
        }
      );
    }

    // --- STEP 2: MANUAL INPUT SET ---
    else if (data.startsWith('ns_manual:')) {
      const [, subId] = data.split(':');
      const sub = pendingSubmissions.get(subId);
      if (!sub) return safeAnswerCb('Submission kedaluwarsa.');

      await safeAnswerCb();
      // Simple prompt text: "Add Set"
      const askMsg = await ctx.reply('Add Set', { parse_mode: 'HTML' });

      waitingInputs.set(`${ctx.chat.id}_${userId}`, {
        type: 'set',
        subId,
        promptMsgId: sub.promptMsgId,
        instructionMsgId: askMsg.message_id
      });
    }

    // --- STEP 2: BACK TO SET LIST ---
    else if (data.startsWith('back_set:')) {
      const [, subId] = data.split(':');
      const sub = pendingSubmissions.get(subId);
      if (!sub) return safeAnswerCb('Submission kedaluwarsa.');

      await safeAnswerCb();
      await ctx.editMessageText(
        `Nomor: <b>${escapeHtml(sub.phoneNumber)}</b>\nNama: <b>${escapeHtml(sub.selectedName)}</b>\n\nPilih <b>SET</b>:`,
        {
          parse_mode: 'HTML',
          ...buildSetKeyboard(sub.id)
        }
      );
    }

    // --- STEP 3: SELECT EMAIL ---
    else if (data.startsWith('se:')) {
      const [, subId, emailIdx] = data.split(':');
      const sub = pendingSubmissions.get(subId);
      if (!sub) return safeAnswerCb('Submission kedaluwarsa.');

      const emails = db.getSharedEmails(userId);
      const selectedEmail = emails[parseInt(emailIdx, 10)];
      if (!selectedEmail) return safeAnswerCb('Email tidak valid.');

      sub.selectedEmail = selectedEmail;
      db.setUserLastEmail(userId, selectedEmail);
      await safeAnswerCb(`Email: ${selectedEmail}`);

      // Finalize and save!
      await finalizeSubmission(ctx, sub);
    }

    // --- STEP 3: ADD NEW EMAIL ---
    else if (data.startsWith('ae:')) {
      const [, subId] = data.split(':');
      const sub = pendingSubmissions.get(subId);
      if (!sub) return safeAnswerCb('Submission kedaluwarsa.');

      await safeAnswerCb();
      // Simple prompt text: "Add Email"
      const askMsg = await ctx.reply('Add Email', { parse_mode: 'HTML' });

      waitingInputs.set(`${ctx.chat.id}_${userId}`, {
        type: 'email',
        subId,
        promptMsgId: sub.promptMsgId,
        instructionMsgId: askMsg.message_id
      });
    }

    // --- MENU: DATA ---
    else if (data === 'menu_data') {
      await showDataMenu(ctx);
    }

    // --- VIEW DATA FOR DATE ---
    else if (data.startsWith('vd:')) {
      const dateStr = data.substring(3);
      await showDataForDate(ctx, dateStr);
    }

    // --- MENU: REPORT ---
    else if (data === 'menu_report') {
      await showReportMenu(ctx);
    }

    // --- SEND REPORT FOR SINGLE SET ---
    else if (data.startsWith('s_rep:')) {
      const setIdx = parseInt(data.substring(6), 10);
      const sets = db.getDistinctSets();
      const targetSet = sets[setIdx];
      if (!targetSet) return safeAnswerCb('Set tidak ditemukan.');
      await safeAnswerCb(`Memproses report ${targetSet}...`);
      await sendSetReport(ctx, targetSet);
    }

    // --- SEND REPORT FOR ALL SETS ON A DATE ---
    else if (data.startsWith('s_all_rep:')) {
      const dateTag = data.substring(10);
      await safeAnswerCb(`Memproses semua set...`);
      await sendAllSetsReport(ctx, dateTag);
    }

    // --- BACK TO MAIN MENU ---
    else if (data === 'main_menu') {
      await safeAnswerCb();
      await ctx.editMessageText('<b>Bot Rekap Centang Biru</b>\n\nSilakan pilih menu:', {
        parse_mode: 'HTML',
        ...getMainKeyboard()
      });
    }

    else {
      await safeAnswerCb();
    }
  } catch (err) {
    console.error('Error handling callback query:', err);
    ctx.answerCbQuery('Terjadi kesalahan.').catch(() => {});
  }
});

// ----------------- FINALIZE SUBMISSION -----------------

async function finalizeSubmission(ctx, sub) {
  try {
    let localPhotoPath = '';
    if (sub.fileId) {
      localPhotoPath = await downloadTelegramPhoto(
        ctx.telegram,
        sub.fileId,
        sub.selectedSet,
        sub.phoneNumber
      );
    }

    db.addEntry({
      phoneNumber: sub.phoneNumber,
      name: sub.selectedName,
      email: sub.selectedEmail,
      setName: sub.selectedSet,
      photoPath: localPhotoPath,
      fileId: sub.fileId || '',
      inputDate: sub.inputDate,
      createdAt: sub.createdAt,
      userId: sub.userId,
      userName: sub.userName,
      status: sub.status || 'active'
    });

    // Clean format without emojis and with clean blank line space
    const statusTag = sub.status === 'banned' ? ' [Banned]' : '';
    const successText = [
      `<b>Tersimpan ke ${escapeHtml(sub.selectedSet)}${statusTag}</b>`,
      '',
      `Nama: ${escapeHtml(sub.selectedName)}`,
      `Nomor: ${escapeHtml(sub.phoneNumber)}`,
      `Waktu: ${escapeHtml(sub.createdAt)}`,
      `Email: ${escapeHtml(sub.selectedEmail)}`
    ].join('\n');

    await ctx.telegram.editMessageText(
      sub.chatId,
      sub.promptMsgId,
      null,
      successText,
      { parse_mode: 'HTML' }
    );

    pendingSubmissions.delete(sub.id);
  } catch (err) {
    console.error('Error finalizing submission:', err);
  }
}

// ----------------- DATA MENU & DETAILS -----------------

async function showDataMenu(ctx) {
  const dates = db.getDistinctInputDates();
  if (dates.length === 0) {
    await ctx.answerCbQuery('Belum ada data input tersimpan.').catch(() => {});
    return;
  }

  const buttons = dates.map(d => [
    Markup.button.callback(`📅 ${d}`, `vd:${d}`)
  ]);
  buttons.push([Markup.button.callback('⬅️ Menu Utama', 'main_menu')]);

  await ctx.answerCbQuery().catch(() => {});
  await ctx.editMessageText(
    '<b>Pilih Tanggal Pengerjaan/Input Data:</b>',
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    }
  );
}

async function showDataForDate(ctx, dateStr) {
  const entries = db.getEntriesByInputDate(dateStr);
  if (!entries || entries.length === 0) {
    await ctx.answerCbQuery('Data tidak ditemukan.').catch(() => {});
    return;
  }

  const totalNumbers = entries.length;
  const activeCount = entries.filter(e => e.status !== 'banned').length;
  const bannedCount = entries.filter(e => e.status === 'banned').length;

  const grouped = {};
  entries.forEach(e => {
    if (!grouped[e.set_name]) grouped[e.set_name] = [];
    grouped[e.set_name].push(e);
  });

  const totalSets = Object.keys(grouped).length;
  const startLangganan = addDaysToDateString(dateStr, 7);
  const totalCost = totalNumbers * config.pricePerNumber;

  const lines = [];

  for (const [rawSetName, items] of Object.entries(grouped)) {
    const formattedSetName = formatSetDisplayName(rawSetName, dateStr);
    lines.push(`<b>${escapeHtml(formattedSetName)}</b>`);
    lines.push('');
    const captionBody = buildSetReportCaption(items);
    lines.push(captionBody);
    lines.push('');
  }

  const statusSummary = (bannedCount > 0)
    ? `Total: ${totalNumbers} Nomor (${activeCount} Aktif, ${bannedCount} Banned) (${totalSets} Set)`
    : `Total: ${totalNumbers} Nomor (${totalSets} Set)`;

  lines.push(`${statusSummary} - Start Langganan di tanggal ${escapeHtml(startLangganan)} - ${formatRupiah(totalCost)}`);

  await ctx.answerCbQuery('Menampilkan data...').catch(() => {});
  // Send as a separate message like in report feature
  await ctx.reply(lines.join('\n'), {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    disable_web_page_preview: true
  });
}

// ----------------- REPORT MENU & ALBUM GENERATION -----------------

async function showReportMenu(ctx) {
  const sets = db.getDistinctSets();
  if (sets.length === 0) {
    await ctx.answerCbQuery('Belum ada Set data tersimpan.').catch(() => {});
    return;
  }

  const buttons = [];
  sets.forEach((setName, idx) => {
    buttons.push([Markup.button.callback(`📦 ${setName}`, `s_rep:${idx}`)]);
  });

  const dateMap = new Map();
  sets.forEach(setName => {
    const m = setName.match(/\d{1,2}\s+[A-Za-z]{3}\s+\d{4}/);
    if (m) {
      const dateTag = m[0];
      if (!dateMap.has(dateTag)) dateMap.set(dateTag, []);
      dateMap.get(dateTag).push(setName);
    }
  });

  for (const [dateTag, dateSets] of dateMap.entries()) {
    if (dateSets.length > 1) {
      buttons.push([Markup.button.callback(`🌐 Semua Set (${dateTag})`, `s_all_rep:${dateTag}`)]);
    }
  }

  buttons.push([Markup.button.callback('⬅️ Menu Utama', 'main_menu')]);

  await ctx.answerCbQuery().catch(() => {});
  await ctx.editMessageText(
    '<b>Pilih Set untuk Mengirim Album Report ke Chat:</b>',
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    }
  );
}

/**
 * Send Album Report for a specific Set to chat
 */
async function sendSetReport(ctx, setName) {
  const entries = db.getEntriesBySet(setName);
  if (!entries || entries.length === 0) {
    await ctx.reply(`⚠️ Data untuk set <b>${escapeHtml(setName)}</b> kosong.`, { parse_mode: 'HTML' });
    return;
  }

  const caption = buildSetReportCaption(entries);
  const entriesWithPhoto = entries.filter(e => Boolean(e.file_id));

  // If no photos at all in this set (e.g. all entries are banned without photos)
  if (entriesWithPhoto.length === 0) {
    await ctx.reply(`<b>${escapeHtml(setName)}</b>\n\n${caption}`, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      disable_web_page_preview: true
    });
    return;
  }

  // If only 1 photo: sendPhoto
  if (entriesWithPhoto.length === 1) {
    const entry = entriesWithPhoto[0];
    await ctx.telegram.sendPhoto(ctx.chat.id, entry.file_id, {
      caption
    });
    return;
  }

  // Telegram MediaGroup max 10 photos per group
  const chunkSize = 10;
  for (let i = 0; i < entriesWithPhoto.length; i += chunkSize) {
    const chunk = entriesWithPhoto.slice(i, i + chunkSize);
    const media = chunk.map((e, idx) => ({
      type: 'photo',
      media: e.file_id,
      caption: (i === 0 && idx === 0) ? caption : undefined
    }));

    await ctx.telegram.sendMediaGroup(ctx.chat.id, media);
    if (i + chunkSize < entriesWithPhoto.length) {
      await new Promise(r => setTimeout(r, 600));
    }
  }
}

/**
 * Send Report for all sets matching a date tag
 */
async function sendAllSetsReport(ctx, dateTag) {
  const sets = db.getDistinctSets().filter(s => s.includes(dateTag));
  if (sets.length === 0) {
    await ctx.reply(`⚠️ Tidak ada set ditemukan untuk tanggal ${escapeHtml(dateTag)}.`);
    return;
  }

  for (const setName of sets) {
    await sendSetReport(ctx, setName);
    await new Promise(r => setTimeout(r, 1000));
  }
}

// ----------------- STARTUP -----------------

export async function startApp() {
  console.log('🚀 Menjalankan Bot Rekap Centang Biru...');
  initCron(bot);

  if (config.botToken && config.botToken !== 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
    // Set official Telegram menu commands
    bot.telegram.setMyCommands([
      { command: 'start', description: 'Mulai / Buka Menu' },
      { command: 'data', description: 'Lihat Data' },
      { command: 'report', description: 'Kirim Report Album' },
      { command: 'banned', description: 'Tandai Banned (/banned nomor)' },
      { command: 'aktif', description: 'Tandai Aktif/Unban (/aktif nomor)' }
    ]).catch(() => {});

    bot.launch(() => {
      console.log('✅ Bot Telegram berhasil berjalan dan siap menerima pesan!');
    }).catch(err => {
      console.error('❌ Gagal menjalankan Bot Telegram:', err.message);
    });
  } else {
    console.log('ℹ️ Bot siap. Masukkan BOT_TOKEN di file .env lalu jalankan "npm start".');
  }
}

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// If executed directly
if (process.argv[1] && process.argv[1].endsWith('bot.js')) {
  startApp();
}
