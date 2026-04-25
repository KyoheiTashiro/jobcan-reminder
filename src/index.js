require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const logger = require('./logger');
const { isWorkDay, loadSchedule } = require('./holidays');
const { checkPunchStatus, hasSession } = require('./jobcan');
const { sendSlackMessage } = require('./slack');

function parseArgs() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--check-type');
  if (idx === -1 || !args[idx + 1]) {
    console.error('Usage: node src/index.js --check-type punch_in|punch_out');
    process.exit(1);
  }
  const checkType = args[idx + 1];
  if (checkType !== 'punch_in' && checkType !== 'punch_out') {
    console.error('check-type must be "punch_in" or "punch_out"');
    process.exit(1);
  }
  return checkType;
}

function buildReminderMessage(checkType, label) {
  const phase = checkType === 'punch_in' ? '始業' : '終業';
  return `🔔 ${label}打刻を忘れていませんか？\n${phase}まで15分です。ジョブカンで打刻してください。`;
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function isWithinWindow(checkType) {
  const schedule = loadSchedule();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const window = checkType === 'punch_in' ? schedule.punchInWindow : schedule.punchOutWindow;
  const start = toMinutes(window.start);
  const end = toMinutes(window.end);

  return nowMinutes >= start && nowMinutes < end;
}

async function main() {
  const checkType = parseArgs();
  const label = checkType === 'punch_in' ? '出勤' : '退勤';

  logger.info(`--- ${label}打刻チェック開始 ---`);

  // Check if within valid time window (Mac sleep recovery)
  if (!isWithinWindow(checkType)) {
    logger.info('Scheduled time window has passed. Skipping check.');
    return;
  }

  // Check if today is a work day
  if (!(await isWorkDay())) {
    logger.info('Today is not a work day. Skipping check.');
    return;
  }

  // Check session exists
  if (!hasSession()) {
    logger.error('No session file. Run: node scripts/login.js');
    await sendSlackMessage(
      '⚠ ジョブカンのセッションファイルがありません。\nnode scripts/login.js を実行してログインしてください。'
    );
    return;
  }

  let result = await checkPunchStatus(checkType);

  // Retry once on transient error (60s wait). session_expired は再ログイン要のため対象外。
  if (result.status === 'error') {
    logger.info('Transient error. Retrying in 60 seconds...');
    await new Promise((resolve) => setTimeout(resolve, 60000));
    result = await checkPunchStatus(checkType);
  }

  if (result.error) {
    logger.error(result.error);
    if (result.status === 'session_expired') {
      await sendSlackMessage(
        `⚠ ジョブカンのセッションが切れています。\nnode scripts/login.js を実行して再ログインしてください。`
      );
    } else {
      await sendSlackMessage(`⚠ ${result.error}`);
    }
    return;
  }

  if (result.needsReminder) {
    await sendSlackMessage(buildReminderMessage(checkType, label));
    logger.info(`Reminder sent: ${label} punch needed (status: ${result.status})`);
  } else {
    logger.info(`No reminder needed (status: ${result.status})`);
  }

  logger.info(`--- ${label}打刻チェック完了 ---`);
}

main().catch((err) => {
  logger.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
