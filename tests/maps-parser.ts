import assert from "node:assert/strict";
import { extractBusinesses, xmlStrings } from "../apps/worker/src/parse.ts";

// Reduced from UXsp5's live Maps UI dump on 2026-11-06; preserve title/rating order.
const xml = `<hierarchy>
  <node text="Sponsored" package="com.google.android.apps.maps" />
  <node content-desc="About this ad" package="com.google.android.apps.maps" />
  <node text="Scooter's Coffee" content-desc="Scooter's Coffee" package="com.google.android.apps.maps" />
  <node text="4.4 stars (140)" package="com.google.android.apps.maps" />
  <node text="Coffee shop" package="com.google.android.apps.maps" />
  <node text="Closed · Opens 5:30 AM" package="com.google.android.apps.maps" />
  <node text="Compassion Coffeehouse" content-desc="Compassion Coffeehouse" package="com.google.android.apps.maps" />
  <node text="4.7 stars (105)" package="com.google.android.apps.maps" />
  <node text="Coffee shop" package="com.google.android.apps.maps" />
  <node text="Closed · Opens 6 AM" package="com.google.android.apps.maps" />
  <node text="7 Brew Coffee" content-desc="7 Brew Coffee" package="com.google.android.apps.maps" />
  <node text="4.5 stars (144)" package="com.google.android.apps.maps" />
  <node text="Coffee shop" package="com.google.android.apps.maps" />
  <node text="Closed · Opens 5:30 AM" package="com.google.android.apps.maps" />
  <node text="Just Love Coffee Cafe - Mt. Juliet" package="com.google.android.apps.maps" />
  <node text="4.7 stars (1,222)" package="com.google.android.apps.maps" />
</hierarchy>`;
const found = extractBusinesses(xmlStrings(xml), 0);
assert.deepEqual(found.map(b => [b.name, b.rating, b.reviews, b.sponsored]), [
  ["Scooter's Coffee", 4.4, 140, true],
  ["Compassion Coffeehouse", 4.7, 105, false],
  ["7 Brew Coffee", 4.5, 144, false],
  ["Just Love Coffee Cafe - Mt. Juliet", 4.7, 1222, false],
]);
for (const [rating, expected] of [["4.8 (120)", 120], ["4.8 stars (1.2K)", 1200], ["4.8", undefined]] as const) {
  const cards = extractBusinesses(xmlStrings(`<hierarchy><node text="Legacy Cafe"/><node text="${rating}"/></hierarchy>`), 0);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].rating, 4.8);
  assert.equal(cards[0].reviews, expected);
}
assert.equal(extractBusinesses(xmlStrings('<hierarchy><node text="Coffee shop"/><node text="1.7 mi"/><node text="5 days ago"/></hierarchy>'), 0).length, 0);
console.log("PASS: live Maps stars ratings, numeric business names, sponsored exclusion, review counts, legacy formats and non-rating text");
