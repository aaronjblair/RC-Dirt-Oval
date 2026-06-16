/** Championship points by finishing position (1st .. 12th). */
export const POINTS = [25, 20, 16, 13, 11, 9, 7, 5, 4, 3, 2, 1];

/** Car numbers per grid slot; slot 0 is the player — Super Jay's #32. Matches Field palette. */
export const DRIVER_NUMBERS = [32, 7, 1, 11, 24, 9, 4, 15, 17, 2];

/** Named drivers by grid slot: Super Jay (the player's tribute car), then Aaron Blair,
 *  then Carl Vandruff; the rest race under their car numbers. */
export const DRIVER_NAMES = ["Super Jay", "Aaron Blair", "Carl Vandruff"];

export function driverName(index: number): string {
  if (index < DRIVER_NAMES.length) return DRIVER_NAMES[index];
  return `#${DRIVER_NUMBERS[index] ?? index}`;
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
