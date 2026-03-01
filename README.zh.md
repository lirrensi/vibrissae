# Vibrissae

简单好用的 P2P 视频通话。

---

## 立即试用 → [lirrensi.github.io/vibrissae](https://lirrensi.github.io/vibrissae)

## 部署 → [DEPLOY.md](docs/DEPLOY.md) (让你的 AI 代理参考这里)

---

## 这是什么？

**10秒介绍:** 一个隐私至上的视频聊天，直接在浏览器里用。不需要账号，不需要安装，不需要追踪。打开链接就能聊。使用 P2P WebRTC 模式，你的视频根本不会经过服务器。

- **零门槛** — 打开链接 → 立即通话
- **零监视** — 无账号、无遥测、刷新页面房间就消失
- **两种模式** — P2P（无服务器）或自托管（用自己的服务器）

---

[![Vibrissae 截图](web_ui/public/vibrissae_sm.jpg)](https://lirrensi.github.io/vibrissae/)

> ⚠️ 代码警告 - 这个应用可能不太安全，我们正在改进

Vibrissae 是一款基于 WebRTC 的视频通话应用，支持两种运行模式：

| 模式 | 需要服务器 | 信令 | 适用场景 |
|------|-----------|------|----------|
| **网页版** | 否 | Trystero（去中心化） | 快速演示、休闲使用 |
| **自托管** | 是 | WebSocket + TURN | 生产环境、私密通话 |


## 快速开始

### 选项 1：试试演示（P2P 模式）

访问 [GitHub Pages 演示](https://lirrensi.github.io/vibrissae/) — 无需服务器，无需配置。

通过公共 BitTorrent 追踪器和 Nostr 中继进行节点发现，适用于大多数 NAT 环境。

### 选项 2：运行自己的服务器

```bash
# 构建前端
cd web_ui
pnpm install
pnpm build:server

# 构建并运行 Go 服务器
cd ../server
go build -o vibrissae .
./vibrissae
```

部署配置请参考 [docs/product.md](docs/product.md)。

## 功能特点

- **视频和音频** — 摄像头/麦克风，支持设备选择
- **文字聊天** — WebRTC DataChannel，点对点
- **PWA** — 可安装为独立应用
- **无持久化** — 房间仅存于内存，重启即失
- **无需账号** — 零用户管理
- **无遥测** — 服务器不收集任何数据

## 工作原理

```
┌─────────────────────────────────────────────────────────────┐
│                    VIBRISSAE MODES                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  P2P MODE (Web Bundle)                                      │
│  ─────────────────────                                      │
│  GitHub Pages → Trystero (Torrent/Nostr) → WebRTC P2P      │
│                                                             │
│  无服务器。去中心化信令。STUN 仅遍历。                        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SELF-HOSTED MODE                                           │
│  ─────────────────                                          │
│  您的服务器 → WebSocket 信令 → WebRTC P2P + TURN           │
│                                                             │
│  单个 Go 二进制。内嵌 TURN 中继。保证连接。                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 构建命令

| 命令 | 输出 | 用途 |
|------|------|------|
| `pnpm build:p2p` | `dist/` 文件夹 | 静态托管（GitHub Pages、Netlify） |
| `pnpm build:p2p:single` | 单个 `index.html` | 离线使用、可分享文件 |
| `pnpm build:server` | `server/dist/` | 自托管（内嵌） |

## 开发

```bash
# 终端 1：前端开发服务器
cd web_ui && pnpm dev

# 终端 2：Go 服务器（可选，自托管模式用）
cd server && go run .
```

## 文档

- [产品规格](docs/product.md) — 功能介绍和部署模式
- [架构参考](docs/arch.md) — 技术细节、API、数据流

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3, Vite, Tailwind CSS |
| P2P 信令 | Trystero (BitTorrent, Nostr) |
| 服务器 | Go, gorilla/websocket, pion/turn |
| WebRTC | 浏览器原生 API |

## 许可证

[MIT](LICENSE) — 个人和商业用途免费。

---

*以猫的敏感胡须命名——因为找到朋友应该和猫找路一样直观。*