# Testing QR check-in on a phone

The check-in scanner (`/admin/check-in` → **Scan**) uses the browser camera via
`getUserMedia`. **Browsers only allow the camera on a secure origin** — `https://`
or `localhost`. A phone opening the dev server over `http://<your-pc-ip>:3000` is
*not* secure, so the camera is blocked and the scanner shows
"Camera unavailable". This is a browser security rule, not an app bug.

Pick whichever option fits — all three exercise the same
`qrTokenSchema → validateToken` flow.

## Option A — Simulate, no camera (always works) ✅
The fastest way to demo/verify QR check-in:

1. As a **guest**, open **My Trips → the booking pass** and tap the button to
   **copy the QR payload** (the JSON behind the QR).
2. As **front desk**, go to **Check-in → Code tab → "Paste token instead"**,
   paste the JSON, and tap **Validate**.

This runs the exact same validation path a live scan does — ideal for a defense
demo where you don't want to fight with phone cameras.

## Option B — Local HTTPS (real camera on the LAN)
```bash
cd hillside-next
npm run dev:https      # next dev --experimental-https -H 0.0.0.0
```
On the phone (same Wi‑Fi) open `https://<your-pc-lan-ip>:3000`, accept the
self-signed-certificate warning, then use **Scan**. Some mobile browsers still
block the camera on an untrusted cert — if so, use Option C.

Find your PC's LAN IP with `ipconfig` (Windows) → "IPv4 Address".

## Option C — Public HTTPS tunnel (most reliable real camera) 🌐
Gives a trusted `https://…` URL the phone fully accepts.

```bash
# terminal 1
cd hillside-next && npm run dev
# terminal 2
cd hillside-next && npm run tunnel        # npx localtunnel --port 3000
```
Open the printed `https://*.loca.lt` URL on the phone (localtunnel may show a
one-time interstitial asking for the tunnel password = your PC's public IP, shown
on the same page). Then use **Scan** — the camera works over real HTTPS.

Prefer Cloudflare? `npx cloudflared tunnel --url http://localhost:3000`
(requires the `cloudflared` binary). Prefer ngrok? `npx ngrok http 3000`
(requires a free ngrok account/token).

## Notes
- The API (`hillside-api`, port 8000) must be running for validation to succeed.
- QR payload shape lives in `packages/shared/src/schemas.ts` → `qrTokenSchema`.
- Scanner code: `hillside-next/components/admin-checkin/AdminCheckinClient.tsx`
  (`startCamera`) + `components/checkin/CameraScanPanel.tsx`.
