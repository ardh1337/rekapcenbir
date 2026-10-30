import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env') });

export const config = {
  rootDir,
  botToken: process.env.BOT_TOKEN || '',
  groupId: process.env.GROUP_ID ? String(process.env.GROUP_ID).trim() : '',
  pricePerNumber: Number(process.env.PRICE_PER_NUMBER) || 125000,
  timezone: process.env.TIMEZONE || 'Asia/Jakarta',
  dbPath: path.join(rootDir, 'data', 'database.sqlite'),
  photosDir: path.join(rootDir, 'storage', 'photos'),
  reportsDir: path.join(rootDir, 'storage', 'reports'),
};

