const logger = require('./logger');

async function sendLineMessage(text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const userId = process.env.LINE_USER_ID;

  if (!token || !userId) {
    logger.error('LINE_CHANNEL_ACCESS_TOKEN or LINE_USER_ID is not set');
    return false;
  }

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error(`LINE API error: ${response.status} ${body}`);
    return false;
  }

  logger.info(`LINE message sent: ${text}`);
  return true;
}

module.exports = { sendLineMessage };
