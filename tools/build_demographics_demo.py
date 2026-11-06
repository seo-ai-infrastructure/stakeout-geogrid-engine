#!/usr/bin/env python3
"""Build a static Polk County ACS demo from Census bulk tables (no API key)."""
import argparse, concurrent.futures, csv, datetime, hashlib, io, json, math, pathlib, subprocess, urllib.request, zipfile
import shapefile
from pyproj import CRS, Transformer
from shapely.geometry import Point, mapping, shape
from shapely.ops import transform

YEAR = 2023
PREFIX = '1400000US12105'
TABLES = ['B19013', 'B25077', 'B25003', 'B23025', 'B17001', 'B25035']
BOUNDARY_URL = f'https://www2.census.gov/geo/tiger/GENZ{YEAR}/shp/cb_{YEAR}_12_tract_500k.zip'
TABLE_BASE = f'https://www2.census.gov/programs-surveys/acs/summary_file/{YEAR}/table-based-SF/data/5YRData/'
ROOT = pathlib.Path(__file__).resolve().parents[1]

def number(raw):
    try:
        n = float(str(raw).replace(',', '').rstrip('+'))
        return n if math.isfinite(n) and n >= 0 else None
    except (TypeError, ValueError):
        return None

def pct(n, d):
    return round(n / d * 100, 1) if n is not None and d is not None and d > 0 else None

def fetch_table(table, geoids, cache):
    path = cache / f'{table}-polk.json'
    if path.exists():
        return json.loads(path.read_text())
    url = TABLE_BASE + f'acsdt5y{YEAR}-{table.lower()}.dat'
    found = {}
    with urllib.request.urlopen(url, timeout=120) as response:
        rows = csv.DictReader(io.TextIOWrapper(response, encoding='utf-8-sig'), delimiter='|')
        for row in rows:
            geoid = row.get('GEO_ID', '')
            if geoid.startswith(PREFIX) and geoid[9:] in geoids:
                found[geoid[9:]] = row
                if len(found) == len(geoids):
                    break
    if set(found) != geoids:
        raise ValueError(f'{table}: unmatched tracts: {geoids - set(found)}')
    path.write_text(json.dumps(found, sort_keys=True))
    print(f'{table}: {len(found)} matching tracts', flush=True)
    return found

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', default='/tmp/stakeout-census-2023')
    parser.add_argument('--tippecanoe', default='tippecanoe')
    args = parser.parse_args()
    cache = pathlib.Path(args.cache); cache.mkdir(parents=True, exist_ok=True)
    archive = cache / 'boundaries.zip'
    if not archive.exists():
        with urllib.request.urlopen(BOUNDARY_URL, timeout=90) as r:
            archive.write_bytes(r.read())
    with zipfile.ZipFile(archive) as z:
        stem = f'cb_{YEAR}_12_tract_500k'
        reader = shapefile.Reader(shp=io.BytesIO(z.read(stem+'.shp')), shx=io.BytesIO(z.read(stem+'.shx')), dbf=io.BytesIO(z.read(stem+'.dbf')))
        project = Transformer.from_crs(CRS.from_wkt(z.read(stem+'.prj').decode()), 'EPSG:4326', always_xy=True).transform
        features = []
        for r in reader.iterShapeRecords():
            p = r.record.as_dict()
            if p['COUNTYFP'] != '105': continue
            geometry = transform(project, shape(r.shape.__geo_interface__))
            if not geometry.is_valid: geometry = geometry.buffer(0)
            features.append({'type':'Feature', 'geometry':mapping(geometry), 'properties':{'GEOID':p['GEOID'], 'NAMELSAD':p['NAMELSAD']}})
    geoids = {f['properties']['GEOID'] for f in features}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda t: fetch_table(t, geoids, cache), TABLES))
    data = dict(zip(TABLES, results))
    tracts = {}
    for f in features:
        p=f['properties']; geoid=p['GEOID']
        raw={k:v for table in data.values() for k,v in table[geoid].items() if k!='GEO_ID'}
        val=lambda k:number(raw.get(k))
        p.update(income=val('B19013_E001'),income_moe=val('B19013_M001'),home_value=val('B25077_E001'),home_value_moe=val('B25077_M001'),year_built=val('B25035_E001'),year_built_moe=val('B25035_M001'),owner_units=val('B25003_E002'),occupied_units=val('B25003_E001'),owner_units_moe=val('B25003_M002'),occupied_units_moe=val('B25003_M001'),owner_pct=pct(val('B25003_E002'),val('B25003_E001')),unemp_pct=pct(val('B23025_E005'),val('B23025_E003')),poverty_pct=pct(val('B17001_E002'),val('B17001_E001')))
        for field, code in [('income','B19013_E001'),('home_value','B25077_E001'),('year_built','B25035_E001')]:
            raw_value=raw.get(code,'')
            # Keep meaningful capped-value annotations; never expose numeric null sentinels as values.
            p[field+'_annotation']=raw_value if number(raw_value) is not None and any(c in raw_value for c in '+<>') else ''
        centroid=shape(f['geometry']).representative_point()
        tracts[geoid]={**p,'center':[round(centroid.x,6),round(centroid.y,6)]}
    # Grid geometry is independent of the illustrative rank scenarios.
    polygons=[(f['properties']['GEOID'],shape(f['geometry'])) for f in features]
    pins=[]
    south=[21,18,15,12,14,18,21,18,13,9,7,8,12,18,14,9,6,4,5,8,14,11,7,4,2,3,6,10,8,5,3,1,2,4,8,7,4,2,1,1,3,7,9,6,3,2,3,5,10]
    for row in range(7):
        for col in range(7):
            lat=round(28.0395+(3-row)*0.018,6); lng=round(-81.9498+(col-3)*0.0204,6)
            candidates=sorted(g for g,geom in polygons if geom.covers(Point(lng,lat)))
            pins.append({'id':f'R{row+1}C{col+1}','lat':lat,'lng':lng,'tractId':candidates[0] if candidates else None,'rankSouth':south[row*7+col],'rankNorth':south[(6-row)*7+col],'aiCited':row in (3,4,5) and col==3})
    out=ROOT/'apps/web/public/data'; out.mkdir(parents=True,exist_ok=True)
    geo=cache/'polk-demographics.geojson'; geo.write_text(json.dumps({'type':'FeatureCollection','features':features},separators=(',',':'),allow_nan=False))
    tiles=out/'polk-acs-2023.pmtiles'
    subprocess.run([args.tippecanoe,'-f','-o',str(tiles),'-l','demographics','-Z','8','-z','13','--no-feature-limit','--no-tile-size-limit','--detect-shared-borders',str(geo)],check=True)
    metadata={'vintage':'2019–2023 ACS 5-year estimates','boundaryYear':YEAR,'currencyYear':YEAR,'coverage':'Polk County, Florida','stateFips':'12','countyFips':'105','crs':'EPSG:4326','boundaryScale':'1:500,000 cartographic boundaries','sourceUrls':[BOUNDARY_URL]+[TABLE_BASE+f'acsdt5y{YEAR}-{t.lower()}.dat' for t in TABLES],'downloadedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'boundarySha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'tilesSha256':hashlib.sha256(tiles.read_bytes()).hexdigest(),'tileBytes':tiles.stat().st_size,'tractCount':len(tracts),'joinedPins':sum(p['tractId'] is not None for p in pins),'rankStatus':'simulated','aiCitationStatus':'simulated','tables':TABLES,'sourceSubsetHashes':{t:hashlib.sha256((cache/f'{t}-polk.json').read_bytes()).hexdigest() for t in TABLES}}
    target=ROOT/'apps/web/data/demographics-demo.json'; target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps({'metadata':metadata,'tracts':tracts,'pins':pins},separators=(',',':'),allow_nan=False)+'\n')
    print(json.dumps(metadata),flush=True)

if __name__=='__main__':main()
