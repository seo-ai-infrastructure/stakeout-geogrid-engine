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
          <h1 className="display">Local rankings, recorded on a real phone.</h1>
          <p className="lede">
            Every point on your grid is searched by a real cloud Android phone using a residential proxy,
            with GPS set to the exact spot. Each search is recorded on video, so your client can inspect the result captured during that session.
          </p>
          <div className="hero-actions">
            <Link className="btn" href="/pricing">See pricing</Link>
            <Link className="btn secondary" href="/sign-in">Create an account</Link>
          </div>
          {site.sampleReportUrl && (
            <p className="small">
              <a href={site.sampleReportUrl} target="_blank" rel="noreferrer">Open a real sample report</a>
            </p>
          )}
        </div>
        <HeroGrid />
      </section>

      <section className="band">
        <h2>What you get for every point</h2>
        <p className="section-lede">Not a number from a server. A recorded search you can hand to a client.</p>
        <PinProof />
      </section>

      <section className="band">
        <h2>A real phone, not a request from a data center</h2>
        <div className="table-wrap">
          <table className="compare">
            <thead>
              <tr>
                <th scope="col"><span className="sr-only">Aspect</span></th>
                <th scope="col">Server-based grid checks</th>
                <th scope="col">{site.name}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Who runs the search</th>
                <td>A server sends a search request with coordinates attached</td>
                <td>An Android phone opens Google Maps and types the search</td>
              </tr>
              <tr>
                <th scope="row">Where it comes from</th>
                <td>A data center, often far from the business</td>
                <td>A residential proxy targeted to the area, with GPS set to the grid point</td>
              </tr>
              <tr>
                <th scope="row">Proof you can show</th>
                <td>A rank number</td>
                <td>A 45-second video clip, captured listings and the connection details</td>
              </tr>
              <tr>
                <th scope="row">Personalization</th>
                <td>Not visible to you</td>
                <td>Search app data cleared before every search</td>
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
