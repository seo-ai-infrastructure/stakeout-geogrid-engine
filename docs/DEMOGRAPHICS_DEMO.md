# Demographic map demo

Public route: `/demo/demographics`. No account, credit debit, Census API key, database query, device capture or private R2 object is involved. Rankings and AI citation rings are explicitly simulated. The main Stakeout headline is unchanged.

## Sources and processing

The build joins **174 Polk County, Florida tracts** by the 11-digit GEOID. Both geography and ACS release use 2023. This is an intentionally fixed historical demo, not a claim to use the latest ACS release.

- Boundaries: [Census 2023 Florida tract cartographic boundaries, 1:500,000](https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_12_tract_500k.zip).
- Demographics: [2019–2023 ACS 5-year table-based summary files](https://www2.census.gov/programs-surveys/acs/summary_file/2023/table-based-SF/data/5YRData/). The builder streams national tables and retains only Polk tract rows. This avoids the Census API key requirement encountered during this build.
- [ACS summary file documentation](https://www.census.gov/programs-surveys/acs/data/summary-file.Getting_Started.html).
- [PMTiles / MapLibre integration](https://docs.protomaps.com/pmtiles/maplibre) and [Tippecanoe creation](https://docs.protomaps.com/pmtiles/create).
- [OpenFreeMap basemap and attribution](https://openfreemap.org/quick_start/).

| Metric | ACS API estimate variables | Bulk table columns | Denominator / units |
| --- | --- | --- | --- |
| Median household income | B19013_001E | B19013_E001 | 2023 dollars |
| Median owner-occupied home value | B25077_001E | B25077_E001 | 2023 dollars |
| Owner-occupied share | B25003_002E / B25003_001E | B25003_E002 / B25003_E001 | Occupied housing units |
| Unemployment rate | B23025_005E / B23025_003E | B23025_E005 / B23025_E003 | Civilian labor force |
| Poverty rate | B17001_002E / B17001_001E | B17001_E002 / B17001_E001 | Population with poverty status determined |
| Median year built | B25035_001E | B25035_E001 | All housing units; a year, not age |

Corresponding M-columns preserve 90% margins of error for the medians and housing counts. Negative Census sentinels and non-finite values become null. Zero denominators become null. Derived rate and score margins of error are not calculated. Nothing imputes a missing tract value.

Geometry is reprojected from the supplied NAD83 projection into WGS84 (EPSG:4326); MapLibre displays Web Mercator. The 7×7 grid has fixed 0.018° latitude / 0.0204° longitude steps around Lakeland. Python joins original cartographic polygons with `covers`; shared-edge ties use the lowest GEOID deterministically. The generated fixtures report all 49 matched pins. Generalized coastlines/edges and zoom-level simplification are not suitable for parcel targeting. Original polygon joins may differ slightly from a simplified display edge.

## Weighted visibility model

For the active filtered cohort:

1. Standard SoLV = count of top-3 pins / visible pins.
2. Each represented tract has weight = owner-occupied unit estimate × median household income estimate.
3. Divide that tract weight among its visible pins, then calculate top-3 weight / total usable weight.
4. Exclude missing and nonpositive weights; display weighted-pin coverage. Standard SoLV still includes a pin whose ranking exists but whose demographic weight is unavailable. With partial coverage these measures use different usable samples; do not interpret the delta as a like-for-like causal estimate.
5. Report weighted minus standard in **percentage points**, not relative percent.

This is an exploratory area-level index, not measured household purchasing power, a forecast, or an official Census metric. Median income includes all households, whereas the count is owner-occupied homes. Splitting by pin avoids repeated tract counts but does not allocate tract households spatially within a tract. Displaying only part of a tract does not make its whole-population weight an estimate of residents inside the scan footprint.

The two illustrative rank scenarios have the same histogram and therefore the same unfiltered Standard SoLV, while their geographic placements differ. Income/homeowner filters apply to polygons, boundaries, highlight, pins and score denominators. Missing values do not pass an active threshold. Low homeownership is not an industrial-land classifier. Census estimates do not describe an individual Google account or prove buying intent.

## Reproduce the assets

Use Python 3.11+ and Tippecanoe 2.17+ (this build used Felt Tippecanoe commit `4f2621186acfec33b63ddf636f665623c0fef2dd`, 2.79 series):

```sh
python -m venv /tmp/stakeout-demographics-env
/tmp/stakeout-demographics-env/bin/pip install -r tools/demographics-requirements.txt
/tmp/stakeout-demographics-env/bin/python tools/build_demographics_demo.py --cache /tmp/stakeout-census-2023 --tippecanoe tippecanoe
```

The script writes `apps/web/data/demographics-demo.json`, `apps/web/public/data/polk-acs-2023.pmtiles`, and a county-only `apps/web/public/data/polk-demographics-fallback.geojson`. The JSON includes source URLs, retrieval/build time, boundary/table-subset/tile SHA-256 hashes, CRS and source coverage. The PMTiles archive preserves individual tract GEOIDs and properties; feature merging and dropping are disabled. Zooms 8–13 cover this county demo. A national production layer needs a separately tested zoom/bandwidth strategy.

MapLibre registers the PMTiles protocol once per mounted client group and releases it after the last instance unmounts. Map state synchronizes after load, including controls changed during loading. One static archive is served by Vercel with byte-range support; metric toggles mutate paint properties. Panning/zooming can fetch more tile ranges. There is no guarantee of a fixed frame rate and no claim of zero network activity.

For later R2 hosting, use a **separate public demographic asset bucket/domain** with GET/HEAD, CORS and Range support. Never expose the existing private receipt bucket. Changing hosting requires updating the source URL and verifying 206 responses and CORS from the deployed app origin.

## Validation

```sh
pnpm typecheck
pnpm --filter @geogrid/worker exec node --import tsx ../../tests/demographics.test.ts
pnpm --filter web build
```

Browser checks: all three layers and Off, both scenarios, opacity, income/homeowner filters including empty results, clear filters, map hover/click, keyboard pin selector, attribution, source notes, and no console errors from this page. Responsive layout stacks the inspector below the map at 760 px. If WebGL or tile delivery fails, selectors and the inspector remain available with an explicit error message.

## Browsers without WebGL

If MapLibre initialization fails, a lazy-loaded Leaflet 1.9 compatibility map renders SVG polygons and DOM rank pins. It uses the same Census attributes, filters, formulas, and selections. The 139 KB static county-only fallback geometry is simplified at 0.0001 degrees with topology preservation; it is fetched once from the app, never from TIGERweb. This is deliberately limited to 174 tracts and is not a national raw-GeoJSON architecture. The 2D context is also locally hosted: selected 2023 TIGER/Line primary/secondary roads and water polygons are clipped to the Lakeland demo extent and simplified. The builder records URLs, hashes, extent and feature counts in `metadata.mapContext`. Map labels come from those Census features. This renderer makes no external map-service calls. Attribution remains visible. The context is historical and partial; it is not a street-navigation map.

The verification browser has WebGL disabled. Browser interaction and visual QA therefore exercise the 2D compatibility renderer; PMTiles was independently decoded to verify all 174 GEOIDs and properties, and the deployed archive returns HTTP 206 byte ranges. WebGL rendering itself requires a WebGL-capable browser for visual verification.
