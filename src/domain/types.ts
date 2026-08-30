export type Game = 'VGC' | 'GO' | 'TCG';
export type RatingZoneId = 'NA' | 'EU' | 'LA' | 'AP' | 'SO';
export type AgeDivision = 'MASTERS';

export type PlacementBand = {
  minPlace: number;
  maxPlace: number;
  /** Minimum competitors required before this band pays out. 0 means always. */
  kicker: number;
  points: number;
};

export type EventScale = 'local' | 'major' | 'online';

export type EventTypeRule = {
  id: string;
  label: string;
  shortLabel: string;
  games: Game[];
  scale: EventScale;
  bflBucket: string;
  bflBucketLabel: string;
  bestFinishLimit: number | null;
  table: string;
  manualTemplate: boolean;
  /** Placements 1..N earn a direct Worlds invitation. 0 means none. */
  directInvitePlacesThrough: number;
  note?: string;
};

export type RatingZone = { id: RatingZoneId; label: string };

export type SeasonRules = {
  season: number;
  rulesVersion: string;
  verifiedAt: string;
  verifiedBy: string;
  sourceUrls: string[];
  ratingZones: RatingZone[];
  invitationSlots: Record<Game, Record<RatingZoneId, number>>;
  leaderboardProduct: Record<Game, string>;
  leaderboardDivision: Record<Game, string>;
  directInviteNotes: string[];
  placementTables: Record<string, PlacementBand[]>;
  eventTypes: EventTypeRule[];
};

export type PlannedEvent = {
  id: string;
  name: string;
  eventTypeId: string;
  date: string | null;
  /** Exact final standing, a positive integer. */
  placement: number | null;
  /**
   * Legacy. Nothing scores from CP since v2.8; this is read once at load and
   * converted into a placement and a turnout, then never written again.
   */
  awardedPoints?: number | null;
  /**
   * Players in the field. Null means "use the default for this event type",
   * which is what the Players field shows until it is edited.
   */
  attendance: number | null;
  /** Set when the row came from the published catalog rather than manual entry. */
  catalogName?: string;
  /** How the date reads when only a month is published, e.g. "September 2026". */
  displayDate?: string;
};

export type ZoneBaseline = { attendance: number; events: number; basis: string };
export type IcBaseline = { attendance: number; zone: RatingZoneId; seasons: number; basis: string };

export type AttendanceBaselines = {
  season: number;
  previousSeason: number;
  retrievedAt: string;
  statistic: 'median';
  description: string;
  provenance: string;
  onlineEvents: string;
  observations: Record<string, Record<string, { events: number; min: number; max: number }>>;
  /** Assumed turnout at a Cup or Challenge, for the ladder and for scoring. */
  assumedLocalField?: Record<string, { attendance: number; deepestPaying: string }>;
  /**
   * Stated field sizes, by game and then event type id, overriding the observed
   * baselines. An online type with no entry here meets every kicker instead —
   * there is no number to argue with, which is how the globally ranked GO
   * leaderboard is treated.
   */
  assumedField?: Record<string, Record<string, number> | string>;
  baselines: Record<Game, {
    zones: Partial<Record<RatingZoneId, ZoneBaseline>>;
    internationals: Record<string, IcBaseline>;
    unavailable?: boolean;
  }>;
};

/** One published major, offered by the catalog checklist. */
export type CatalogEvent = {
  name: string;
  date: string;
  /** How the date reads when only the month is published, e.g. "September 2026". */
  displayDate?: string;
  datePrecision?: 'day' | 'month';
  location?: string;
  country?: string | null;
  zone: RatingZoneId | null;
  category: 'regional' | 'special' | 'international' | 'online';
  /** Set when the catalog entry names its own event type, as online events do. */
  eventTypeId?: string;
  games?: Game[];
  status: 'upcoming' | 'completed';
  rk9?: Partial<Record<Game, string>>;
  game?: Game;
  /** Masters players per game, counted from the rk9 roster once the event has run. */
  attendance?: Partial<Record<Game, number>>;
};

export type EventsCatalog = {
  season: number;
  retrievedAt: string;
  sources: Record<string, string>;
  note: string;
  upcoming: CatalogEvent[];
  online: CatalogEvent[];
  completed: CatalogEvent[];
};

export type Cutoffs = {
  season: number;
  description: string;
  sourceUrl: string;
  periodGuid: string;
  retrievedAt: string;
  boundaries: Record<Game, Record<RatingZoneId, {
    rank: number; championshipPoints: number; calculationDate: string | null; totalRanked: number | null;
  } | null>>;
};

export type LeaderboardSnapshot = {
  season: number;
  periodPublished: boolean;
  periodGuid?: string;
  sourceUrl?: string;
  retrievedAt: string | null;
  lastAttemptAt?: string;
  lastAttemptOk?: boolean;
  lastError?: string;
  note?: string;
  boundaries: Cutoffs['boundaries'] | null;
};

export type QualificationPath = {
  id: string;
  schemaVersion: 1;
  name: string;
  game: Game;
  ratingZone: RatingZoneId;
  ageDivision: AgeDivision;
  /** Manual override of the planning target. */
  targetOverride: number | null;
  events: PlannedEvent[];
  updatedAt: string;
};

/** Why a result does or does not contribute to the seasonal total. */
export type ResultReason =
  | 'counts'
  | 'planned-counts'
  | 'excluded-by-bfl'
  | 'below-kicker'
  | 'unverified-attendance'
  | 'invalid'
  | 'incomplete';

export type EvaluatedResult = {
  event: PlannedEvent;
  rule: EventTypeRule;
  band: PlacementBand | null;
  /** CP the result is worth before the Best Finish Limit is applied. */
  rawPoints: number;
  counted: boolean;
  reason: ResultReason;
  /** Human-readable explanation shown on the row. */
  explanation: string;
  /** Set when the result earns a direct Worlds invitation. */
  directInvite: boolean;
  /** Unused since v2.8: the turnout a row scored against is shown on the row. */
  conditional: boolean;
  /** Turnout actually used, and whether the player supplied it. */
  attendanceUsed: number | null;
  attendanceSource: 'entered' | 'baseline' | 'unknown';
  /** A validation problem the player must fix. */
  error: string | null;
};

export type BucketSummary = {
  bucket: string;
  label: string;
  bestFinishLimit: number | null;
  slotsUsed: number;
  countedPoints: number;
  /** CP the weakest counted result is worth — what a new result must beat. */
  weakestCountedPoints: number | null;
  /** CP a new result needs to improve this bucket at all. */
  pointsToImprove: number | null;
};

export type Evaluation = {
  results: EvaluatedResult[];
  currentTotal: number;
  projectedTotal: number;
  buckets: BucketSummary[];
  directInvites: EvaluatedResult[];
  errors: { eventId: string; message: string }[];
};
