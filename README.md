# nanofill

Chrome 拡張機能。ブラウザに内蔵された Gemini Nano (Prompt API) を使って、
**右クリックしたフォーム入力欄** に、周辺のラベル・placeholder・
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

1. 任意のページのフォーム要素 (input / textarea / select) を **右クリック**
2. コンテキストメニューの **Fill with Nanofill** をクリック
3. クリックした入力欄にダミー値が入る

対応する要素:
- `<input>` (text / search / email / url / tel / password / number / date / etc.)
- `<textarea>` (高さに応じた長さのダミー文章を生成 — 詳細は下記)
- `<select>` (オプションラベルからモデルが1つを選ぶ)

### textarea の長さ自動推定

`<textarea>` に対しては、`rows` 属性または `clientHeight / line-height` から実効行数を推定し、
3 段階の長さヒントでモデルへ伝えます:

| 実効行数 | lengthHint | 生成量 |
|---------|-----------|------|
| 1〜2 行 | short | 1〜2 文 |
| 3〜6 行 | medium | 1 段落 (2〜4 文) |
| 7 行以上 | long | 複数段落 (`\n\n` 区切り) |

## 構成

```
src/
├── background/background.ts        # service worker: contextMenu 管理 + fill トリガー
├── content/content.ts              # 右クリック追跡 + 文脈収集 + DOM 反映 + Prompt API 呼び出し
└── lib/
    ├── context.ts                  # フォーカス / 右クリック要素検知 / FormContext 構築
    ├── prompt.ts                   # LanguageModel ラッパー (Structured Output)
    └── types.ts                    # メッセージ型
```

右クリック → background (service worker) が `chrome.contextMenus.onClicked` を受け取り、
`frameId` を指定して該当フレームの content script へメッセージを送ります。
Prompt API の呼び出しは content script 内で行います。

## 既知の制限

- 生成された値は AI の出力なので、フィールドの厳密なバリデーションを必ずしも満たさない場合があります。
- Chrome 拡張が content script を注入できないページ (`chrome://` など) では動作しません。
- 初回利用時はモデルダウンロード (~数GB) が完了するまで生成は待たされます。
