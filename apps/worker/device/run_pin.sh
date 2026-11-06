#!/system/bin/sh
# run_pin.sh — on-device GeoGrid pin macro for DuoPlus Android 12 (Toybox /system/bin/sh)
#
# Usage (launched backgrounded by the worker through cloudPhone/command, after the worker
# has already set the phone's GPS to the pin = step 1):
#   UPLOAD_TAR='<presigned PUT>' UPLOAD_VIDEO='<presigned PUT>' \
#   nohup sh /data/local/tmp/rt/run_pin.sh <maps|google|chrome> <lat> <lng> '<query>' '<queryEncoded>' '<queryTyped>' <scanId> <pinId> \
#     > /data/local/tmp/rt/last.log 2>&1 &
#
# Steps on the phone (spec §7.4):
#   2 clear cookies, history and app data of Maps, Google app and Chrome
#   3 start the 45 s screen recording
#   4 open the target app (first-run screens tapped away)
#   5 type the search query into the app's search box (deep link only as fallback)
#   6 scroll slowly to the bottom of the results, dumping the screen at every stop
#   7 package the per-stop UI dumps (the worker merges them into serp.xml/json/html)
#
# Writes /data/local/tmp/rt/pins/<scan>_<pin>/{meta.txt,dump_N.xml,flags.txt,video.mp4,status}
# and   /data/local/tmp/rt/pins/<scan>_<pin>.tar.gz
#
# Review fixes baked in (spec §7.4):
#   1. single-line uiautomator XML is split per <node> before any grep; grep -E only
#   2. "Search this area" is only a drift flag on dump_1+ (never dump_0); Maps URI carries z=15
#   3. no force-stop after FRE dismissal (SharedPreferences flush race re-shows sign-in)
#   4. end-of-list hash uses text/content-desc only, systemui nodes removed

APP=$1; LAT=$2; LNG=$3; Q=$4; QE=$5; QT=$6; SCAN=$7; PIN=$8
RT=/data/local/tmp/rt
PD=$RT/pins
TAG=${SCAN}_${PIN}
D=$PD/$TAG
REC_SECS=${REC_SECS:-45}
MAX_STOPS=${MAX_STOPS:-14}

case $APP in
  maps)   PKG=com.google.android.apps.maps ;;
  google) PKG=com.google.android.googlequicksearchbox ;;
  chrome) PKG=com.android.chrome ;;
  *) echo "unknown app $APP"; exit 2 ;;
esac

mkdir -p "$D"; rm -f "$D"/* "$PD/$TAG.tar.gz"
echo starting > "$D/status"

S=$(wm size | tail -n1 | sed 's/.*: //'); W=${S%x*}; H=${S#*x}
[ -z "$W" ] && W=1080; [ -z "$H" ] && H=1920
X=$((W/2))
T0=$(date +%s)
{
  echo "app=$APP"; echo "lat=$LAT"; echo "lng=$LNG"; echo "query=$Q"
  echo "scan=$SCAN"; echo "pin=$PIN"; echo "screen=${W}x${H}"; echo "t_start=$T0"
} > "$D/meta.txt"

# ---- helpers -----------------------------------------------------------------

# Fix 1: one <node> per line (POSIX backslash-newline; portable across Toybox builds)
splitnodes() {
  sed 's/><node/>\
<node/g' "$1"
}

dump() {
  rm -f "$1"
  DuoPlusDumpUI "$1" >/dev/null 2>&1 && [ -s "$1" ] && return 0
  uiautomator dump "$1" >/dev/null 2>&1
  [ -s "$1" ]
}

# Fix 4: content-only hash (no systemui clock, no pixel bounds)
h() {
  [ -s "$1" ] || { echo "empty_$$_$(date +%s)"; return; }
  splitnodes "$1" \
    | grep -v 'package="com.android.systemui"' \
    | grep -oE '(text|content-desc)="[^"]+"' \
    | md5sum | cut -d' ' -f1
}

tap_in_file() {
  B=$(splitnodes "$2" \
      | grep -iE "(text|content-desc)=\"[^\"]*$1[^\"]*\"" \
      | grep -v 'package="com.android.systemui"' \
      | head -n1 \
      | sed -n 's/.*bounds="\[\([0-9]*\),\([0-9]*\)\]\[\([0-9]*\),\([0-9]*\)\]".*/\1 \2 \3 \4/p')
  [ -z "$B" ] && return 1
  set -- $B
  input tap $(( ($1+$3)/2 )) $(( ($2+$4)/2 ))
}

# tap the first node whose resource-id matches $1 (extended regex)
tap_by_rid() {
  B=$(splitnodes "$2" \
      | grep -E "resource-id=\"[^\"]*($1)[^\"]*\"" \
      | head -n1 \
      | sed -n 's/.*bounds="\[\([0-9]*\),\([0-9]*\)\]\[\([0-9]*\),\([0-9]*\)\]".*/\1 \2 \3 \4/p')
  [ -z "$B" ] && return 1
  set -- $B
  input tap $(( ($1+$3)/2 )) $(( ($2+$4)/2 ))
}

dismiss_fre() {
  r=0
  while [ $r -lt 4 ]; do
    dump "$RT/fre.xml" || return 0
    hit=0
    for t in "Accept & continue" "Accept" "Skip" "No thanks" "Not now" "Got it" "Continue" "Use without an account" "Dismiss"; do
      if tap_in_file "$t" "$RT/fre.xml"; then hit=1; sleep 1.5; break; fi
    done
    [ $hit -eq 0 ] && return 0
    r=$((r+1))
  done
}

# ---- step 2: clear cookies, browser history and app data (no personalisation) --
# Never clear com.google.android.gms: that resets device services, not search state.
for P in com.google.android.apps.maps com.google.android.googlequicksearchbox com.android.chrome; do
  am force-stop $P >/dev/null 2>&1
  pm clear $P >/dev/null 2>&1
done
pm grant $PKG android.permission.ACCESS_FINE_LOCATION 2>/dev/null
pm grant $PKG android.permission.ACCESS_COARSE_LOCATION 2>/dev/null
if [ "$APP" = chrome ]; then
  echo 'chrome --disable-fre --no-default-browser-check --no-first-run' > /data/local/tmp/chrome-command-line 2>/dev/null
fi
echo cleared >> "$D/meta.txt"

# ---- step 3: start the 45 s screen recording ---------------------------------
REC_START=$(date +%s)
screenrecord --time-limit $REC_SECS --bit-rate 1500000 "$D/video.mp4" >/dev/null 2>&1 &
sleep 1
echo recording > "$D/status"

# ---- step 4: open the target app; tap away first-run screens -----------------
# Fix 3: no force-stop after this; the app stays warm for the search
monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 4
dismiss_fre
sleep 1

# ---- step 5: type the query into the app's search box ------------------------
MODE=deeplink
dump "$RT/home.xml"
case $APP in
  maps)   RID='search_omnibox_text_box|search_omnibox_container'; TXT='Search here' ;;
  google) RID='googleapp_search_box|search_box|search_plate'; TXT='Search' ;;
  chrome) RID='search_box_text|url_bar'; TXT='Search or type' ;;
esac
if tap_by_rid "$RID" "$RT/home.xml" || tap_in_file "$TXT" "$RT/home.xml"; then
  sleep 1.5
  if [ -n "$QT" ]; then
    input text "$QT"
    sleep 0.8
    input keyevent 66
    MODE=typed
  fi
fi
if [ "$MODE" = deeplink ]; then
  # Fallback (Fix 2: z=15 locks the Maps viewport to the pin)
  case $APP in
    maps)   am start -a android.intent.action.VIEW -d "geo:$LAT,$LNG?q=$QE&z=15" $PKG ;;
    google) am start -a android.intent.action.WEB_SEARCH --es query "$Q" $PKG ;;
    chrome) am start -a android.intent.action.VIEW -d "https://www.google.com/search?q=$QE" $PKG ;;
  esac >/dev/null 2>&1
fi
echo "search=$MODE" >> "$D/meta.txt"
rm -f "$RT/home.xml"

# wait until the results stop changing (max ~14 s)
prev=""; n=0
while [ $n -lt 7 ]; do
  sleep 2; dump "$D/probe.xml"; cur=$(h "$D/probe.xml")
  [ -n "$cur" ] && [ "$cur" = "$prev" ] && break
  prev=$cur; n=$((n+1))
done

# Maps only: pull the results sheet up so the swipes scroll the list, not the map
if [ "$APP" = maps ]; then
  input swipe $X $((H*62/100)) $X $((H*12/100)) 600; sleep 1.8
fi

# ---- step 6: scroll slowly to the bottom, dumping every stop -----------------
# short, slow swipes (a third of the screen over 0.9 s) overlap each other, so no
# listing is skipped between dumps; stop when the content no longer changes
prev=""; i=0
while [ $i -lt $MAX_STOPS ]; do
  dump "$D/dump_$i.xml"; cur=$(h "$D/dump_$i.xml")
  if [ $i -gt 0 ] && [ "$cur" = "$prev" ]; then
    rm -f "$D/dump_$i.xml"
    break
  fi
  prev=$cur
  input swipe $X $((H*72/100)) $X $((H*40/100)) 900; sleep 1.4
  i=$((i+1))
done
echo "stops=$i" >> "$D/meta.txt"

# ---- quality flags -----------------------------------------------------------
: > "$D/flags.txt"
for f in "$D"/dump_*.xml; do
  [ -f "$f" ] || continue
  if grep -qiE "unusual traffic|not a robot|verify you are human" "$f"; then echo "captcha $(basename $f)" >> "$D/flags.txt"; fi
done
if [ "$APP" = maps ]; then
  for f in "$D"/dump_[1-9].xml; do   # Fix 2: never dump_0
    [ -f "$f" ] || continue
    if grep -qi "Search this area" "$f"; then echo "map_drift $(basename $f)" >> "$D/flags.txt"; fi
  done
fi
rm -f "$D/probe.xml" "$RT/fre.xml"

# ---- step 9: wait for screenrecord to flush (time floor + process check) -----
while [ $(( $(date +%s) - REC_START )) -lt $((REC_SECS + 2)) ]; do sleep 1; done
w=0
while [ $w -lt 20 ]; do
  if pidof screenrecord >/dev/null 2>&1 || pgrep -f "screenrecord --time-limit" >/dev/null 2>&1; then
    sleep 1; w=$((w+1))
  else
    break
  fi
done
echo "t_end=$(date +%s)" >> "$D/meta.txt"

# ---- package the dumps (video stays a separate object) -----------------------
cd "$PD" || exit 1
TARLIST="$TAG/meta.txt $TAG/flags.txt"
for f in "$TAG"/dump_*.xml; do [ -f "$f" ] && TARLIST="$TARLIST $f"; done
ARCHIVE_TMP="$PD/$TAG.tar.gz.tmp"
if ! tar -czf "$ARCHIVE_TMP" $TARLIST 2>/dev/null; then
  if ! tar -cf "$PD/$TAG.tar" $TARLIST || ! gzip -c "$PD/$TAG.tar" > "$ARCHIVE_TMP"; then
    echo packaging_failed > "$D/status"; exit 1
  fi
fi
# Do not upload an empty or truncated archive as a successful capture.
# Android Toybox gzip has no -t option; a full decompression checks integrity.
if [ ! -s "$ARCHIVE_TMP" ] || ! gzip -dc "$ARCHIVE_TMP" >/dev/null 2>&1; then
  echo packaging_failed > "$D/status"; exit 1
fi
mv "$ARCHIVE_TMP" "$PD/$TAG.tar.gz" || { echo packaging_failed > "$D/status"; exit 1; }
echo packaged > "$D/status"

# ---- upload directly from the phone (presigned R2 PUT) -----------------------
if [ -n "$UPLOAD_TAR" ]; then
  if ! command -v curl >/dev/null 2>&1; then
    echo no_curl > "$D/status"; exit 0
  fi
  if curl -sS -f --max-time 60 -X PUT -T "$PD/$TAG.tar.gz" "$UPLOAD_TAR"; then
    echo tar_uploaded > "$D/status"
  else
    echo upload_failed > "$D/status"; exit 1
  fi
  if [ -n "$UPLOAD_VIDEO" ] && [ -s "$D/video.mp4" ]; then
    curl -sS -f --max-time 120 -X PUT -T "$D/video.mp4" "$UPLOAD_VIDEO" \
      && echo uploaded > "$D/status" \
      || echo video_upload_failed > "$D/status"
  else
    echo uploaded > "$D/status"
  fi
  exit 0
fi
echo done > "$D/status"
