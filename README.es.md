# Vibrissae

Videollamadas P2P sin complicaciones.

---

## Pruébalo ahora → [lirrensi.github.io/vibrissae](https://lirrensi.github.io/vibrissae)

## Despliega → [DEPLOY.md](DEPLOY.md) (point your AI agent here)

---

## ¿Qué es esto?

**En 10 segundos:** Un chat de video privacidad-first que funciona directamente en tu navegador. Sin cuenta, sin instalar, sin seguimiento. Solo abre un enlace y estás hablando. Usa WebRTC par a par así que tu video nunca toca un servidor (en modo P2P).

- **Cero fricción** — Abre enlace → en llamada
- **Cero vigilancia** — Sin cuentas, sin telemetría, las salas mueren al actualizar
- **Dos modos** — P2P (sin servidor) o Autoalojado (tu propio servidor)

---

[![Captura de pantalla de Vibrissae](web_ui/public/vibrissae_sm.jpg)](https://lirrensi.github.io/vibrissae/)

> ⚠️ ALERTA DE CÓDIGO VIBE — Esta aplicación puede no ser muy segura, estamos trabajando en ello

Vibrissae es una aplicación de videollamadas basada en WebRTC con dos modos de operación:

| Modo | Servidor necesario | Señalización | Mejor para |
|------|-------------------|--------------|------------|
| **Paquete Web** | No | Trystero (descentralizado) | Demoras rápidas, uso casual, cero configuración |
| **Autoalojado** | Sí | WebSocket + TURN | Producción, llamadas privadas, fiables |


## Inicio rápido

### Opción 1: Prueba la demo (modo P2P)

Visita la [demo de GitHub Pages](https://lirrensi.github.io/vibrissae/) — sin servidor, sin configuración.

Funciona para la mayoría de configuraciones NAT usando trackers públicos de BitTorrent y relés Nostr para descubrimiento de pares.

### Opción 2: Ejecuta tu propio servidor

```bash
# Compila el frontend
cd web_ui
pnpm install
pnpm build:server

# Compila y ejecuta el servidor Go
cd ../server
go build -o vibrissae .
./vibrissae
```

Consulta [docs/product.md](docs/product.md) para configuraciones de despliegue (directo, proxy, local).

## Características

- **Video y audio** — Compartir webcam/micrófono con selección de dispositivo
- **Chat de texto** — WebRTC DataChannel, par a par solo
- **PWA** — Instalable como aplicación independiente
- **Sin persistencia** — Salas solo en RAM, desaparecen al reiniciar
- **Sin cuentas** — Cero gestión de usuarios
- **Sin telemetría** — Nada sale del servidor

## Cómo funciona

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

## Comandos de compilación

| Comando | Salida | Caso de uso |
|---------|--------|-------------|
| `pnpm build:p2p` | Carpeta `dist/` | Alojamiento estático (GitHub Pages, Netlify) |
| `pnpm build:p2p:single` | Un solo `index.html` | Uso offline, archivo compartible |
| `pnpm build:server` | `server/dist/` | Binario autoalojado (embebido) |

## Desarrollo

```bash
# Terminal 1: Servidor dev del frontend
cd web_ui && pnpm dev

# Terminal 2: Servidor Go (opcional, para modo autoalojado)
cd server && go run .
```

## Documentación

- [Especificación del producto](docs/product.md) — Funciones para usuario y modos de despliegue
- [Referencia de arquitectura](docs/arch.md) — Detalles técnicos, APIs, flujos de datos

## Pila tecnológica

| Capa | Tecnología |
|------|------------|
| Frontend | Vue 3, Vite, Tailwind CSS |
| Señalización P2P | Trystero (BitTorrent, Nostr) |
| Servidor | Go, gorilla/websocket, pion/turn |
| WebRTC | API nativa del navegador |

## Licencia

[MIT](LICENSE) — Uso personal y comercial libre.

---

*Llamado así por los sensibles bigotes que los gatos usan para navegar — porque encontrar a tus amigos debería ser igual de intuitivo.*