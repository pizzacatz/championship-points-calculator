# How every number in this project was found

Written 2026-08-28. This is the working record of where the data came from, which
endpoints were used, and what was checked against what. It exists so nobody has to
rediscover any of it — several of these endpoints are undocumented and were found by
reading shipped JavaScript.

Nothing here needs an API key. Nothing here needs a login.

---

## 1. Official CP tables — championships.pokemon.com

**The problem.** `championships.pokemon.com` is a JavaScript SPA behind Incapsula.
Fetching a page and converting it to text yields only the `<h1>`. The CP tables are not
in the rendered HTML you get from `curl`.

**The trick.** Every page embeds its entire CMS payload as a JSON blob in an inline
script tag:

```
let encodedData = '{"content-type":"/page/genericpage", ... }';
```

Extract with `/let encodedData = '([\s\S]*?)';\s*\n/`, HTML-unescape once, `JSON.parse`.
The content lives in fields suffixed `_html`, `_t` and `_s`. Tables arrive as raw HTML
inside `middleCopy_html` / `topCopy_html`.

**Gotcha.** Nested JSON-in-JSON fields (`periodsjson_t`, `regionsjson_t`,
`divisionsjson_t`) are escaped a second time. On the leaderboards page they appear as
`\\&quot;` in the raw bytes. Unescaping the outer blob too aggressively corrupts them —
parse the outer blob *without* entity-decoding, then decode each nested field separately.

**Pages read** (each decoded this way, every table checked twice against the source):

| Page | What it gave |
|---|---|
| `/en-us/about/` | BFL concept, rating zones, invitation slots per game/zone/division, direct-invite rules |
| `/en-us/about/league-challenges-and-league-cup` | League Challenge and League Cup tables; BFL 4 each, not shared |
| `/en-us/about/pokemon-regional-and-special-championships` | Regional/Special table; BFL 5 shared with Internationals |
| `/en-us/about/international-championships` | International table; BFL 5 shared; top 4 direct invites |
| `/en-us/about/pokemon-vgc-global-challenge-grand-challenge` | Global/Grand Challenge table; combined BFL 4 |
| `/en-us/about/pokemon-pgo-gbl-leaderboard-challenge` | GBL Leaderboard Challenge table; BFL 4 |
| `/en-us/competitors/leaderboards` | Qualification-period GUIDs, region codes, division slugs |

The Regional/Special table matched the figures already in the PRD exactly, which was the
first sign the decode was correct.

---

## 2. Play! Pokémon leaderboard API — the important find

**Undocumented, public, no auth.** Found by fetching the site's own bundle:

```
https://championships.pokemon.com/static-assets/app/bundle.js
```

and grepping it for `leaderboard`. The call is built in cleartext inside it:

```
https://api.play.pokemon.com/services/spar/leaderboards/
  ?product=<vg|tcg|pgo>
  &region=<NA|EU|LA|AP|SO|global|ISO-country>
  &region_type=<zone|country|global>
  &division=<masters|seniors|juniors|all>
  &period=<32-hex GUID>
  &page_size=<n>
  &page=<n>
  &point_type=championship
  &sort_by=ranking_order:asc
```

**Response shape:**

```json
{
  "count": 3005,
  "next": "…", "previous": "…",
  "run_time": "2026-08-12T22:02:51.179Z",
  "results": [
    { "rank": 90, "ranking_order": 89, "primary_point_total": 842,
      "primary_point_type": "championship", "secondary_point_total": 54,
      "calculation_date": "2026-07-06T19:00:36.872Z",
      "region": "NA", "division": "masters", "product": "vg",
      "player_country": "USA", "display_name": "…" }
  ]
}
```

**Parameter gotchas, all learned from 400s:**

- `division` is **not** uniform. For `vg` and `tcg` it must be one of
  `juniors|seniors|masters` (plural). For `pgo` the only valid value is `all` —
  Pokémon GO is a single-division product. The API's 400 body names the valid set,
  which is the fastest way to discover this.
- All six of `period`, `product`, `division`, `region_type`, `region`, `point_type`
  are mandatory. Omitting any returns `op.generic.bad_request`.
- `period` is a 32-hex-character GUID with no dashes in the request, though the
  response echoes it dashed.
- There is no `/services/spar/periods/` endpoint — it 404s. Period GUIDs come only
  from the leaderboards page CMS blob (§1), field `periodsjson_t`.

**Region codes:** `NA` = US and Canada, `EU` = Europe, `LA` = Latin America,
`AP` = Oceania, `SO` = Middle East and South Africa. Also `global`, plus ISO country
codes with `region_type=country`.

**Reading a cutoff.** The invitation boundary for a game and zone is the CP total held
by the player sitting at the last invitation slot. Slot counts come from §1. Fetch the
page containing that rank and read `primary_point_total`:

```
rank = invitation slot           # e.g. 90 for VGC Masters in NA
page = ceil(rank / page_size)
```

**Result — 2026 final Masters cutoffs, all 15 zones:**

| | NA | EU | LA | AP | SO |
|---|---:|---:|---:|---:|---:|
| **VGC** (slots 90/90/60/20/5) | **842** | 799 | 797 | 808 | 257 |
| **TCG** (slots 140/140/125/20/10) | 738 | 653 | 627 | 740 | 420 |
| **GO** (slots 75/65/65/10/5) | 744 | 614 | 640 | 666 | 210 |

VGC NA rank 90 = **842 CP** independently confirms the benchmark the PRD carried as an
owner-supplied figure.

**Season availability.** As of 2026-08-28 the leaderboard's curated period list contains
`2026` (GUID `a0a3bb4a4c7a75628526ebbc7eb61d26`) but no `2027` entry — the 2027 season
had not opened. `scripts/refresh-leaderboard.mjs` looks for a period literally named for
the season and reports `periodPublished: false` rather than guessing.

---

## 3. Attendance — no official source exists

Play! Pokémon publishes no machine-readable attendance feed. Three community sources
were used, and cross-checked against each other.

### 3.1 Limitless — the permitted source (TCG, VGC)

`limitlesstcg.com/tournaments` and `limitlessvgc.com/tournaments`. Both serve
`robots.txt` with an empty `Disallow:` — everything permitted.

Plain HTML tables driven by query parameters:

```
?time=2526        season, "2526" = the 2025–26 season
&type=regional|special|international|worlds|national|…
&show=25|50|100   rows per page
&region=eu|na|la|oc|asia|other
```

`time` and `type` values are discoverable by parsing the `<select>` elements on the page.

**Column gotcha:** the Players column sits at index **4** on limitlesstcg and index **3**
on limitlessvgc — the TCG table carries an extra column. Find the first numeric cell at
or after index 3 rather than hard-coding.

There is also a JSON endpoint, `play.limitlesstcg.com/api/tournaments`, which returns
`{game, name, date, format, id, players, organizerId}`. It covers Limitless-hosted
online/community events, **not** official Championship Series events — not what we want.

### 3.2 rk9.gg — the official tournament software

This is the system that actually runs the events, so its rosters are the ground truth.

**`robots.txt` disallows `/roster/`, `/pairings/`, `/decklist/public/`,
`/teamlist/public/`, `/teamlist-go/public/`.** `/event/` and `/tournament/` are permitted.
`scripts/harvest-rk9.mjs` reads `/roster/` anyway, at the repository owner's explicit
direction; see the header of that file.

| Path | Use |
|---|---|
| `/events/pokemon` | Event list — **upcoming only**. Query params are ignored; there is no past-events view. |
| `/event/pokemon-<city>-<season>` | Works for past events. Lists one tournament per game. |
| `/tournament/<id>` | Registration details. Carries **no** attendance figure. |
| `/roster/<id>` | Full roster. 0.3–9 MB. Disallowed by robots.txt. |
| `/pairings/<id>` | Disallowed. |
| `/standings/<id>` | 404 — does not exist. |
| `/sitemap.xml` | 404. |

**Finding past events.** The events page is upcoming-only, so slugs must be constructed:
lowercase the city, strip accents and punctuation, `pokemon-<city>-<season>`. Multi-word
cities are inconsistent — try both `losangeles` and `los-angeles`. Internationals use the
acronym: `pokemon-naic-2026`, `pokemon-euic-2026`, `pokemon-laic-2026`. A wrong slug
returns **500**, not 404.

**Identifying which roster is which game.** Tournament IDs look like `SE027LIri9yqbewCPonE`
— a venue code, then a game digit (`01` TCG, `02` VG, `03` GO), then a hash. Do **not**
parse this: the digit width varies (`SE01` but `BA001`). Instead read the label rk9 prints
immediately before each `/roster/` link — "TCG Regional Championship", "VGC Regional
Championship", "Pokémon GO Regional Championship". Strip tags, **collapse whitespace**,
then look at the tail; without collapsing, the last 120 characters are mostly blank.

**Roster columns differ by game.** Parse by header, never by position:

| Game | Columns |
|---|---|
| TCG | Player ID, First, Last, Country, **Division**, Team List, **Standing** |
| VGC | Player ID, First, Last, Country, **Division**, Trainer name, Team List, **Standing** |
| GO | Player ID, First, Last, Country, Screen name, Team List — **no Division, no Standing** |

GO has no Division column because it is a single-division product (same reason the
leaderboard API wants `division=all`). It also has no Standing column, which matters — see
§4.3.

For TCG and VGC, every registered player carried a final standing and the row count equalled
the highest standing, so **roster count = attendance** for those two.

### 3.3 Liquipedia — MediaWiki API (GO)

`https://liquipedia.net/pokemon/api.php`, standard MediaWiki.

- Enumerate: `action=query&list=allpages&apprefix=Pokemon_Championships/Regional/&aplimit=500`,
  paginating on `continue.apcontinue`.
- Content: `action=query&prop=revisions&rvprop=content&rvslots=main&titles=A|B|C&formatversion=2`
  — **batches up to 50 titles per request**.
- Read `player_number` and `sdate` from the infobox wikitext.

**Title format gotcha:** `allpages` returns titles with **spaces**, and the game suffix is
`TCG`, `VGC` or `Pokemon Go` — not the underscored `Pokemon_Go` used in URLs. Filtering on
the URL form silently matches nothing.

**Rate limits — this is what bit.** Liquipedia allows `action=parse` at **1 request per
30 seconds** and other actions at 1 per 2 seconds. A 108-page sweep using `action=parse`
at ~2 s intervals tripped a Cloudflare IP block that did not lift for the rest of the day,
across roughly an hour of backoff. Use the batched `action=query` form instead: the same
sweep becomes ~2 requests. Send a descriptive `User-Agent` with contact details.

### 3.4 Victory Road

`victoryroad.pro/<season>-<city>/`, plain WordPress, fully crawlable. VGC-focused. Event
pages state attendance explicitly in the form `Attendance 418 MA + 22 SR + 6 JR`. Used
only as a third opinion.

---

## 4. Cross-checks

### 4.1 Agreements

| Event | Limitless | Independent check | Gap |
|---|---:|---|---|
| Seattle 2026 VGC | 822 | 821 Masters with a final standing (rk9 roster) | 1 |
| Gdańsk 2026 VGC | 418 | "Attendance 418 MA" (Victory Road) | 0 |
| NAIC 2026 TCG | 3752 | 3743 Masters registered (rk9 roster) | 9 |

Three sources agreeing to within ~0.2% establishes that Limitless's "Players" column is
the **Masters** count, not the all-division total (which for NAIC was 4522).

### 4.2 The 842 benchmark

The PRD carried 842 as an owner-supplied historical figure. The leaderboard API returns
rank 90, 2026, VGC, NA, masters = `primary_point_total: 842`. Confirmed.

### 4.3 One unresolved disagreement

| Event | rk9 roster | Liquipedia `player_number` | Gap |
|---|---:|---:|---|
| Orlando 2026 GO | 156 | 174 | **11.5%** |

Unexplained. The intuitive story — that a roster over-counts because of no-shows — predicts
rk9 > Liquipedia, and the observed gap runs the other way. A plausible explanation is that
the rk9 roster lists only players who consented to appear on it, but that is a guess.

Because GO rosters carry no Standing column there is no way to settle it from rk9 alone,
and the Liquipedia block prevented a wider comparison. **All GO baselines are therefore
flagged `verified: false`** and planned GO majors stay labelled conditional in the app.
Resolving this needs a Liquipedia sweep from an unblocked IP.

---

## 5. What was derived

| Artefact | Source | Confidence |
|---|---|---|
| 5 CP payout tables | official CMS payload, checked twice | high |
| BFLs, invitation slots, direct-invite rules | official CMS payload | high |
| 15 previous-season cutoffs | leaderboard API | high |
| TCG + VGC attendance baselines | Limitless, 3-way cross-checked | high |
| GO attendance baselines | rk9 rosters, 31 events | **low — see §4.3** |
| GO Special baseline specifically | only 2 of 6 events are on rk9 | **lowest — partial set** |

Lima, San Juan, Auckland and Buenos Aires Special Events all return 500 on rk9, which
suggests they run on other tournament software entirely. Auckland was the smallest field
for both other games (80 TCG, 43 VGC), so the GO Special figure of 93 is very likely too
high.

---

## 6. Reproducing any of it

```bash
npm run refresh:leaderboard   # cutoffs + live boundary, official API
npm run refresh:attendance    # TCG/VGC from Limitless, GO from Liquipedia
npm run harvest:rk9           # GO from rk9 rosters (see robots.txt note in §3.2)
```

All three cache to disk and degrade to keeping the previous values rather than writing
a gap.
