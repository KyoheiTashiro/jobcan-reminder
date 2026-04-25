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

function isWithinWindow(checkType) {
  const schedule = loadSchedule();
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const nowMinutes = hours * 60 + minutes;

  const timeStr = checkType === 'punch_in' ? schedule.punchInReminder : schedule.punchOutReminder;
  const [h, m] = timeStr.split(':').map(Number);
  const scheduledMinutes = h * 60 + m;

  const diff = nowMinutes - scheduledMinutes;
  return diff >= 0 && diff < schedule.staleWindowMinutes;
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

  // Check punch status
  const result = await checkPunchStatus(checkType);

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
    const message =
      checkType === 'punch_in'
        ? `🔔 ${label}打刻を忘れていませんか？\n始業まで15分です。ジョブカンで打刻してください。`
        : `🔔 ${label}打刻を忘れていませんか？\n終業まで15分です。ジョブカンで打刻してください。`;
    await sendSlackMessage(message);
    logger.info(`Reminder sent: ${label} punch needed (status: ${result.status})`);
  } else {
    logger.info(`No reminder needed (status: ${result.status})`);
  }

  // Retry once on error
  if (result.status === 'error') {
    logger.info('Retrying in 60 seconds...');
    await new Promise((resolve) => setTimeout(resolve, 60000));
    const retry = await checkPunchStatus(checkType);
    if (retry.error) {
      await sendSlackMessage(`⚠ ジョブカンチェック再試行も失敗しました: ${retry.error}`);
    } else if (retry.needsReminder) {
      const message =
        checkType === 'punch_in'
          ? `🔔 ${label}打刻を忘れていませんか？\n始業まで15分です。ジョブカンで打刻してください。`
          : `🔔 ${label}打刻を忘れていませんか？\n終業まで15分です。ジョブカンで打刻してください。`;
      await sendSlackMessage(message);
    }
  }

  logger.info(`--- ${label}打刻チェック完了 ---`);
}

main().catch((err) => {
  logger.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
