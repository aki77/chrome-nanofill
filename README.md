# nanofill

Chrome 拡張機能。ブラウザに内蔵された Gemini Nano (Prompt API) を使って、
**現在フォーカスが当たっているフォーム入力欄** に、周辺のラベル・placeholder・
他フィールド・ページタイトルなどの文脈を踏まえた "それっぽい" ダミー値を入れます。

## 必要環境

- Chrome 138 以上
- `chrome://on-device-internals` で **Optimization Guide On Device Model** が利用可能であること
- 詳細: [Built-in AI / Prompt API for Extensions](https://developer.chrome.com/docs/extensions/ai/prompt-api)

## セットアップ

```bash
pnpm install
pnpm build       # dist/ にビルド成果物を出力
# 開発時: pnpm dev (watch mode)
```

## インストール (unpacked)

1. `pnpm build` を実行
2. Chrome で `chrome://extensions` を開く
3. **デベロッパーモード** をオン
4. **パッケージ化されていない拡張機能を読み込む** で `dist/` ディレクトリを選択

## 使い方

1. 任意のページのフォームをクリックしてフォーカスを当てる
2. ツールバーの **Nanofill** アイコンをクリック
3. ポップアップで **Fill focused field** をクリック
4. フォーカスされていた入力欄にダミー値が入る

対応する要素:
- `<input>` (text / search / email / url / tel / password / number / date / etc.)
- `<textarea>`
- `<select>` (オプションラベルからモデルが1つを選ぶ)

## 構成

```
src/
├── content/content.ts              # フォーカス追跡 + 文脈収集 + DOM 反映 + Prompt API 呼び出し
├── popup/                          # 状態表示 + 実行ボタン
└── lib/
    ├── context.ts                  # フォーカス検知 / FormContext 構築
    ├── prompt.ts                   # LanguageModel ラッパー (Structured Output)
    └── types.ts                    # メッセージ型
```

Prompt API の呼び出しは content script 内で行うため、メッセージ往復は popup → content の 1 往復だけです。 service worker は使っていません。

## 既知の制限

- **同一オリジン iframe のみ対応**: クロスオリジン iframe 内のフィールドにフォーカスがある場合、ポップアップを開くタイミングで親フレームと子フレームの間でフォーカス情報を同期できないため、フィルに失敗することがあります。フィルが想定どおり動かないときは、対象フィールドを再度クリックしてからポップアップを開き直してください。
- 生成された値は AI の出力なので、フィールドの厳密なバリデーションを必ずしも満たさない場合があります。
- 初回利用時はモデルダウンロード (~数GB) が完了するまで生成は待たされます。
