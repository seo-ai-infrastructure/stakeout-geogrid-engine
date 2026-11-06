import assert from "node:assert/strict";
import { assertRankingEvidence, extractBusinesses, xmlStrings } from "../apps/worker/src/parse.ts";

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
assert.deepEqual(xmlStrings(xml, "com.android.chrome"), [], "Reject a different app's screen instead of relabelling it");
assert.deepEqual(xmlStrings(xml, "com.google.android.apps.maps"), xmlStrings(xml));
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
assert.throws(() => assertRankingEvidence({ dumpCount: 0, businesses: [], rank: null }), /No screen dumps/);
assert.throws(() => assertRankingEvidence({ dumpCount: 1, businesses: [], rank: null }), /No organic listings/);
const organic = found.filter(b => !b.sponsored);
assert.throws(() => assertRankingEvidence({ dumpCount: 14, businesses: organic, rank: null }), /cannot establish a top-20/);
assert.doesNotThrow(() => assertRankingEvidence({ dumpCount: 14, businesses: organic, rank: 2 }));
assert.doesNotThrow(() => assertRankingEvidence({ dumpCount: 14, businesses: Array.from({ length: 20 }, (_, i) => ({ ...organic[0], name: `Cafe ${i}` })), rank: null }));
const browserCard = extractBusinesses(xmlStrings('<hierarchy><node content-desc="Compassion Coffeehouse Rated 4.7 out of 5, 105 reviews, Coffee shop" package="com.android.chrome"/></hierarchy>', "com.android.chrome"), 0);
assert.equal(browserCard[0].name, "Compassion Coffeehouse");
assert.equal(browserCard[0].rating, 4.7);
assert.equal(browserCard[0].reviews, 105);
const compactReviews = extractBusinesses(xmlStrings('<hierarchy><node content-desc="Just Love Coffee Cafe Rated 4.7 out of 5 1.2K reviews for Just Love Coffee Cafe" package="com.android.chrome"/></hierarchy>', "com.android.chrome"), 0);
assert.equal(compactReviews[0].reviews, 1200);
const groupedAds = extractBusinesses(xmlStrings(`<hierarchy>
  <node text="Sponsored Results" />
  <node content-desc="Scooter's Coffee Rated 4.4 out of 5 140 reviews" />
  <node text="Menu" /><node text="Order" /><node text="View menu" /><node text="Read reviews" />
  <node content-desc="7 Brew Coffee Rated 4.5 out of 5 144 reviews" />
  <node text="Hide sponsored results" /><node text="Places" /><node text="Map" />
  <node text="Sponsored" /><node text="Why this ad?" />
  <node content-desc="Sponsored Cafe Rated 4.0 out of 5 20 reviews" />
  <node text="Directions" /><node text="Website" /><node text="Menu" /><node text="Reviews" />
  <node content-desc="Compassion Coffeehouse Rated 4.7 out of 5 105 reviews" />
</hierarchy>`), 0);
assert.deepEqual(groupedAds.map(b => [b.name, b.sponsored]), [
  ["Scooter's Coffee", true], ["7 Brew Coffee", true], ["Sponsored Cafe", true], ["Compassion Coffeehouse", false],
]);
console.log("PASS: live Maps stars ratings, numeric business names, sponsored exclusion, review counts, legacy formats and non-rating text");
