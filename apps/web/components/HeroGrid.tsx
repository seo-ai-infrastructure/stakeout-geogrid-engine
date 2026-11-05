/**
 * Illustrative 7×7 rank grid for the landing hero. Deterministic (no randomness),
 * strongest at the centre and fading outward, like a real business's grid. Pins fill
 * in from the centre on load (once), mirroring how a scan completes.
 */
const N = 7;
// fixed variation so the grid looks like real data rather than perfect rings
const JITTER = [
  2, -1, 3, 1, 0, 4, 2, 1, 0, -1, 2, 1, 3, 0, 3, 1, 0, -1, 0, 2, 1, 0, 1, -1, 0, 0, 1, 2, 2, 0, 1, 0, -1, 1, 0, 1, 2, 0, 1, 2, 0, 3, 4, 1, 3, 0, 2, 1, 5,
];

type Cell = { key: string; rank: number | null; delay: number };

function cells(): Cell[] {
  const mid = (N - 1) / 2;
  const out: Cell[] = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const i = r * N + c;
      const d = Math.hypot(r - mid, c - mid);
      const raw = Math.round(1 + Math.pow(d, 1.9) * 1.15 + (JITTER.at(i) ?? 0));
      out.push({ key: `${r}-${c}`, rank: raw > 20 ? null : Math.max(1, raw), delay: Math.round(d * 140) });
    }
  return out;
}

const band = (rank: number | null) => (rank == null ? "none" : rank <= 3 ? "top" : rank <= 10 ? "mid" : "low");

export default function HeroGrid() {
  const list = cells();
  return (
    <figure className="hero-grid" aria-label="Example 7 by 7 rank grid: ranks 1 to 3 near the business, falling to not ranked at the edges">
      <div className="hero-grid-board" role="presentation">
        {list.map((c) => (
          <span key={c.key} className="pin hero-pin" data-band={band(c.rank)} style={{ animationDelay: `${c.delay}ms` }}>
            {c.rank ?? "20+"}
          </span>
        ))}
      </div>
      <figcaption className="muted small">Example grid. Each number is the business&apos;s rank at that point.</figcaption>
    </figure>
  );
}
