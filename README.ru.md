# Vibrissae

P2P видеозвонки без ебли.

[![CI](https://github.com/lirrensi/vibrissae/actions/workflows/ci.yml/badge.svg)](https://github.com/lirrensi/vibrissae/actions/workflows/ci.yml)
[![Deploy to Pages](https://github.com/lirrensi/vibrissae/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/lirrensi/vibrissae/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Лёгкие эфемерные видеозвонки. Без аккаунтов. Без загрузок. Открой ссылку → и ты в звонке.**

[![Скриншот Vibrissae](web_ui/public/vibrissae_sm.jpg)](https://lirrensi.github.io/vibrissae/)

> ⚠️ VIBECODE ВНИМАНИЕ — это приложение может быть небезопасным, мы работаем над этим

Vibrissae — видеозвонки на WebRTC с двумя режимами работы:

| Режим | Нужен сервер | Сигнализация | Для чего |
|-------|--------------|--------------|----------|
| **Веб-пакет** | Нет | Trystero (децентрализованная) | Быстрые демо, казуальное использование |
| **Сам-hosted** | Да | WebSocket + TURN | Продакшен, приватные звонки |

## Быстрый старт

### Вариант 1: Попробуй демо (P2P режим)

Посети [демо на GitHub Pages](https://lirrensi.github.io/vibrissae/) — без сервера, без настройки.

Работает для большинства NAT через публичные BitTorrent-трекеры и Nostr-реле для обнаружения пиров.

### Вариант 2: Запусти свой сервер

```bash
# Собери фронтенд
cd web_ui
pnpm install
pnpm build:server

# Собери и запусти Go сервер
cd ../server
go build -o vibrissae .
./vibrissae
```

Смотри [docs/product.md](docs/product.md) для вариантов развёртывания.

## Возможности

- **Видео и аудио** — Вебка/микрофон с выбором устройства
- **Текстовый чат** — WebRTC DataChannel, P2P
- **PWA** — Устанавливается как приложение
- **Без хранения** — Комнаты только в RAM, удаляются при перезагрузке
- **Без аккаунтов** — Нет управления пользователями
- **Без телеметрии** — Ничего не уходит с сервера

## Как это работает

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

## Команды сборки

| Команда | Вывод | Для чего |
|---------|-------|----------|
| `pnpm build:p2p` | Папка `dist/` | Статический хостинг (GitHub Pages, Netlify) |
| `pnpm build:p2p:single` | Один `index.html` | Офлайн, файл для передачи |
| `pnpm build:server` | `server/dist/` | Сам-hosted (встроенный) |

## Разработка

```bash
# Терминал 1: Фронтенд dev сервер
cd web_ui && pnpm dev

# Терминал 2: Go сервер (опционально)
cd server && go run .
```

## Документация

- [Спецификация продукта](docs/product.md) — Возможности и режимы развёртывания
- [Архитектура](docs/arch.md) — Технические детали, API, потоки данных

## Техно-стек

| Уровень | Технология |
|---------|------------|
| Фронтенд | Vue 3, Vite, Tailwind CSS |
| P2P сигнализация | Trystero (BitTorrent, Nostr) |
| Сервер | Go, gorilla/websocket, pion/turn |
| WebRTC | Browser Native API |

## Лицензия

[MIT](LICENSE) — для личного и коммерческого использования.

---

*Названо в честь чувствительных усов кошек — потому что находить друзей должно быть так же интуитивно.*