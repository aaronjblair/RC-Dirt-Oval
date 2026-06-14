# Sharing RCSprint with friends

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
- **G** — garage setup (gearing, wing, tire, camber, bias)
- **C** — toggle aerial / driver-stand camera
- **R** — reset car if you get stuck

## Notes
- It's a **career**: 15 progressively harder ovals; win rounds to climb the championship. Progress + setup save in the browser (localStorage), so each friend has their own season on their machine.
- Not networked multiplayer — everyone races the AI. (Online racing would be a future addition.)
- Rebuild any time with `npm run build` and re-zip `dist/`.
