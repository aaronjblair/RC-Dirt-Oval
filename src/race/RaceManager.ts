import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { OvalTrack } from "../track/OvalTrack";

export interface Racer {
  id: string;
  name: string;
  isPlayer: boolean;
  getPos: () => Vector3;
  lap: number;
  prevS: number;
  passedHalf: boolean;
  lapStart: number;
  bestLap: number;
  lastLap: number;
  finished: boolean;
  finishedAt: number; // timestamp the car crossed the final line (0 until finished) — orders finishers
  // for live position ordering
  progress: number; // lap*length + s
}

export interface RaceState {
  started: boolean;
  finished: boolean;
  totalLaps: number;
  winnerFinishedAt?: number; // timestamp the leader first crossed the final line
  endByTime?: number;        // hard race-end deadline = winnerFinishedAt + leader's last-lap time
}

/**
 * Lap timing + live positions across the field. Detects a clean forward
 * crossing of the start/finish line (must have passed the back half first),
 * tracks per-racer lap/best/last times and computes running order.
 */
export class RaceManager {
  racers: Racer[] = [];
  state: RaceState;

  constructor(private track: OvalTrack, totalLaps: number) {
    this.state = { started: false, finished: false, totalLaps };
  }

  add(id: string, name: string, isPlayer: boolean, getPos: () => Vector3): Racer {
    const r: Racer = {
      id, name, isPlayer, getPos,
      lap: 0, prevS: 0, passedHalf: false,
      lapStart: 0, bestLap: 0, lastLap: 0, finished: false, finishedAt: 0, progress: 0,
    };
    this.racers.push(r);
    return r;
  }

  start(now: number) {
    this.state.started = true;
    this.state.finished = false;
    this.state.winnerFinishedAt = undefined;
    this.state.endByTime = undefined;
    for (const r of this.racers) {
      r.lap = 0;
      r.lapStart = now;
      r.prevS = (this.track.project(r.getPos()).s - this.track.startFinishS + this.track.length) % this.track.length;
      r.passedHalf = false;
      r.finished = false;
      r.finishedAt = 0;
      r.progress = 0;
    }
  }

  update(now: number) {
    if (!this.state.started) return;
    const len = this.track.length;
    const sf = this.track.startFinishS;
    for (const r of this.racers) {
      const proj = this.track.project(r.getPos());
      // Relativize the projected s to the start/finish line so all lap/timing logic
      // measures from the NEW line, not the geometry origin.
      const sRel = (proj.s - sf + len) % len;
      // mark having reached the back half (prevents line-jitter false laps)
      if (sRel > len * 0.4 && sRel < len * 0.6) r.passedHalf = true;

      // forward crossing of the start/finish line (prevS near end, sRel near start)
      const crossed = r.prevS > len * 0.75 && sRel < len * 0.25;
      if (crossed && r.passedHalf && !r.finished) {
        if (r.lap > 0) {
          r.lastLap = (now - r.lapStart) / 1000;
          if (r.bestLap === 0 || r.lastLap < r.bestLap) r.bestLap = r.lastLap;
        }
        r.lap++;
        r.lapStart = now;
        r.passedHalf = false;
        if (r.lap > this.state.totalLaps) {
          r.finished = true;
          r.finishedAt = now;
          r.lap = this.state.totalLaps;
        }
      }
      r.prevS = sRel;
      r.progress = r.lap * len + sRel;
    }
    // A car that has FINISHED has the most track behind it, but its raw `progress` wraps DOWN at the
    // line (s→0, lap clamped) — so rank finishers first by finish time, then racers by progress.
    this.racers.sort((a, b) => {
      if (a.finished && b.finished) return a.finishedAt - b.finishedAt; // earlier finisher ranks higher
      if (a.finished !== b.finished) return a.finished ? -1 : 1;        // a finisher beats a still-racing car
      return b.progress - a.progress;                                   // both racing: more progress leads
    });

    // Race ends ONE lap after the winner: when the leader first finishes, arm a deadline of
    // the leader's last lap time; once that elapses (or everyone's in) lock the rest of the field.
    const leader = this.racers[0];
    if (leader && leader.finished && this.state.winnerFinishedAt === undefined) {
      this.state.winnerFinishedAt = leader.finishedAt;
      const lastLapMs = leader.lastLap > 0 ? leader.lastLap * 1000 : 30000;
      this.state.endByTime = leader.finishedAt + lastLapMs;
    }

    const allIn = this.racers.length > 0 && this.racers.every((r) => r.finished);
    const timeUp = this.state.endByTime !== undefined && now >= this.state.endByTime;
    if (!this.state.finished && (allIn || timeUp)) {
      // Lock every still-unfinished car, preserving current running order via synthetic finish stamps.
      const endAt = this.state.endByTime ?? now;
      this.racers.forEach((r, i) => {
        if (!r.finished) {
          r.finished = true;
          r.finishedAt = endAt + i; // +i keeps the current order stable among the locked cars
          r.lap = this.state.totalLaps;
        }
      });
      this.state.finished = true;
      this.racers.sort((a, b) => {
        if (a.finished && b.finished) return a.finishedAt - b.finishedAt;
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        return b.progress - a.progress;
      });
    }
  }

  positionOf(r: Racer): number {
    return this.racers.indexOf(r) + 1;
  }

  curLapTime(r: Racer, now: number): number {
    if (!this.state.started || r.lap === 0) return 0;
    return (now - r.lapStart) / 1000;
  }

  /**
   * Time interval (seconds) to the car directly ahead and behind in the running
   * order, estimated from the on-track progress gap and a reference speed. null
   * when the racer is leading / running last.
   */
  gapInfo(r: Racer, refSpeed: number): { ahead: number | null; behind: number | null } {
    const i = this.racers.indexOf(r);
    const spd = Math.max(4, refSpeed); // avoid blowing up the gap at low speed
    const ahead = i > 0 ? (this.racers[i - 1].progress - r.progress) / spd : null;
    const behind = i < this.racers.length - 1 ? (r.progress - this.racers[i + 1].progress) / spd : null;
    return { ahead, behind };
  }
}
