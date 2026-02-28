# Vibrissae Web UI

Vue 3 frontend for Vibrissae — a lightweight WebRTC video calling application.

## Quick Start

```sh
pnpm install
pnpm dev
```

## Build Commands

| Command | Purpose |
|---------|---------|
| `pnpm build:p2p` | Build for static hosting (GitHub Pages, Netlify) |
| `pnpm build:p2p:single` | Build as single HTML file |
| `pnpm build:server` | Build for Go server embedding |

## Development

```sh
pnpm dev              # Start dev server
pnpm type-check       # Run TypeScript checks
pnpm lint             # Run linters (oxlint + eslint)
pnpm test:unit        # Run Vitest unit tests
pnpm test:e2e         # Run Playwright E2E tests
```

## Project Structure

```
src/
├── components/       # Vue components
│   ├── Chat.vue
│   ├── Controls.vue
│   ├── VideoGrid.vue
│   └── ...
├── composables/      # Vue composables
│   ├── useWebRTC.ts
│   ├── useSignaling.ts
│   └── ...
├── transports/       # Signaling transport implementations
│   ├── TrysteroTransport.ts   # P2P mode (decentralized)
│   ├── WebSocketTransport.ts  # Self-hosted mode
│   └── factory.ts             # Auto-detects mode
├── stores/           # Pinia stores
├── types/            # TypeScript types
└── utils/            # Utility functions
```

## PWA Icons

The app uses an SVG icon (`public/icon.svg`) for PWA. To generate PNG icons:

```sh
# Using ImageMagick or similar
convert public/icon.svg -resize 192x192 public/pwa-192x192.png
convert public/icon.svg -resize 512x512 public/pwa-512x512.png
convert public/icon.svg -resize 32x32 public/favicon.ico
```

Or use an online tool like [RealFaviconGenerator](https://realfavicongenerator.net/).

## Testing

### Unit Tests (Vitest)

```sh
pnpm test:unit
```

### E2E Tests (Playwright)

```sh
# Install browsers first
npx playwright install

pnpm test:e2e
```

## See Also

- [Product Specification](../docs/product.md)
- [Architecture Reference](../docs/arch.md)
