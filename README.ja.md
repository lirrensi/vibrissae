# Vibrissae

ごちゃごちゃなしのP2Pビデオ通話。

---

## 今すぐ試す → [lirrensi.github.io/vibrissae](https://lirrensi.github.io/vibrissae)

## デプロイ → [DEPLOY.md](DEPLOY.md) (AIエージェント向け)

---

## これは何？

**10秒で説明:** プライバシー重視のビデオチャット。ブラウザだけで動く。アカウント不要、インストール不要、トラッキングなし。リンクを開くだけで通話开始。P2PモードならWebRTCでエンドツーエンドだから動画をサーバーが見ることはない。

- **ゼロ摩擦** — リンクを開く→通話开始
- **ゼロ監視** — アカウント不要、テレメトリなし、更新でルーム消滅
- **2つのモード** — P2P（サーバーなし）またはセルフホスト（自分のサーバー）

---

[![Vibrissae スクリーンショット](web_ui/public/vibrissae_sm.jpg)](https://lirrensi.github.io/vibrissae/)

> ⚠️ バイブコード警告 - このアプリはまだ安全ではないかもしれません。 現在改良中です

Vibrissaeは、WebRTCベースのビデオ通話アプリ。2つの動作モードがあります：

| モード | サーバー必要 | シグナリング | おすすめ |
|-------|------------|-------------|----------|
| **Webバンドル** | なし | Trystero（分散型） | クイックデモ、カジュアル用途、セットアップゼロ |
| **セルフホスト** | あり | WebSocket + TURN | 本番環境プライベート、信頼性の高い通話 |


## クイックスタート

### オプション1：デモを試す（P2Pモード）

[GitHub Pages デモ](https://lirrensi.github.io/vibrissae/)にアクセス — サーバー不要、設定不要。

パブリックBitTorrentトラッカーとNostrリレーを使用してピアを発見するためほとんどのNAT構成で動作します。

### オプション2：自分でサーバーを立てる

```bash
# フロントエンドをビルド
cd web_ui
pnpm install
pnpm build:server

# Goサーバーをビルドして実行
cd ../server
go build -o vibrissae .
./vibrissae
```

デプロイ設定については[docs/product.md](docs/product.md)（直接、プロキシ、ローカル）を参照。

## 機能

- **ビデオとオーディオ** — ウェブカメラ/マイクの共有、デバイス選択可能
- **テキストチャット** — WebRTC DataChannel、P2Pのみ
- **PWA** — スタンドアロンアプリとしてインストール可能
- **データ保持なし** — ルームはRAMのみ、再起動で消去
- **アカウント不要** — ユーザー管理ゼロ
- **テレメトリなし** — サーバーからデータは一切送信されない

## 仕組み

```
┌─────────────────────────────────────────────────────────────┐
│                    VIBRISSAE MODES                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  P2P MODE (Web Bundle)                                      │
│  ─────────────────────                                      │
│  GitHub Pages → Trystero (Torrent/Nostr) → WebRTC P2P      │
│                                                             │
│  No server. Decentralized signaling. STUN-only traversal.  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SELF-HOSTED MODE                                           │
│  ─────────────────                                          │
│  Your Server → WebSocket Signaling → WebRTC P2P + TURN     │
│                                                             │
│  Single Go binary. Embedded TURN relay. Guaranteed conn.   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## ビルドコマンド

| コマンド | 出力 | 用途 |
|---------|------|------|
| `pnpm build:p2p` | `dist/` フォルダ | 静的ホスティング（GitHub Pages、Netlify） |
| `pnpm build:p2p:single` | 単一 `index.html` | オフライン用途、共有ファイル |
| `pnpm build:server` | `server/dist/` | バイナリ自己ホスト（組み込み） |

## 開発

```bash
# ターミナル1：フロントエンド開発サーバー
cd web_ui && pnpm dev

# ターミナル2：Goサーバー（オプション。自己ホストモード用）
cd server && go run .
```

## ドキュメント

- [製品仕様](docs/product.md) — ユーザー向け機能とデプロイモード
- [アーキテクチャリファレンス](docs/arch.md) — 技術詳細、API、データフロー

## テックスタック

| レイヤー | テクノロジー |
|---------|-------------|
| フロントエンド | Vue 3, Vite, Tailwind CSS |
| P2Pシグナリング | Trystero (BitTorrent, Nostr) |
| サーバー | Go, gorilla/websocket, pion/turn |
| WebRTC | ブラウザNative API |

## ライセンス

[MIT](LICENSE) — 個人、商用ともに自由に使用可能。

---

*猫がナビゲートするために使う敏感なヒゲに由来 — 友達を見つけるのも同样に直感的であるべきだから。*