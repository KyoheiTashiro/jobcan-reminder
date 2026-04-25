const logger = require('./logger');

async function sendSlackMessage(text) {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL;

  if (!token || !channel) {
    logger.error('SLACK_BOT_TOKEN or SLACK_CHANNEL is not set');
    return false;
  }

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ channel, text }),
  });

  const data = await response.json();
  if (!data.ok) {
    logger.error(`Slack API error: ${data.error}`);
    return false;
  }

  logger.info(`Slack message sent to ${channel}: ${text}`);
  return true;
}

module.exports = { sendSlackMessage };
