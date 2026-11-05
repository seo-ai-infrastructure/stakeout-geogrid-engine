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
          <dt>A video of the whole search</dt>
          <dd>45 seconds per point: the app opening, the query typed, and a slow scroll to the bottom of the results.</dd>
        </div>
        <div>
          <dt>A home connection in that neighborhood</dt>
          <dd>The phone&apos;s GPS is set to the exact point and its traffic leaves through a residential internet connection in the same city.</dd>
        </div>
        <div>
          <dt>The full results list, saved</dt>
          <dd>Every business the phone saw, in order, with ratings and review counts, as a shareable report plus JSON and XML for your own reporting.</dd>
        </div>
        <div>
          <dt>A clean phone every time</dt>
          <dd>Cookies, history and app data are wiped before each search, so no earlier search personalizes the result.</dd>
        </div>
      </dl>
    </div>
  );
}
