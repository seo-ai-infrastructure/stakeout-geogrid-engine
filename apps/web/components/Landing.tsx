import Link from "next/link";

import HeroGrid from "./HeroGrid";
import PinProof from "./PinProof";
import { money, packs, perCredit } from "@/lib/billing";
import { site } from "@/lib/site";

export default function Landing() {
  const list = packs();
  const cheapest = [...list].sort((a, b) => Number(a.price) / a.credits - Number(b.price) / b.credits)[0];
  const smallest = [...list].sort((a, b) => Number(a.price) - Number(b.price))[0];

  return (
    <main className="landing">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Built for local SEO agencies</p>
          <h1 className="display">Every ranking needs a receipt.</h1>
          <p className="lede">
            Bring local rankings into focus with video clips from real cloud Android phone sessions.
            Show prospects what Google displayed, explain your recommendations, and give clients evidence they can inspect.
          </p>
          <div className="hero-actions">
            <a className="btn" href="#proof">See the evidence</a>
            <Link className="btn secondary" href="/pricing">Compare credit packs</Link>
          </div>
          {site.sampleReportUrl && (
            <p className="small">
              <a href={site.sampleReportUrl} target="_blank" rel="noreferrer">Open a real sample report</a>
            </p>
          )}
        </div>
        <HeroGrid />
      </section>

      <section className="band" id="proof" aria-labelledby="proof-heading">
        <h2 id="proof-heading">Proof your clients can inspect</h2>
        <p className="section-lede">Each completed point pairs a ranking observation with a video clip, captured listings, and recorded location settings.</p>
        <PinProof />
      </section>

      <section className="band" aria-labelledby="agency-heading">
        <p className="eyebrow">From prospecting to the monthly review</p>
        <h2 id="agency-heading">Make the next client conversation concrete.</h2>
        <p className="section-lede">Use the receipt to make your audit easier to understand and your recommendations easier to discuss.</p>
        <div className="agency-uses">
          <article>
            <h3>Bring proof to the sales call</h3>
            <p>Open the video clip and show where a prospect appeared in the captured results. Start the conversation with something they can see.</p>
          </article>
          <article>
            <h3>Explain the next step</h3>
            <p>Use captured listings to point out which businesses appeared and connect that observation to your recommendation. Keep the evidence alongside your interpretation.</p>
          </article>
          <article>
            <h3>Give retainers a visible deliverable</h3>
            <p>Bring downloaded receipts to your client review. Walk through the keyword, location settings, and what Google displayed, so the client can inspect the basis of your report.</p>
          </article>
        </div>
        <p className="audit-note"><strong>Clear evidence includes context.</strong> A receipt documents one captured phone session. Results can vary with time, location, and account state.</p>
      </section>

      <section className="band">
        <h2>Open the evidence behind the ranking</h2>
        <div className="table-wrap">
          <table className="compare">
            <thead>
              <tr>
                <th scope="col">In the client conversation</th>
                <th scope="col">Evidence you can review</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Where the business appeared</th>
                <td>A geographic grid with a ranking observation for each completed point</td>
              </tr>
              <tr>
                <th scope="row">What Google displayed</th>
                <td>A 45-second video clip from an Android phone session, alongside captured listings</td>
              </tr>
              <tr>
                <th scope="row">How location was configured</th>
                <td>GPS set to the grid point, residential proxy targeting, and the checked exit location</td>
              </tr>
              <tr>
                <th scope="row">What supports the report</th>
                <td>Private video downloads and captured listings in HTML, JSON, and XML</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="band">
        <h2>How a scan runs</h2>
        <ol className="steps">
          <li>
            <h3>Choose the grid</h3>
            <p>Enter the keyword, the business, its location and a grid from 3×3 to 11×11 points.</p>
          </li>
          <li>
            <h3>Phones search every point</h3>
            <p>Each point gets its own phone session: GPS moved to the point, app wiped, search typed, and results captured across scroll stops.</p>
          </li>
          <li>
            <h3>Review the proof</h3>
            <p>Click any completed point on the map to watch its video clip, inspect captured listings, and download the report.</p>
          </li>
        </ol>
      </section>

      <section className="band pricing-teaser">
        <div>
          <h2>Pay per point</h2>
          <p>
            One credit is one point on a grid, so a 7×7 scan uses 49 credits.
            {cheapest && smallest ? ` Packs start at ${money(smallest.price)}; at volume a point costs ${perCredit(cheapest)}.` : ""} Credits
            don&apos;t expire, and points that fail are credited back automatically. There is no free trial: every point is a real phone session.
          </p>
        </div>
        <Link className="btn" href="/pricing">See pricing</Link>
      </section>

      <section className="band">
        <h2>Questions</h2>
        <dl className="faq">
          <div>
            <dt>Can I use the receipts in a sales call or client review?</dt>
            <dd>Yes. Open a completed point to review its video and captured listings, or download the evidence to use in your presentation. Include the keyword and capture context when you share it.</dd>
          </div>
          <div>
            <dt>Does a recording show what every customer will see?</dt>
            <dd>It shows what Google displayed during that phone session. Search app data is cleared before each search; the recording is not a demographic or logged-in audience sample.</dd>
          </div>
          <div>
            <dt>Is there a free trial?</dt>
            <dd>No. Every point runs on a real phone with a real connection, so each one has a cost. You buy credits and use them when you need them.</dd>
          </div>
          <div>
            <dt>What does one credit buy?</dt>
            <dd>One point on one grid. A 3×3 grid uses 9 credits, a 7×7 uses 49 and an 11×11 uses 121.</dd>
          </div>
          <div>
            <dt>What if a point fails?</dt>
            <dd>We retry it up to three times on fresh connections. If it still fails, its credit returns to your balance automatically.</dd>
          </div>
          <div>
            <dt>Which searches can I run?</dt>
            <dd>The Google Maps app, the Google app and Chrome, all on Android.</dd>
          </div>
          <div>
            <dt>How long does a scan take?</dt>
            <dd>Run time depends on the number of available phones, retries and network conditions. Larger grids take longer because every point requires a separate phone session.</dd>
          </div>
          <div>
            <dt>Do you need access to my Google Business Profile?</dt>
            <dd>No. Scans only look at public search results.</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
