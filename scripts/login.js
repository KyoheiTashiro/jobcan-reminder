const { chromium } = require('playwright');
const path = require('path');

const SESSION_FILE = path.join(__dirname, '..', 'session', 'state.json');
const LOGIN_URL = 'https://id.jobcan.jp/users/sign_in?app_key=atd';
const DASHBOARD_URL_PATTERN = /ssl\.jobcan\.jp\/employee/;

async function main() {
  console.log('=== Jobcan Login ===');
  console.log('ブラウザが開きます。Googleアカウントでログインしてください。');
  console.log('ダッシュボードに到達したら自動でセッションが保存されます。\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(LOGIN_URL);

  // Wait for the user to complete login and reach the dashboard
  console.log('ログインを待機中...');
  await page.waitForURL(DASHBOARD_URL_PATTERN, { timeout: 300000 }); // 5 minute timeout

  // Save session state
  await context.storageState({ path: SESSION_FILE });
  console.log(`\nセッションが保存されました: ${SESSION_FILE}`);
  console.log('ブラウザを閉じます。');

  await browser.close();
  console.log('完了！今後は自動でチェックが実行されます。');
}

main().catch((err) => {
  console.error('Login failed:', err.message);
  process.exit(1);
});
