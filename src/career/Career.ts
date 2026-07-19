/** Championship points by finishing position (1st .. 12th). */
export const POINTS = [25, 20, 16, 13, 11, 9, 7, 5, 4, 3, 2, 1];

/** Car numbers per grid slot; slot 0 is the player — Super Jay's #32; slot 1 is always the
 *  white/black 11X modified. Matches Field palette. */
export const DRIVER_NUMBERS: (number | string)[] = [32, "11X", 46, 11, 24, 9, 42, 15, 17, 2, 5, 21];

/** Full names for the AI field. Assigned deterministically per grid slot (slot 1 = AI_NAMES[0], …)
 *  so a given AI "driver" keeps the same name across the season — the championship standings (keyed
 *  by name) stay coherent round-to-round instead of scattering into one-off random names. */
export const AI_NAMES = [
  "Jordan Eddleman", "Aaron Blair", "Cody Marsh", "Travis Boone", "Wade Stratton",
  "Buddy Renfro", "Cole Vandruff", "Shane McNair", "Earl Dobbins", "Jesse Holloway",
  "Tanner Pruitt", "Gus Whitaker", "Lonnie Brackett", "Hank Sizemore",
];

const NAME_KEY = "rcdirtoval.playername";
const NAME_KEY_OLD = "rcsprint.playername";
export const DEFAULT_PLAYER_NAME = "Jay Hank";

/** Read `newKey`, falling back to (and migrating from) the old `rcsprint.*` key once. */
function readMigrated(newKey: string, oldKey: string): string | null {
  let v = localStorage.getItem(newKey);
  if (v == null) {
    const old = localStorage.getItem(oldKey);
    if (old != null) { v = old; try { localStorage.setItem(newKey, old); } catch { /* ignore */ } }
  }
  return v;
}

/** Title-case a typed driver name: trim, collapse inner whitespace, capitalize each word's first
 *  letter (e.g. "dale  EARNHARDT" → "Dale Earnhardt"). Blank → the Super Jay default. */
export function titleCaseName(raw: string): string {
  const cleaned = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned) return DEFAULT_PLAYER_NAME;
  // Easter egg: a certain driver gets renamed. Caught at the single normalization point so it
  // sticks across the HUD, the car's name label, and persistence.
  if (cleaned.toLowerCase() === "greg cumberworth") return "Greg Bad-Driver";
  return cleaned.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function loadPlayerName(): string {
  try {
    const v = readMigrated(NAME_KEY, NAME_KEY_OLD);
    if (v && v.trim()) return v;
  } catch { /* ignore */ }
  return DEFAULT_PLAYER_NAME;
}

export function savePlayerName(name: string) {
  try { localStorage.setItem(NAME_KEY, titleCaseName(name)); } catch { /* ignore */ }
}

/** Display/leaderboard name for a grid slot: slot 0 is the player (their saved name, default
 *  "Super Jay"); AI slots draw a stable full name from `AI_NAMES`. */
export function driverName(index: number): string {
  if (index === 0) return loadPlayerName();
  return AI_NAMES[(index - 1) % AI_NAMES.length];
}

export interface Career {
  round: number; // current round (0-based)
  unlocked: number; // furthest unlocked round
  points: Record<string, number>; // championship totals by driver name
  lastRaceOrder?: number[]; // finishing order of the previous race as IDENTITY INDICES (0=player,
                            // i=AI slot), 1st→last — seeds the next grid. Index-keyed (not name) so a
                            // mid-season driver rename can't misplace anyone.
}

/** Each car class keeps an INDEPENDENT career under its own key. */
export type CareerClassId = "sprint" | "latemodel" | "buggy";
// Pre-car-classes single-class save (oldest), then the per-class rcsprint.* keys, now rcdirtoval.*.
const LEGACY_KEY = "rcsprint.career";
const careerKey = (cls: CareerClassId) => `rcdirtoval.career.${cls}`;
const careerKeyOld = (cls: CareerClassId) => `${LEGACY_KEY}.${cls}`;

export function loadCareer(cls: CareerClassId = "sprint"): Career {
  try {
    // Prefer the new key, migrating the old per-class rcsprint.career.<cls> save up to it once.
    const raw = readMigrated(careerKey(cls), careerKeyOld(cls));
    if (raw) return { round: 0, unlocked: 0, points: {}, ...JSON.parse(raw) };
    // One-time migration: an old single-class save (pre car-classes) becomes the sprint career.
    if (cls === "sprint") {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const c = { round: 0, unlocked: 0, points: {}, ...JSON.parse(legacy) } as Career;
        saveCareer(c, cls);
        try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
        return c;
      }
    }
  } catch { /* ignore */ }
  return { round: 0, unlocked: 0, points: {} };
}

export function saveCareer(c: Career, cls: CareerClassId = "sprint") {
  try { localStorage.setItem(careerKey(cls), JSON.stringify(c)); } catch { /* ignore */ }
}

export function resetCareer(cls: CareerClassId = "sprint"): Career {
  const c: Career = { round: 0, unlocked: 0, points: {} };
  saveCareer(c, cls);
  return c;
}

/** Award championship points for a finishing order (array of driver names). */
export function awardPoints(c: Career, order: string[]) {
  order.forEach((name, i) => {
    c.points[name] = (c.points[name] ?? 0) + (POINTS[i] ?? 0);
  });
}

export interface Standing { name: string; points: number; }

export function standings(c: Career): Standing[] {
  return Object.entries(c.points)
    .map(([name, points]) => ({ name, points }))
    .sort((a, b) => b.points - a.points);
}

// --- Save EXPORT / IMPORT ---------------------------------------------------
// The whole game state (careers per class, name, settings) lives in localStorage
// under the `rcdirtoval.` prefix. Export bundles every such key into a JSON file
// the player downloads; import validates and writes them back, so progress can be
// backed up or moved between devices/installs. Auto-save behavior is unchanged.

const SAVE_PREFIX = "rcdirtoval.";
const SAVE_MAGIC = "superjay-rc-save";

/** Serialize every rcdirtoval.* localStorage key and trigger a JSON file download. */
export function exportSave(): void {
  const data: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(SAVE_PREFIX)) data[k] = localStorage.getItem(k) ?? "";
    }
  } catch { /* storage unavailable — nothing to export */ }
  const payload = JSON.stringify({ magic: SAVE_MAGIC, version: 1, data }, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "superjay-save.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Validate + apply an exported save file's text. Returns an error message, or null on
 *  success. Rejects anything that isn't our format WITHOUT touching the existing save. */
export function importSave(text: string): string | null {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return "That file isn't a valid save (not JSON)."; }
  const obj = parsed as { magic?: string; data?: Record<string, unknown> };
  if (!obj || obj.magic !== SAVE_MAGIC || typeof obj.data !== "object" || obj.data === null) {
    return "That file isn't a Super Jay RC save.";
  }
  const entries = Object.entries(obj.data).filter(
    ([k, v]) => k.startsWith(SAVE_PREFIX) && typeof v === "string"
  );
  if (!entries.length) return "That save file is empty.";
  try {
    for (const [k, v] of entries) localStorage.setItem(k, v as string);
  } catch { return "Couldn't write the save (browser storage unavailable)."; }
  return null;
}
