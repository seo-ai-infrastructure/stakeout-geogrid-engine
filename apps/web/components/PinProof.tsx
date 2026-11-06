/** Illustrative anatomy of one pin's proof: the phone recording beside what you receive. */
export default function PinProof() {
  const rows = [
    { name: "Harbor Plumbing Co.", meta: "4.7 (412) Plumber", you: false },
    { name: "Your business", meta: "4.8 (318) Plumber", you: true },
    { name: "Northside Drain & Sewer", meta: "4.6 (95) Plumber", you: false },
    { name: "Ace Rooter Service", meta: "4.4 (1,021) Plumber", you: false },
  ];
  return (
    <div className="proof">
      <div className="phone" aria-label="Example phone screen during a recorded search">
        <div className="phone-status">
          <span className="rec-dot" aria-hidden="true" /> Recording 0:31
        </div>
        <div className="phone-search">emergency plumber</div>
        <ol className="phone-results">
          {rows.map((r, i) => (
            <li key={r.name} data-you={r.you}>
              <span className="phone-rank">{i + 1}</span>
              <span>
                <span className="phone-name">{r.name}</span>
                <span className="phone-meta">{r.meta}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <dl className="proof-list">
        <div>
          <dt>A video clip from the phone session</dt>
          <dd>A 45-second recording starts before the app opens. Longer searches can continue beyond the video; captured screen reports provide additional evidence.</dd>
        </div>
        <div>
          <dt>Recorded location settings</dt>
          <dd>The phone&apos;s GPS is set to the exact point and its traffic uses a residential proxy targeted to the area. The report includes the checked exit location.</dd>
        </div>
        <div>
          <dt>Captured listings, saved</dt>
          <dd>Listings captured on screen, with available ratings and review counts, as a downloadable report plus JSON and XML for your own reporting.</dd>
        </div>
        <div>
          <dt>A fresh app session</dt>
          <dd>Cookies, history and app data are wiped before each search, to reduce carryover from previous app sessions.</dd>
        </div>
      </dl>
    </div>
  );
}
