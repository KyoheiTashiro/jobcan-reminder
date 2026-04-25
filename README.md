# jobcan-reminder

ジョブカンの打刻忘れをLINEで通知するローカル常駐ツール。指定時刻にジョブカンの勤務状態を確認し、未打刻ならLINE Messaging APIでリマインダーを送信する。macOSの`launchd`でスケジュール実行する。

## 機能

- **出勤打刻チェック**: 始業15分前に勤務状態を確認。`勤務外`ならLINE通知。
- **退勤打刻チェック**: 終業15分前に勤務状態を確認。`勤務中`ならLINE通知。
- **営業日判定**: 曜日設定 + 日本の祝日API (`holidays-jp.github.io`) + 追加休日設定。
- **祝日キャッシュ**: 当日分のみ`session/holidays-cache.json`にキャッシュ。API障害時はキャッシュでフォールバック。
- **セッション管理**: Playwrightでブラウザログイン → `session/state.json`に保存。以降はヘッドレスで再利用。
- **セッション切れ検知**: ログインページへのリダイレクトを検出 → 再ログイン要求をLINE通知。
- **時刻窓判定**: スケジュール時刻から`staleWindowMinutes`(既定60分)以内のみ実行。Macスリープ復帰時の遅延実行を抑制。
- **エラーリトライ**: チェック失敗時に60秒後に1回リトライ。
- **ログ**: `logs/jobcan-reminder.log`にJST形式で記録。

## 必要環境

- macOS
- Node.js (`/usr/local/bin/node`想定)
- LINE Messaging APIチャネル(アクセストークン + ユーザーID)
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

LINE認証情報を設定:

```
LINE_CHANNEL_ACCESS_TOKEN=<チャネルアクセストークン>
LINE_USER_ID=<送信先ユーザーID>
```

### 3. スケジュール設定

`config/schedule.json`:

| キー | 説明 | 既定 |
|---|---|---|
| `workDays` | 稼働曜日配列 (0=日, 1=月, ..., 6=土) | `[1,2,3,4,5]` |
| `punchInReminder` | 出勤チェック時刻 `HH:MM` | `10:45` |
| `punchOutReminder` | 退勤チェック時刻 `HH:MM` | `19:45` |
| `additionalHolidays` | 追加休日 `YYYY-MM-DD`配列 | `[]` |
| `staleWindowMinutes` | 有効時刻窓(分) | `60` |

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

`com.jobcan-reminder.plist`の`StartCalendarInterval`(既定: 10:45 / 19:45)と`config/schedule.json`の`punchInReminder`/`punchOutReminder`を両方揃えて編集 → `npm run setup`で再ロード。

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

スケジュール時刻 ≤ 現在時刻 < スケジュール時刻 + `staleWindowMinutes` のときのみ実行。範囲外はスキップ(スリープ復帰対策)。

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
    ├── line.js                  # LINE通知送信
    └── logger.js                # ログユーティリティ
```

## トラブルシュート

- **セッション切れ通知が届いた** → `npm run login`再実行。
- **チェックが走らない** → `logs/launchd-stderr.log`確認 → `launchctl list | grep jobcan`でロード状況確認。
- **Macスリープで時刻ズレ** → `staleWindowMinutes`延長。ただし延長しすぎると遅延通知リスク。
- **祝日APIダウン** → 当日のキャッシュがあれば継続、なければ曜日のみで判定。

## アンインストール

```bash
launchctl unload ~/Library/LaunchAgents/com.jobcan-reminder.plist
rm ~/Library/LaunchAgents/com.jobcan-reminder.plist
```
