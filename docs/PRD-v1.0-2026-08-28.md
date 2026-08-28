# Championship Points Calculator — Product Requirements Document

**Status:** Phase 0 complete / ready for implementation  
**Season:** 2027 Play! Pokémon Championship Series  
**Primary user:** Masters Division player pursuing a Worlds invitation through VGC, Pokémon GO, or TCG  
**Document date:** 2026-08-28

## 1. Product definition

Championship Points Calculator is a public, mobile-friendly qualification planning tool with a deterministic CP calculator underneath. It helps a Masters Division player choose one game and rating zone, add only the tournaments they can attend, record completed results, model exact finishes at future events, and generate paths toward a Worlds qualification target.

The application must implement event kickers and Best Finish Limits (BFLs), not merely add points. It must also distinguish CP-based qualification from direct invitations earned through qualifying event finishes.

### Project controls

- **Project name:** Championship Points Calculator
- **Phase 0 stop condition:** This PRD is produced.
- **Product success criterion:** A basic calculator web app is tested, committed to a public GitHub repository, and deployed through GitHub Pages.
- **MVP completion condition:** A user can create a game-specific path, add completed and feasible future events, receive a correct BFL-adjusted CP total, generate three deterministic attainment paths, see the gap to a live/configurable target, and save the path locally.

## 2. Problem

Players cannot reliably plan a Worlds run by adding the published CP value for every tournament they intend to attend. CP depends on:

- event type;
- final placement;
- attendance-based kickers;
- separate or shared BFL buckets;
- results already occupying a BFL slot;
- selected game and rating zone;
- direct-invite finishes; and
- an unknown, moving season-end leaderboard cutoff.

Spreadsheet arithmetic is possible but error-prone, especially when a new result displaces an older result in a BFL bucket. Existing season structure pages explain the rules but do not answer the personal planning question: **“Given my current results and proposed events, what counts, what gets displaced, and what results would put me near my target?”**

## 3. Critical product truth

The reported 2026 90th-place total of **842 CP** is a historical benchmark supplied by the project owner. It is not an official 2027 threshold and must never be labeled “points needed to qualify.”

The product supports only the **Masters Division** in the MVP, but lets the player select an eligible rating zone and one qualification game: VGC, Pokémon GO, or TCG. CP never combine across games; a user creates a separate locally stored path for each game.

The UI will therefore use:

- **Previous-season cutoff**, selected by game, rating zone, and Masters invitation boundary;
- **Live boundary**, read daily from the official leaderboard at the invitation-slot rank for that game and region;
- **Planning target**, the greater of the previous-season cutoff and live boundary, but freely editable; and
- labels that say “target reached,” never “Worlds qualified,” unless a direct invitation has been entered.

The product will not invent a default “safety target.” A useful safety margin would require historical cutoff variation or a defensible forecast model; adding an arbitrary percentage would imply evidence that does not exist.

## 4. Goals and non-goals

### MVP goals

1. Correctly calculate earned CP for 2027 VGC, Pokémon GO, and TCG Masters events.
2. Correctly apply kickers and each separate/shared BFL.
3. Show which results count, which do not, and which result a hypothetical finish displaces.
4. Support completed results and planned/hypothetical results in the same qualification path.
5. Show current total, projected total, and target gap.
6. Generate three deterministic paths using only added events and user-defined finish limits.
7. Keep separate qualification paths for different games.
8. Work without login or cloud persistence.
9. Deploy as a public web application.

### Non-goals for MVP

- Predicting a final 2027 cutoff beyond the official live leaderboard boundary.
- Claiming a probability of qualification.
- Scraping a player’s official account or leaderboard.
- Deciding whether a tournament is feasible for the player.
- Travel booking, routing, or budget optimization.
- Match win-rate-to-placement simulation.
- Accounts, cloud synchronization, or private user data.
- Supporting Junior or Senior divisions.

## 5. Users and core jobs

### Primary persona

A Masters player planning one independent VGC, Pokémon GO, or TCG qualification path using only events they can attend.

### Jobs to be done

- “Given my actual finishes, calculate the CP that currently counts.”
- “If I place Top 64 at one more Regional, tell me whether it improves my total.”
- “Show me how many points remain to my planning target.”
- “Using only the events I added, show me the least demanding set of finishes that reaches my target.”
- “Show me the fewest-event path and the path that best uses events I marked committed.”
- “Explain why a result earned CP but did not increase my seasonal total.”
- “Let me export the exact path for backup or sharing.”

## 6. Rules model

All season rules must live in a versioned data file, not inside UI components.

```ts
type SeasonRules = {
  season: 2027;
  game: "VGC" | "GO" | "TCG";
  updatedAt: string;
  sourceUrls: string[];
  ratingZones: RatingZone[];
  invitationSlots: Record<RatingZone, Record<AgeDivision, number | null>>;
  eventTypes: EventTypeRule[];
};

type QualificationPath = {
  id: string;
  game: "VGC" | "GO" | "TCG";
  ratingZone: RatingZone;
  ageDivision: "MASTERS";
  historicalCutoff: number;
  liveBoundary: number | null;
  targetOverride?: number;
  attendanceAdjustment: number;
  events: PlannedEvent[];
};

type EventTypeRule = {
  id: string;
  label: string;
  bflBucket: string;
  bestFinishLimit: number | null;
  placements: {
    minPlace: number;
    maxPlace: number;
    kicker: number;
    points: number;
    directInvite?: boolean;
  }[];
};
```

### Required 2027 event categories

| Category | BFL behavior | Direct-invite behavior |
|---|---:|---|
| League Challenge | Best 4; separate bucket | None |
| League Cup | Best 4; separate bucket | None |
| VGC Global Challenge / eligible VGC online competition | Game-specific published BFL | None |
| GO Battle League Leaderboard Challenge | Game-specific published BFL | None |
| Regional Championship | Shared major-event BFL of 5 | Champion receives direct invite |
| Special Championship | Shared major-event BFL of 5 | Champion receives direct invite |
| International Championship | Shared major-event BFL of 5 | Four finalists in each age division receive direct invites |

The rules file must preserve the published placement bands, kickers, and points exactly. The initial verified Regional/Special table is:

| Placement | Kicker | CP |
|---:|---:|---:|
| 1 | 0 | 350 |
| 2 | 4 | 325 |
| 3–4 | 8 | 300 |
| 5–8 | 17 | 280 |
| 9–16 | 33 | 200 |
| 17–32 | 65 | 160 |
| 33–64 | 129 | 120 |
| 65–128 | 257 | 80 |
| 129–256 | 513 | 60 |
| 257–512 | 1,025 | 45 |
| 513–1,024 | 2,049 | 22 |

Before implementation is marked complete, every applicable VGC, GO, and TCG event table must be transcribed from the official 2027 pages and covered by fixtures. Event types that do not apply to the selected game must not appear. Values are **configuration**, because the official pages explicitly state that CP values may change.

### Attendance and local-result model

- For a completed Cup, Challenge, or equivalent manual event, exact placement plus CP actually awarded is sufficient. Total roster is optional because a positive published CP award proves that the applicable kicker was met.
- The calculator may infer only the attendance lower bound implied by the kicker; it must not claim to know actual attendance.
- If the user supplies placement without awarded CP and the placement's payout depends on a nonzero kicker, require either total attendance or the awarded CP value.
- Validate placement and awarded CP against the official table. If they are inconsistent, request correction; roster size must not be used to legitimize an impossible placement/CP combination.
- For a completed local result with 0 CP, roster remains optional. The result contributes 0 regardless of whether the cause was an unmet kicker, but the UI may label the reason unresolved.
- For a future Cup or Challenge, the user may either provide assumed attendance or select a hypothetical CP outcome. Selecting positive CP means “assuming the applicable kicker is met” and must be labeled accordingly.
- For future Regionals and Internationals, the default projected attendance is the **single lowest Masters attendance observed during the previous season**, maintained separately by game and major-event category.
- The player may raise this projected attendance with an `attendanceAdjustment` control. This changes assumed attendance, not the official kicker thresholds.
- The UI must show the baseline, adjustment, resulting estimate, source season, and which CP bands become available at that attendance.
- Completed major events always replace estimates with actual attendance.

### Calculation algorithm

For each result:

1. Resolve the placement band for the event type.
2. For a completed local result with awarded CP, validate that value against the placement band and use it directly. A positive valid award implies only that attendance met the kicker's minimum.
3. Otherwise, if known or assumed attendance is below that band’s kicker, award 0 CP and record the reason; if the user selected a hypothetical positive CP outcome, mark it conditional on the kicker being met.
4. Otherwise assign the published raw CP.
5. Group results by `bflBucket`.
6. Sort each group by raw CP descending, then by stable input order for ties.
7. Count only the highest `bestFinishLimit` results; mark the remainder “earned but excluded by BFL.”
8. Sum counted CP across all buckets.
9. Calculate displacement: compare counted-result IDs before and after adding each planned result.
10. Calculate gaps as `max(0, target - projectedTotal)`.
11. Exclude direct-invite finishes from ordinary generated CP paths. If no CP path can reach the target using the added events, report infeasibility and separately identify a direct-invite finish only when it is the sole remaining mathematical route among those events.

Completed and planned results use the same arithmetic but display separately. A planned result cannot change the displayed **current CP**; it changes only **projected CP**.

## 7. Functional requirements

### FR-1: Path settings

The MVP is fixed to the 2027 season and Masters Division. The user selects a rating zone and exactly one game. The default planning target is `max(previousSeasonCutoff, liveBoundary)`. The live boundary is refreshed daily from the official leaderboard at the invitation-slot rank for the selected game/region. The last valid value is retained when refresh fails. Users may override the target.

When current or projected CP is below the previous-season cutoff, show a disclaimer that the plan has not yet reached the previous season's minimum qualifying total. Meeting or exceeding either benchmark must not be described as guaranteed qualification.

### FR-2: Result entry

The user can add, edit, duplicate, reorder, and delete a result with:

- status: completed or planned;
- event name (optional);
- event type;
- date (optional);
- exact final placement as a positive integer;
- CP actually awarded for a completed local result, or hypothetical CP outcome for a planned local result;
- total attendance in the relevant game/division only when supplied voluntarily or needed to resolve a kicker-dependent placement without an awarded/hypothetical CP value;
- availability: added or completed;
- commitment: optional or committed;
- best finish the generator may assume for this event or event category;
- notes (optional).

The engine maps the exact placement to the applicable published placement band. The UI shows both values, for example, “13th place → 9–16 band.” For completed Cups and Challenges, exact placement plus awarded CP is the preferred input; roster size is optional. If awarded CP is omitted and the mapped band has a nonzero kicker, attendance is required to derive CP. For future locals, a hypothetical positive CP value is labeled “assuming kicker is met.” Major planned events continue to use the historical-low attendance model. Planned results use an exact hypothetical placement even though all placements within a band award the same CP.

### FR-3: Event catalog and selection

- Show all published major events applicable to the selected game after the user applies catalog filters.
- Only events explicitly added by the player may participate in calculations or generated paths.
- Removing an uncompleted event removes it immediately from all generated paths.
- Support manual events with templates for League Cups and League Challenges.
- Do not infer feasibility from travel, cost, registration, or availability data.
- Each added future event is available but optional; the player may mark it committed.

### FR-4: Path generation

Generate three deterministic solutions using only added events, applicable payout tables, kickers, BFLs, and player-defined best-finish constraints:

1. **Least demanding placements (default):** lexicographically minimize the strongest required finish, then the number of finishes at that difficulty, then total placement-band difficulty, then event count.
2. **Fewest events:** minimize the number of events needed to reach the target, then use placement difficulty as the tie-breaker.
3. **Best use of planned events:** maximize use of committed events and minimize additional optional events, then use placement difficulty as the tie-breaker.

If no CP path reaches the target, show the maximum attainable CP from the selected events and the remaining gap. Do not fabricate additional events or recommend direct-invite finishes as normal paths.

### FR-5: Calculation summary

Display:

- current counted CP;
- projected counted CP;
- planning target and remaining gap;
- CP subtotal per BFL bucket;
- number of occupied BFL slots per bucket.

### FR-6: Explainability

Every result row must show raw CP and one of:

- Counts toward total;
- Planned—would count;
- Excluded by BFL;
- Below kicker;
- Unverified attendance;
- Direct invitation earned on a completed result.

When a planned result displaces another result, show: “This result adds **X net CP** by replacing **[result]** worth **Y CP**.”

### FR-7: Persistence and sharing

- Autosave locally with `localStorage`.
- Store multiple independent paths locally; each path belongs to exactly one game.
- Export/import a versioned JSON path for backup or sharing.
- No personal identifier is required.

### FR-8: Source transparency

The application displays season rules version, last verified date, official source links, and a visible notice when the rules data is stale or manually overridden.

## 8. UX framework

### Page structure

1. **Header:** product name, game/rating-zone selector, path switcher, rules version.
2. **Target strip:** previous cutoff, live boundary, active target, current CP, projected CP, and gap.
3. **Event catalog:** filtered published majors plus manual Cup/Challenge templates and “Add” actions.
4. **Plan table:** completed and added future events, commitment state, exact/maximum modeled finishes, attendance source, and count/exclusion explanations.
5. **Generated paths:** least demanding, fewest events, and best use of committed events.
6. **BFL breakdown:** bucket occupancy and the next result needed to improve each bucket.
7. **Methodology/footer:** assumptions, attendance baseline, sources, limitations, and export/import.

### Accessibility

- WCAG 2.2 AA color contrast.
- All calculator actions usable by keyboard.
- Status never communicated by color alone.
- Native form controls and explicit labels.
- Responsive at 320 px width.
- Reduced-motion support.

## 9. Technical framework

### Recommended MVP stack

- React + TypeScript + Vite.
- Pure calculation module with no browser dependencies.
- Zod (or equivalent) for rules/path validation.
- Vitest for unit and fixture tests.
- Playwright for one end-to-end smoke test.
- Static deployment through GitHub Actions to GitHub Pages.
- No backend.

A framework-free TypeScript app would also work, but React is justified by editable rows, derived summaries, and path state. The decisive constraint is not framework choice; it is keeping the rules engine pure and the rules data external.

Because GitHub Pages cannot be trusted to scrape the official leaderboard from every user's browser, a scheduled GitHub Action should retrieve the official leaderboard daily, validate the required boundary rows, update a static versioned JSON snapshot, and redeploy. On failure it must preserve the last valid snapshot and record the failed refresh. This retains a static application without requiring user accounts or a runtime backend.

### Suggested repository structure

```text
championship-points-calculator/
├── .github/workflows/deploy.yml
├── public/
├── src/
│   ├── data/2027-vgc.json
│   ├── data/2027-go.json
│   ├── data/2027-tcg.json
│   ├── data/cutoffs.json
│   ├── data/attendance-baselines.json
│   ├── domain/calculate.ts
│   ├── domain/schema.ts
│   ├── domain/types.ts
│   ├── components/
│   ├── pages/
│   └── app.tsx
├── tests/
│   ├── fixtures/
│   ├── calculate.test.ts
│   └── smoke.spec.ts
├── README.md
└── package.json
```

## 10. Acceptance criteria

### Arithmetic

- A below-kicker finish yields 0 and explains why.
- A qualifying placement at or above the kicker yields the correct published CP.
- A fifth League Challenge result replaces the weakest of the prior four only when stronger.
- League Challenge and League Cup BFLs are calculated separately.
- Regional, Special, and International results share one five-result major-event bucket.
- A sixth major result counts only if it displaces a weaker counted major result.
- A planned result affects projected CP but not current CP.
- Ties do not cause nondeterministic inclusion.
- Direct invitation status is independent of whether the result increases BFL-adjusted CP.
- Results never cross between game-specific paths.
- Generated paths use only explicitly added events and respect best-finish constraints.
- The default generated result satisfies the defined least-demanding lexicographic ordering.
- Planned Regional/International kicker calculations use the correct previous-season historical-low baseline plus the user's attendance adjustment.
- A completed Cup/Challenge accepts valid placement plus awarded CP without requiring total attendance.
- A positive valid local CP award records only that the official kicker minimum was met, not an invented actual roster.
- Placement-only local entry requires attendance only when the applicable payout is kicker-dependent.
- Impossible placement/CP combinations are rejected.
- Planned positive local CP outcomes without attendance are visibly conditional on the kicker being met.

### Example fixtures

1. Four counting League Challenge results plus a weaker fifth result: net change 0.
2. Four counting League Challenge results plus a stronger fifth result: net change equals new CP minus displaced CP.
3. Five mixed Regional/International results plus a sixth major result: only the best five count.
4. Top 512 Regional finish with 1,024 players: 0 CP; with 1,025 players: 45 CP.
5. Regional win: correct raw CP and direct invitation, but omitted from ordinary generated CP paths.
6. A VGC US/Canada projected total of 842: historical benchmark reached, but no claim of qualification.
7. Removing an added event removes it from every generated path.
8. If the live boundary exceeds the prior cutoff, the live boundary becomes the default target after refresh.
9. A completed 13th-place Cup result with the valid published CP award saves without roster size and contributes correctly to its BFL bucket.
10. A 13th-place local result entered without CP or attendance prompts for one of those values when the payout has a nonzero kicker.

### Release

- All rules fixtures pass.
- No high-severity accessibility issue in automated audit.
- Production build succeeds from a clean checkout.
- GitHub Pages URL loads directly and after refresh.
- Repository is public and README explains data sources, limitations, local setup, and rules-update procedure.

## 11. Analytics and product success

No behavioral analytics are required for MVP. If added later, use privacy-preserving aggregate events only.

Useful measures after launch:

- calculator completion rate;
- paths saved/exported;
- share links opened;
- rules-data errors reported;
- percentage of sessions using custom targets.

The principal quality measure is **zero known scoring errors**, not traffic.

## 12. Risks and mitigations

| Risk | Consequence | Mitigation |
|---|---|---|
| Official CP tables change mid-season | Incorrect plans | Versioned rules file, visible verification date, fixture update checklist |
| 842 is treated as guaranteed cutoff | False confidence | Historical benchmark labeling, editable planning target, no “qualified” claim |
| Direct invites alter effective leaderboard dynamics | Misleading cutoff interpretation | Exclude them from ordinary paths; surface only when no CP path is feasible |
| User enters event capacity instead of actual attendance | Wrong kicker result | Keep attendance optional when awarded CP resolves the result; otherwise label “actual players in this game/division” and validate |
| Placement/tie semantics are misunderstood | Wrong CP band | Use official final standing; placement-band picker with examples |
| Historical-low attendance is missing or misclassified | Incorrect projected kickers | Store provenance by season/game/category, permit override, and show conditional results |
| Leaderboard retrieval fails | Stale or missing target | Daily refresh, last-valid-value retention, timestamp, and source link |
| Feature growth delays launch | No usable calculator | Lock MVP to deterministic calculations and one working plan |

## 13. Implementation sequence

1. Transcribe and independently verify official 2027 VGC, GO, and TCG Masters rules into separate versioned data files.
2. Write schema validation and golden fixtures before UI work.
3. Implement the pure calculation/BFL/displacement engine.
4. Build game/region/path selection, the event catalog, manual templates, and result entry.
5. Implement historical-low attendance baselines and adjustments.
6. Implement the three deterministic path optimizers.
7. Add local persistence and JSON export/import.
8. Add daily leaderboard refresh with last-valid-value retention.
9. Add responsive/accessibility polish.
10. Configure deployment and public README.
11. Run acceptance tests against published examples and manually verify the live page.

## 14. Deferred roadmap

### Phase 2

- Junior and Senior division support.
- Side-by-side comparison between saved game-specific paths.
- Historical cutoff and leaderboard-boundary charts.
- Additional event-catalog automation if reliable official feeds become available.

## 15. Source of truth

The CP distributions come from the official Play! Pokémon 2027 Championship Series webpages listed below. Those pages publish each event type's placement bands, attendance kickers, CP awards, BFL, and direct-invitation rules. The calculator's production data must be manually transcribed from those official tables, independently checked by a second pass, and locked with test fixtures. Search-result snippets or community tables are not sufficient production evidence.

Official sources take precedence over community summaries:

- [2027 season changes](https://championships.pokemon.com/en-us/about/2027-season-changes)
- [Championship Series overview and BFL explanation](https://championships.pokemon.com/en-us/about/)
- [League Challenges and League Cups](https://championships.pokemon.com/en-us/about/league-challenges-and-league-cup)
- [VGC Global Challenge and Grand Challenge](https://championships.pokemon.com/en-us/about/pokemon-vgc-global-challenge-grand-challenge)
- [Pokémon GO Battle League Leaderboard Challenges](https://championships.pokemon.com/en-us/about/pokemon-pgo-gbl-leaderboard-challenge)
- [Regional and Special Championships](https://championships.pokemon.com/en-us/about/pokemon-regional-and-special-championships)
- [International Championships](https://championships.pokemon.com/en-us/about/international-championships)
- [Official Championship Series leaderboards](https://championships.pokemon.com/en-us/competitors/leaderboards)

Secondary cross-checks:

- [Victory Road: 2027 season structure](https://victoryroad.pro/2027-season-structure/)
- [VGC Guide: Championship Points and FAQ](https://www.vgcguide.com/cp-and-faq)

Victory Road is used only to catch transcription mistakes and to provide a readable season overview. VGC Guide explains the general BFL concept and gives examples, but much of its CP material predates the 2027 season. The attached tournament handbook and VGC rules documents govern tournament operations and gameplay, not the 2027 CP payout schedules. None of those secondary or attached materials may override an official 2027 table.

## 16. Resolved product decisions and final data questions

Resolved:

1. The MVP supports Masters only, with selectable eligible rating zones.
2. Each path covers exactly one of VGC, Pokémon GO, or TCG; users may save multiple independent paths locally.
3. There is no arbitrary safety target. The default is the greater of the prior-season final cutoff and current official leaderboard boundary.
4. Users enter exact placements, and the calculator maps them to published CP bands.
5. Only explicitly added events are feasible. Added future events are optional unless marked committed.
6. The catalog includes filtered published majors plus manual Cup and Challenge templates.
7. There is no manual starting-CP field; every point must be supported by an event result.
8. The generator returns least-demanding, fewest-event, and best-use-of-committed-event paths, defaulting to least demanding.
9. The player constrains the best finish the generator may assume.
10. No cost, travel, registration, or probability modeling is included.
11. Data persist locally with JSON export/import; there are no accounts.

Two data-definition questions remain before implementation:

1. Whether the previous-season historical-low attendance baseline is calculated separately for **Regional/Special** and **International** events. Recommended: separate them because their field sizes differ materially.
2. Whether the baseline is also separated by rating zone. Recommended: separate by game and event category, but not by the player's home rating zone; kicker eligibility depends on attendance at the selected event, not the player's home zone.
