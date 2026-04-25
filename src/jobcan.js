const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const SESSION_FILE = path.join(__dirname, '..', 'session', 'state.json');
const EMPLOYEE_URL = 'https://ssl.jobcan.jp/employee';
const LOGIN_URL_PATTERN = /id\.jobcan\.jp|accounts\.google\.com/;

function hasSession() {
  return fs.existsSync(SESSION_FILE);
}

/**
 * Check the current punch status on Jobcan.
 * @param {'punch_in' | 'punch_out'} checkType
 * @returns {{ needsReminder: boolean, status: string, error?: string }}
 */
async function checkPunchStatus(checkType) {
  if (!hasSession()) {
    return {
      needsReminder: false,
      status: 'no_session',
      error: 'セッションファイルがありません。node scripts/login.js を実行してください。',
    };
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: SESSION_FILE });
    const page = await context.newPage();

    await page.goto(EMPLOYEE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Check if redirected to login page (session expired)
    const currentUrl = page.url();
    if (LOGIN_URL_PATTERN.test(currentUrl)) {
      logger.warn('Session expired - redirected to login page');
      return {
        needsReminder: false,
        status: 'session_expired',
        error: 'ジョブカンのセッションが切れています。node scripts/login.js を実行して再ログインしてください。',
      };
    }

    // Wait for the working status element
    const statusEl = await page.waitForSelector('#working_status', { timeout: 15000 });
    const statusText = (await statusEl.textContent()).trim();

    logger.info(`Jobcan status: "${statusText}"`);

    await browser.close();

    if (checkType === 'punch_in') {
      // If status is "勤務外", the user has not punched in
      if (statusText.includes('勤務外')) {
        return { needsReminder: true, status: statusText };
      }
      return { needsReminder: false, status: statusText };
    }

    if (checkType === 'punch_out') {
      // If status is "勤務中", the user has not punched out
      if (statusText.includes('勤務中')) {
        return { needsReminder: true, status: statusText };
      }
      return { needsReminder: false, status: statusText };
    }

    return { needsReminder: false, status: statusText };
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    logger.error(`Jobcan check failed: ${err.message}`);
    return {
      needsReminder: false,
      status: 'error',
      error: `ジョブカンのチェックに失敗しました: ${err.message}`,
    };
  }
}

module.exports = { checkPunchStatus, hasSession };
