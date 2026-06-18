# Sharing RCSprint with friends

## Install / Download

**Live game:** **https://aaronjblair.github.io/RC-Dirt-Oval/** — open it on any device and play in the browser, or install it as a real app.

### Install the app (PWA) — iOS, Android, Windows, Mac
RCSprint is an installable **Progressive Web App**: the build ships a web-app manifest and a service worker that **precaches the whole game (including the Havok physics `.wasm`)**, so once installed it gets its own icon and runs offline. From the live URL above:

- **iOS (Safari):** **Share → Add to Home Screen**.
- **Android / desktop Chrome or Edge:** the **Install app** button in the address bar (or browser menu → *Install*).

### Windows installer (`.exe`)
A native Windows build (**Electron**) is published as a **GitHub Release** asset — grab `RC Dirt Oval Setup *.exe` from the [Releases page](https://github.com/aaronjblair/RC-Dirt-Oval/releases) and run it.

To build it yourself: **`npm run build:win`** (runs `scripts/build-win.mjs`, which builds `dist/` then packages the app **from a temp directory** to work around an electron-builder **EPERM** error when packaging on the project tree) → `release/*Setup*.exe` (gitignored).

### Native store builds
There are intentionally **no native iOS / Mac / Android store builds** — install the **PWA** from the live URL instead, which covers all three platforms.

---

## Other ways to share

The built game is a self-contained web app in **`dist/`**, also zipped as **`RCSprint-web.zip`** (in the project root). It must be **served over http(s)** — double-clicking `index.html` won't work (browsers block ES modules + WebAssembly over `file://`).

Pick whichever is easiest:

## 1. Easiest for friends anywhere — itch.io (free, in-browser)
1. Make a free account at https://itch.io and click **Upload new project**.
2. Set **Kind of project = HTML**.
3. Upload **`RCSprint-web.zip`**.
4. Tick **"This file will be played in the browser."**
5. Set the embed/viewport to ~1280×720 and **Save**.
6. Share the project URL — friends just click and play, no install.

## 2. Same Wi‑Fi — instant, no upload
From the project folder:
```
npm run preview -- --host
```
It prints a `Network:` URL like `http://192.168.x.x:4173/`. Anyone on your network opens that in a browser.

## 3. Send the zip — they run a local server
Send `RCSprint-web.zip`. Your friend unzips it and, inside the folder, runs any static server, e.g.:
```
npx serve .
```
(or `python -m http.server 8000`) then opens the printed `http://localhost:...` URL.

## 4. Free static hosting (permanent link)
Drag the **`dist`** folder onto https://app.netlify.com/drop, or push the repo and enable GitHub Pages / Cloudflare Pages. You get a public URL to share.

---

## Controls
- **Arrows / WASD** or a **gamepad** to drive (analog stick = steer, triggers = throttle/brake)
- **V** (or the upper-left button) — cycle camera view: In-Car / Track / Aerial
- **C** — quick-toggle aerial / driver-stand camera
- **G** — garage setup (gearing, wing, tire, camber, bias)
- **M** — mute / unmute engine sound
- **R** — reset car if you get stuck

## Notes
- **Two game modes**, picked at the start (after the car-class select): **Career/Sim** (the championship below) and **Arcade** (RC Pro-Am style — on-track pickups, boost strips, slick patches, and 8 collectible RCSPRINT letters, with a score and a top-3-or-continue gate). Both launch off a drag-strip light tree.
- It's a **career**: 15 progressively harder ovals; win rounds to climb the championship. Progress + setup save in the browser (localStorage), so each friend has their own season on their machine.
- Not networked multiplayer — everyone races the AI. (Online racing would be a future addition.)
- Rebuild any time with `npm run build` and re-zip `dist/`.
