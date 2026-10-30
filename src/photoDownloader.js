import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { config } from './config.js';

/**
 * Download photo from Telegram server and save locally
 * Returns the absolute local file path
 */
export async function downloadTelegramPhoto(telegram, fileId, setName, phoneNumber) {
  try {
    const fileLink = await telegram.getFileLink(fileId);
    
    // Sanitize setName for folder name
    const safeSetName = (setName || 'General')
      .replace(/[\\/:*?"<>|]/g, '_')
      .trim();

    const targetFolder = path.join(config.photosDir, safeSetName);
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    const timestamp = Date.now();
    const safePhone = String(phoneNumber).replace(/[^0-9]/g, '');
    const filename = `${safePhone}_${timestamp}.jpg`;
    const destPath = path.join(targetFolder, filename);

    const response = await fetch(fileLink.href);
    if (!response.ok) {
      throw new Error(`Failed to fetch photo stream: ${response.statusText}`);
    }

    const fileStream = fs.createWriteStream(destPath);
    await pipeline(response.body, fileStream);

    return destPath;
  } catch (err) {
    console.error('[Downloader] Error downloading photo:', err);
    return '';
  }
}

