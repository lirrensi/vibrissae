# Plan: Add MQTT and IPFS Trystero Backends

**Goal:** Support all zero-setup Trystero backends (Nostr, BitTorrent, MQTT, IPFS) for P2P signaling.

**Scope:**
- ✅ Keep: Nostr, BitTorrent (already working)
- ➕ Add: MQTT, IPFS
- ⏳ Defer: GunJS (custom component later)
- ❌ Skip: Supabase, Firebase (require setup)

---

## Files to Change

| File | Action |
|------|--------|
| ✅ `web_ui/src/types/p2p-config.ts` | Remove Gun types, verify MQTT/IPFS |
| ✅ `web_ui/src/transports/TrysteroTransport.ts` | Add MQTT and IPFS config builders |
| ✅ `web_ui/src/utils/p2p-config-loader.ts` | Add MQTT/IPFS to defaults |
| ✅ `web_ui/src/transports/TrysteroTransport.test.ts` | Update tests |

---

## Step 1: Update Types

**File:** `web_ui/src/types/p2p-config.ts`

Remove Gun-related types (deferred to custom component):

```typescript
export type TransportType = 'torrent' | 'nostr' | 'mqtt' | 'ipfs'

export interface P2PConfig {
  version: number
  transports: {
    priority: TransportType[]
    torrent?: TorrentConfig
    nostr?: NostrConfig
    mqtt?: MQTTConfig
    ipfs?: IPFSConfig
  }
  signaling: {
    resendIntervalMs: number
    resendMaxAttempts: number
  }
}

export interface TorrentConfig {
  enabled: boolean
  announce?: string[]
}

export interface NostrConfig {
  enabled: boolean
  relays?: string[]
}

export interface MQTTConfig {
  enabled: boolean
  url?: string
}

export interface IPFSConfig {
  enabled: boolean
  bootstrap?: string[]
}
```

---

## Step 2: Update TrysteroTransport

**File:** `web_ui/src/transports/TrysteroTransport.ts`

### 2a. Add MQTT config builder

```typescript
case 'mqtt': {
  const mc = config.transports.mqtt
  if (!mc?.enabled) return null
  return {
    ...base,
    relayUrls: mc.url ? [mc.url] : [
      'wss://public.mqtthq.com',
      'wss://broker.hivemq.com',
      'wss://mqtt.eclipseprojects.io'
    ]
  }
}
```

### 2b. Add IPFS config builder

```typescript
case 'ipfs': {
  const ic = config.transports.ipfs
  if (!ic?.enabled) return null
  return {
    ...base,
    // IPFS uses default bootstrap nodes if not specified
    ...(ic.bootstrap ? { bootstrap: ic.bootstrap } : {})
  }
}
```

### 2c. Remove Gun case from `buildRoomConfig()`

### 2d. Update `isTransportEnabled()` to only check torrent/nostr/mqtt/ipfs

---

## Step 3: Update Default Config

**File:** `web_ui/src/utils/p2p-config-loader.ts`

Update default config to include all backends:

```typescript
const defaultConfig: P2PConfig = {
  version: 1,
  transports: {
    priority: ['nostr', 'torrent', 'mqtt', 'ipfs'],
    nostr: {
      enabled: true,
      relays: ['wss://relay.damus.io', 'wss://nostr.mom']
    },
    torrent: {
      enabled: true,
      announce: ['wss://tracker.openwebtorrent.com', 'wss://tracker.webtorrent.dev']
    },
    mqtt: {
      enabled: true
    },
    ipfs: {
      enabled: true
    }
  },
  signaling: {
    resendIntervalMs: 3000,
    resendMaxAttempts: 10
  }
}
```

Update `mergeWithDefaults()` to handle MQTT and IPFS:

```typescript
function mergeWithDefaults(config: Partial<P2PConfig>): P2PConfig {
  return {
    version: config.version ?? defaultConfig.version,
    transports: {
      priority: config.transports?.priority ?? defaultConfig.transports.priority,
      torrent: {
        enabled: config.transports?.torrent?.enabled ?? true,
        announce: config.transports?.torrent?.announce ?? defaultConfig.transports.torrent!.announce
      },
      nostr: {
        enabled: config.transports?.nostr?.enabled ?? true,
        relays: config.transports?.nostr?.relays ?? defaultConfig.transports.nostr!.relays
      },
      mqtt: {
        enabled: config.transports?.mqtt?.enabled ?? true,
        url: config.transports?.mqtt?.url
      },
      ipfs: {
        enabled: config.transports?.ipfs?.enabled ?? true,
        bootstrap: config.transports?.ipfs?.bootstrap
      }
    },
    signaling: {
      resendIntervalMs: config.signaling?.resendIntervalMs ?? defaultConfig.signaling.resendIntervalMs,
      resendMaxAttempts: config.signaling?.resendMaxAttempts ?? defaultConfig.signaling.resendMaxAttempts
    }
  }
}
```

---

## Step 4: Update Tests

**File:** `web_ui/src/transports/TrysteroTransport.test.ts`

Add test cases for MQTT and IPFS config building.

---

## Bundle Size Impact

| Backend | Bundle Size |
|---------|-------------|
| Nostr | 8K |
| BitTorrent | 5K |
| MQTT | 75K |
| IPFS | 119K |
| **Total additional** | ~194K |

All backends are tree-shakeable via separate imports (`trystero/nostr`, `trystero/mqtt`, etc.). Users who disable backends in config won't pay the bundle cost if bundler properly tree-shakes.

---

## Verification

1. `cd web_ui && npm run test` — all tests pass
2. `cd web_ui && npm run build` — check bundle size
3. Manual test: open app in P2P mode, check TechLog shows all transports attempting connection

---

## Notes

- MQTT public brokers: `wss://public.mqtthq.com`, `wss://broker.hivemq.com`, `wss://mqtt.eclipseprojects.io`
- IPFS uses built-in bootstrap nodes by default (no config needed)
- GunJS removed from types — will be added later as separate pluggable transport
