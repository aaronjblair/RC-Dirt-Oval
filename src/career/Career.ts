/** Championship points by finishing position (1st .. 12th). */
export const POINTS = [25, 20, 16, 13, 11, 9, 7, 5, 4, 3, 2, 1];

/** Car numbers per grid slot; slot 0 is the player — Super Jay's #32. Matches Field palette. */
export const DRIVER_NUMBERS = [32, 7, 1, 11, 24, 9, 4, 15, 17, 2, 5, 21];

/** Full names for the AI field. Assigned deterministically per grid slot (slot 1 = AI_NAMES[0], …)
 *  so a given AI "driver" keeps the same name across the season — the championship standings (keyed
 *  by name) stay coherent round-to-round instead of scattering into one-off random names. */
export const AI_NAMES = [
  "Dale Hutchins", "Rusty Calhoun", "Cody Marsh", "Travis Boone", "Wade Stratton",
  "Buddy Renfro", "Cole Vandruff", "Shane McNair", "Earl Dobbins", "Jesse Holloway",
  "Tanner Pruitt", "Gus Whitaker", "Lonnie Brackett", "Hank Sizemore",
];

const NAME_KEY = "rcsprint.playername";
export const DEFAULT_PLAYER_NAME = "Super Jay";

/** Title-case a typed driver name: trim, collapse inner whitespace, capitalize each word's first
 *  letter (e.g. "dale  EARNHARDT" → "Dale Earnhardt"). Blank → the Super Jay default. */
export function titleCaseName(raw: string): string {
  const cleaned = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned) return DEFAULT_PLAYER_NAME;
  return cleaned.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function loadPlayerName(): string {
  try {
    const v = localStorage.getItem(NAME_KEY);
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
}

const KEY = "rcsprint.career";

export function loadCareer(): Career {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { round: 0, unlocked: 0, points: {}, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { round: 0, unlocked: 0, points: {} };
}

export function saveCareer(c: Career) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignore */ }
}

export function resetCareer(): Career {
  const c: Career = { round: 0, unlocked: 0, points: {} };
  saveCareer(c);
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
