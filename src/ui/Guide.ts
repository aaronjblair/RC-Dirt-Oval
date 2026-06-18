/**
 * RCSprint Driver's Manual — a self-contained, professionally styled documentation
 * overlay openable from the title/attract screen and the pre-race panel. It works on
 * desktop and touch, scrolls, and closes on ×, Esc, or a backdrop tap. While open it
 * swallows key events (capture phase) so reading the manual on the attract screen never
 * accidentally drops you into a race.
 */

const ACCENT = "#ffd34d";
const INK = "#eef2f7";
const MUTED = "#9aa6b3";
const PANEL = "#0d1118";

function h(title: string, body: string): string {
  return (
    `<section style="margin:22px 0 0">` +
    `<h2 style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:${ACCENT};margin:0 0 8px;border-bottom:1px solid #232c38;padding-bottom:6px">${title}</h2>` +
    `<div style="font-size:14px;line-height:1.6;color:${INK}">${body}</div>` +
    `</section>`
  );
}

function kbd(k: string): string {
  return `<span style="display:inline-block;min-width:18px;text-align:center;font-family:ui-monospace,Consolas,monospace;font-size:12px;font-weight:700;background:#1b2330;border:1px solid #33414f;border-bottom-width:2px;border-radius:5px;padding:2px 7px;color:#fff;margin:0 1px">${k}</span>`;
}

function row(c: string, d: string): string {
  return `<tr style="border-bottom:1px solid #1b232f"><td style="padding:7px 12px 7px 0;white-space:nowrap;vertical-align:top">${c}</td><td style="padding:7px 0;color:${INK};vertical-align:top">${d}</td></tr>`;
}

function table(rows: string): string {
  return `<table style="width:100%;border-collapse:collapse;font-size:13.5px;color:${MUTED};margin:2px 0 4px">${rows}</table>`;
}

const CONTENT =
  `<p style="font-size:14.5px;line-height:1.65;color:${INK};margin:0">` +
  `<b style="color:${ACCENT}">RCSprint</b> is a sim-leaning 3D recreation of <b>1/10-scale dirt-oval RC sprint car racing</b>, ` +
  `modeled on the real <b>Team Losi 22S Sprint</b>. You watch from the drivers' stand, wheel a winged sprinter around a ` +
  `banked clay oval, and fight an 8–10-car field across a 15-round championship as the track slicks off and your tires fade.` +
  `</p>` +

  h("Getting started",
    `Pick up the throttle off the green, find the bottom groove through the corners, and keep the car under you as the ` +
    `surface changes. Finish each round to advance — the championship <b>always moves on to the next, harder track</b>, so ` +
    `every race counts toward your points total. Your progress and car setup are saved automatically in this browser.`) +

  h("Controls — keyboard",
    table(
      row(`${kbd("↑")} / ${kbd("W")}`, "Throttle") +
      row(`${kbd("↓")} / ${kbd("S")}`, "Brake / reverse") +
      row(`${kbd("←")} ${kbd("→")} / ${kbd("A")} ${kbd("D")}`, "Steer") +
      row(`${kbd("R")}`, "Reset / right your car after a flip") +
      row(`${kbd("C")}`, "Toggle the aerial overview camera") +
      row(`${kbd("G")}`, "Open the garage / setup panel")
    )) +

  h("Controls — gamepad &amp; wheel",
    `A controller takes over automatically the moment it sees input. <b>Right trigger</b> throttle, <b>left trigger</b> brake, ` +
    `<b>left stick</b> steer; face buttons map to reset. A <b>Logitech flight yoke + CH Pro pedals</b> are recognized and ` +
    `self-calibrate — steer with the yoke, gas/brake on the pedals.`) +

  h("Controls — touch (phone &amp; tablet)",
    `On a touchscreen the on-screen controls appear automatically: a <b>steering pad</b> on the left, <b>GAS</b> and <b>BRAKE</b> ` +
    `on the right, and a <b>RESET</b> button. Add the page to your home screen for a full-screen, app-like ride. ` +
    `Play it on your phone at <b style="color:${ACCENT}">aaronjblair.github.io/RC-Dirt-Oval</b>.`) +

  h("The car — Losi 22S Sprint",
    `A 2WD winged sprint car on the proven TLR 22 chassis: brushless power on a 2S LiPo, a big raked <b>top wing</b> and ` +
    `<b>front wing</b> for downforce, roll cage, nerf bars, tubular front axle, and soft-compound <b>2.2" dirt tires</b>. ` +
    `The wing plants the car at speed; the tires wear and lose grip over a run, just like the real thing.`) +

  h("How to drive a dirt oval",
    `Dirt is about <b>momentum and slip</b>, not braking. Roll the corner, get the car turned with a little slide, and feed ` +
    `the throttle off the corner. Key techniques:` +
    `<ul style="margin:8px 0 0;padding-left:20px;line-height:1.6">` +
    `<li><b>The groove</b> — the fast line migrates as the track dries; hunt for grip from the bottom to the cushion.</li>` +
    `<li><b>Slide jobs</b> — cross under a rival into the corner and drift up in front of them off it.</li>` +
    `<li><b>Drafting</b> — tuck in behind a car down the straight for a tow, then slingshot.</li>` +
    `<li><b>Tire management</b> — grip fades over the race; smooth inputs late preserve lap time.</li></ul>`) +

  h("The track &amp; the surface",
    `Each oval is real data — length, corner radius, banking, base grip and rut intensity all vary. The clay <b>evolves over a ` +
    `run</b>: tacky early, a blue groove mid-race, then dry-slick and rutted late. Banking grows and the AI sharpens as the ` +
    `15 rounds get harder, with three <b>night races</b> under the light towers. The grassed infield carries the sprayed ` +
    `<b>Flora Vista Speedway</b> logo.`) +

  h("Flips &amp; the corner crew",
    `Get into someone or the wall hard enough and you'll <b>flip and end up stuck upside down</b> — hi-vis <b>corner marshals</b> ` +
    `ring the track, and two <b>rescue marshals</b> seated at the infield ends will get up, walk out through traffic, and right ` +
    `your car. As the player you can also just tap ${kbd("R")} to reset instantly.`) +

  h("Garage &amp; setup",
    `Press ${kbd("G")} to tune the car. Gearing, diff, camber, weight bias, wing angle and tire compound all feed the physics — ` +
    `more wing means grip but drag; softer tires hook up but wear faster. Dial the car to the track and to how slick it's gotten.`) +

  h("Cameras",
    `The default <b>drivers' stand</b> camera sits high and pulled back so almost the whole oval — and the infield logo — stays ` +
    `in frame, drifting gently with your car. Press ${kbd("C")} for a closer aerial overview.`) +

  h("Championship",
    `Race all 15 rounds for points and chase the season title. The calendar climbs in difficulty from short flat bullrings to ` +
    `long high-banked night ovals. Standings and your unlocked progress persist between sessions in this browser.`) +

  h("Under the hood",
    `Built with <b>Babylon.js 7</b> + <b>Havok</b> physics, TypeScript and Vite. The car is a custom raycast vehicle with a ` +
    `slip/friction-circle tire model — not a rigid body — for a tunable dirt feel. Everything is procedural or bundled; it runs ` +
    `entirely in your browser with no server. Live at <b style="color:${ACCENT}">aaronjblair.github.io/RC-Dirt-Oval</b>.`);

let openEl: HTMLDivElement | null = null;

/** Open the Driver's Manual overlay. Safe to call repeatedly (no duplicate). */
export function openGuide(): void {
  if (openEl) return;

  const scrim = document.createElement("div");
  scrim.style.cssText =
    "position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;" +
    "background:rgba(4,6,9,0.78);backdrop-filter:blur(3px);font-family:'Segoe UI',system-ui,sans-serif;" +
    "padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));box-sizing:border-box;";

  const card = document.createElement("div");
  card.style.cssText =
    `position:relative;width:100%;max-width:720px;max-height:88vh;overflow:hidden;display:flex;flex-direction:column;` +
    `background:${PANEL};border:1px solid #2a3340;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,0.7);`;

  const header =
    `<div style="flex:0 0 auto;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;` +
    `padding:20px 24px 14px;border-bottom:1px solid #232c38;background:linear-gradient(180deg,#121823,${PANEL})">` +
    `<div><div style="font-size:22px;font-weight:900;letter-spacing:2px;color:${ACCENT}">RCSPRINT</div>` +
    `<div style="font-size:12px;letter-spacing:2px;color:${MUTED};margin-top:2px">DRIVER'S MANUAL</div></div>` +
    `<button id="guideClose" aria-label="Close" style="flex:0 0 auto;width:34px;height:34px;border:none;border-radius:9px;` +
    `cursor:pointer;background:#26303d;color:${INK};font-size:20px;line-height:1;font-weight:700">&times;</button></div>`;

  const body = document.createElement("div");
  body.style.cssText = "flex:1 1 auto;overflow-y:auto;padding:4px 24px 26px;-webkit-overflow-scrolling:touch;";
  body.innerHTML = CONTENT;

  card.innerHTML = header;
  card.appendChild(body);
  scrim.appendChild(card);
  document.body.appendChild(scrim);
  openEl = scrim;

  const close = () => {
    if (!openEl) return;
    window.removeEventListener("keydown", onKey, true);
    openEl.remove();
    openEl = null;
  };
  // Capture phase so the attract screen's own keydown->race listener never fires while reading.
  const onKey = (e: KeyboardEvent) => {
    e.stopImmediatePropagation();
    if (e.code === "Escape") close();
  };
  window.addEventListener("keydown", onKey, true);
  (card.querySelector("#guideClose") as HTMLButtonElement).onclick = close;
  scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
}
