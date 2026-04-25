const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const CACHE_FILE = path.join(__dirname, '..', 'session', 'holidays-cache.json');
const HOLIDAYS_API = 'https://holidays-jp.github.io/api/v1/date.json';
const SCHEDULE_FILE = path.join(__dirname, '..', 'config', 'schedule.json');

function loadSchedule() {
  return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf-8'));
}

async function fetchHolidays() {
  // Return cached data if fetched today
  if (fs.existsSync(CACHE_FILE)) {
    const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    const today = new Date().toISOString().slice(0, 10);
    if (cache.fetchedAt === today) {
      return cache.holidays;
    }
  }

  try {
    const response = await fetch(HOLIDAYS_API);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const holidays = await response.json();
    const today = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ fetchedAt: today, holidays }));
    return holidays;
  } catch (err) {
    logger.warn(`Failed to fetch holidays: ${err.message}. Using cache or weekend-only check.`);
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')).holidays;
    }
    return {};
  }
}

async function isWorkDay() {
  const now = new Date();
  const day = now.getDay();
  const schedule = loadSchedule();

  // Check configured work days (0=Sun, 1=Mon, ..., 6=Sat)
  if (!schedule.workDays.includes(day)) {
    logger.info(`Not a work day (day of week: ${day})`);
    return false;
  }

  const dateStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }); // YYYY-MM-DD

  // Check additional holidays from config
  if (schedule.additionalHolidays.includes(dateStr)) {
    logger.info(`Additional holiday: ${dateStr}`);
    return false;
  }

  // Check Japanese public holidays
  const holidays = await fetchHolidays();
  if (holidays[dateStr]) {
    logger.info(`Public holiday: ${holidays[dateStr]} (${dateStr})`);
    return false;
  }

  return true;
}

module.exports = { isWorkDay, loadSchedule };
