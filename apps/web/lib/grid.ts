/** N×N coordinate matrix around a center (row 0 = north, col 0 = west). spec §3.1 */
export const GRID_SIZES = [3, 5, 7, 9, 11] as const;
export type GridSize = (typeof GRID_SIZES)[number];

export type GridPinSeed = { rowIdx: number; colIdx: number; lat: number; lng: number };

export function buildGrid(centerLat: number, centerLng: number, n: number, spacingKm: number): GridPinSeed[] {
  const mid = (n - 1) / 2;
  const kmPerDegLat = 111.32;
  const kmPerDegLng = 111.32 * Math.cos((centerLat * Math.PI) / 180);
  const pins: GridPinSeed[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      pins.push({
        rowIdx: r,
        colIdx: c,
        lat: round6(centerLat - ((r - mid) * spacingKm) / kmPerDegLat),
        lng: round6(centerLng + ((c - mid) * spacingKm) / kmPerDegLng),
      });
    }
  }
  return pins;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
