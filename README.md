# jobcan-reminder

ジョブカンの打刻忘れをSlackで通知するローカル常駐ツール。

指定時刻にジョブカンの勤務状態を確認し、未打刻ならSlack Incoming Webhookでリマインダーを送信する。

macOSの`launchd`でスケジュール実行する。

## 機能

- **出勤打刻チェック**: 朝10:00〜10:55の間、5分おきに勤務状態を確認。`勤務外`ならSlack通知(打刻するまで鳴り続ける)。
- **退勤打刻チェック**: 夜19:00〜19:55の間、5分おきに勤務状態を確認。`勤務中`ならSlack通知。
- **営業日判定**: 曜日設定 + 日本の祝日API (`holidays-jp.github.io`) + 追加休日設定。
- **祝日キャッシュ**: 当日分のみ`session/holidays-cache.json`にキャッシュ。API障害時はキャッシュでフォールバック。
- **セッション管理**: Playwrightでブラウザログイン → `session/state.json`に保存。以降はヘッドレスで再利用。
- **セッション切れ検知**: ログインページへのリダイレクトを検出 → 再ログイン要求をSlack通知。
- **時刻窓判定**: 設定したウィンドウ(`punchInWindow`/`punchOutWindow`)内のみ実行。範囲外起動はスキップ。
- **エラーリトライ**: チェック失敗時に60秒後に1回リトライ。
- **ログ**: `logs/jobcan-reminder.log`にJST形式で記録。

## 必要環境

- macOS
- Node.js (`/usr/local/bin/node`想定)
- Slack Bot Token (`xoxb-...` / scope: `chat:write`)
- ジョブカンアカウント(Googleログイン対応)

## セットアップ

### 1. 依存インストール

```bash
npm install
npx playwright install chromium
```

### 2. `.env`作成

`.env.example`をコピー:

```bash
cp .env.example .env
```

Slack Bot Token + 送信先チャネルを設定:

```
SLACK_BOT_TOKEN=xoxb-XXXXXXXXXXXX-XXXXXXXXXXXX-XXXXXXXXXXXXXXXXXXXXXXXX
SLACK_CHANNEL=#general
```

`SLACK_CHANNEL`は`#channel-name` or チャネルID(`C0123ABCD`)指定可。

Bot Token発行手順:
1. https://api.slack.com/apps → `Create New App` → `From scratch`
2. `OAuth & Permissions` → Bot Token Scopes に `chat:write` 追加
3. `Install to Workspace` → `Bot User OAuth Token` (`xoxb-...`) コピー
4. 送信先チャネルでBot招待: `/invite @<bot名>`

### 3. スケジュール設定

`config/schedule.json`:

| キー | 説明 | 既定 |
|---|---|---|
| `workDays` | 稼働曜日配列 (0=日, 1=月, ..., 6=土) | `[1,2,3,4,5]` |
| `punchInWindow` | 出勤チェック時刻窓 `{start, end}` (HH:MM, end排他) | `{"start":"10:00","end":"11:00"}` |
| `punchOutWindow` | 退勤チェック時刻窓 `{start, end}` | `{"start":"19:00","end":"20:00"}` |
| `intervalMinutes` | チェック間隔(分) — plistの起動間隔と整合させる | `5` |
| `additionalHolidays` | 追加休日 `YYYY-MM-DD`配列 | `[]` |

### 4. 初回ログイン

```bash
npm run login
```

ブラウザが開く → Googleアカウントでジョブカンログイン → ダッシュボード到達で`session/state.json`自動保存 → ブラウザ自動クローズ。

### 5. launchd登録

```bash
npm run setup
```

`com.jobcan-reminder.plist`を`~/Library/LaunchAgents/`にコピーし`launchctl load`。

確認:

```bash
launchctl list | grep jobcan
```

## 手動実行

```bash
npm run check:in    # 出勤チェック
npm run check:out   # 退勤チェック
```

## スケジュール変更

時刻窓・間隔を変える場合は2ファイルを揃えて編集 → `npm run setup`で再ロード:
- `com.jobcan-reminder.plist`の`StartCalendarInterval` (各起動時刻を列挙、既定: 10:00〜10:55 / 19:00〜19:55 を5分刻み)
- `config/schedule.json`の`punchInWindow`/`punchOutWindow`/`intervalMinutes`

## 判定ロジック

### 勤務状態判定 (`src/jobcan.js`)

ジョブカン従業員ページ(`https://ssl.jobcan.jp/employee`)の`#working_status`要素を取得:

- `check-type=punch_in` + 状態`勤務外` → 未打刻 → 通知
- `check-type=punch_out` + 状態`勤務中` → 未打刻 → 通知
- それ以外 → 通知なし

URLが`id.jobcan.jp`または`accounts.google.com`にリダイレクト → セッション切れ扱い。

### 営業日判定 (`src/holidays.js`)

以下のいずれかに該当なら休日扱い(スキップ):
1. `schedule.workDays`に含まれない曜日
2. `schedule.additionalHolidays`に含まれる日付
3. 日本の祝日API (`holidays-jp.github.io/api/v1/date.json`) に該当

### 時刻窓判定 (`src/index.js`)

`window.start ≤ 現在時刻 < window.end` のときのみ実行。範囲外起動(スリープ復帰や手動起動)はスキップ。

### 実行分岐 (`scripts/run-check.sh`)

現在時刻の`HH` < 15 → `punch_in`、それ以外 → `punch_out`。launchdから呼ばれる単一エントリ。

## ディレクトリ構成

```
.
├── com.jobcan-reminder.plist   # launchd定義
├── config/schedule.json         # スケジュール設定
├── logs/                        # 実行ログ + launchd stdout/stderr
├── scripts/
│   ├── login.js                 # 初回ログイン (Playwright有頭)
│   ├── run-check.sh             # launchd実行エントリ
│   └── setup-launchd.sh         # LaunchAgent登録
├── session/
│   ├── state.json               # Playwrightセッション (gitignore)
│   └── holidays-cache.json      # 祝日APIキャッシュ
└── src/
    ├── index.js                 # メインエントリ
    ├── jobcan.js                # ジョブカン状態チェック
    ├── holidays.js              # 営業日判定
    ├── slack.js                 # Slack通知送信
    └── logger.js                # ログユーティリティ
```

## トラブルシュート

- **セッション切れ通知が届いた** → `npm run login`再実行。
- **チェックが走らない** → `logs/launchd-stderr.log`確認 → `launchctl list | grep jobcan`でロード状況確認。
- **Macスリープで時刻ズレ** → ウィンドウ(`punchInWindow.end`等)を延長。延長しすぎると深夜通知リスク。
- **祝日APIダウン** → 当日のキャッシュがあれば継続、なければ曜日のみで判定。

## アンインストール

```bash
launchctl unload ~/Library/LaunchAgents/com.jobcan-reminder.plist
rm ~/Library/LaunchAgents/com.jobcan-reminder.plist
```
