import cron from 'node-cron';
import { config } from './config.js';
import * as db from './database.js';
import {
  formatWIBDate,
  addDaysToDateString,
  formatRupiah,
  getWIBNow,
  escapeHtml
} from './utils.js';
import { tgEmoji } from './emojis.js';

/**
 * Check if there is data scheduled for subscription tomorrow (H-1 reminder)
 * and send notification to the group.
 */
export async function checkAndSendReminder(bot, slotName = 'manual') {
  try {
    const todayWIB = getWIBNow();
    const todayStr = formatWIBDate(todayWIB);
    
    // Tomorrow is H (Start Langganan Date)
    const tomorrowStr = addDaysToDateString(todayStr, 1);
    
    // Target input date is 7 days before tomorrow (which is 6 days before today)
    const d = new Date(todayWIB);
    d.setDate(d.getDate() - 6);
    const targetInputDate = formatWIBDate(d);

    const reminderKey = `${todayStr}_${slotName}_for_${targetInputDate}`;
    if (db.isReminderSent(reminderKey)) {
      console.log(`[Cron] Reminder ${reminderKey} already sent.`);
      return;
    }

    const entries = db.getEntriesByInputDate(targetInputDate);
    if (!entries || entries.length === 0) {
      console.log(`[Cron] No entries found for input date ${targetInputDate}. No reminder needed.`);
      return;
    }

    // Determine target group chat ID
    const targetChatId = config.groupId || db.getGlobalSetting('active_group_id', '');
    if (!targetChatId) {
      console.warn(`[Cron] Cannot send reminder: No GROUP_ID configured and no active_group_id detected yet.`);
      return;
    }

    const totalNumbers = entries.length;
    const activeCount = entries.filter(e => e.status !== 'banned').length;
    const bannedCount = entries.filter(e => e.status === 'banned').length;
    const uniqueSets = new Set(entries.map(e => e.set_name));
    const totalSets = uniqueSets.size;
    const pricePerNum = config.pricePerNumber;
    const totalCost = totalNumbers * pricePerNum;

    const bell = tgEmoji('bell', '🔔');
    const chart = tgEmoji('chart', '📊');
    const money = tgEmoji('receipt', '💰');

    const statusDetail = bannedCount > 0 ? ` (${activeCount} Aktif, ${bannedCount} Banned)` : '';

    const message = [
      `${bell} <b>PENGINGAT (H-1 LANGGANAN)</b> ${bell}`,
      '',
      `Besok (${tomorrowStr}) ada jadwal mulai langganan untuk data input ${targetInputDate}!`,
      `${chart} Total: ${totalNumbers} Nomor${statusDetail} (${totalSets} Set)`,
      `${money} Total Biaya: ${totalNumbers} x ${formatRupiah(pricePerNum)} = <b>${formatRupiah(totalCost)}</b>`
    ].join('\n');

    await bot.telegram.sendMessage(targetChatId, message, { parse_mode: 'HTML' });
    db.markReminderSent(reminderKey);
    console.log(`[Cron] Reminder successfully sent to ${targetChatId} for ${targetInputDate} (${slotName})`);
  } catch (err) {
    console.error(`[Cron] Error checking/sending reminder:`, err);
  }
}

/**
 * Start scheduled cron jobs at 12:00 WIB and 20:00 WIB
 */
export function initCron(bot) {
  console.log(`[Cron] Initializing reminder scheduler (12:00 & 20:00 WIB)...`);

  // 12:00 WIB
  cron.schedule('0 12 * * *', () => {
    console.log('[Cron] Triggering 12:00 WIB reminder check...');
    checkAndSendReminder(bot, '12:00');
  }, {
    timezone: config.timezone
  });

  // 20:00 WIB
  cron.schedule('0 20 * * *', () => {
    console.log('[Cron] Triggering 20:00 WIB reminder check...');
    checkAndSendReminder(bot, '20:00');
  }, {
    timezone: config.timezone
  });
}
