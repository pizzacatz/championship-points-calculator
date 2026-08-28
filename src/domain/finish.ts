import type { PlacementBand } from './types';

/**
 * How a required finish reads on the ladder.
 *
 * The ladder states the *worst* you can do and still reach the target, so a band
 * is named by its deepest place. Below a top 4 the band is small enough to name
 * outright. Every payout table groups 3rd and 4th together, so there is no
 * 3rd-place band in any game — 3–4 reads "Top 4".
 */
export function finishLabel(band: PlacementBand | null): string {
  if (!band) return '-';
  if (band.maxPlace >= 4) return `Top ${band.maxPlace}`;
  return band.maxPlace === 1 ? '1st place' : `${band.maxPlace}nd place`;
}
