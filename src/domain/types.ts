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

export type ResultStatus = 'completed' | 'planned';

export type PlannedEvent = {
  id: string;
  status: ResultStatus;
  name: string;
  eventTypeId: string;
  date: string | null;
  /** Exact final standing, a positive integer. */
  placement: number | null;
  /** CP actually awarded (completed) or the hypothetical outcome (planned). */
  awardedPoints: number | null;
  /** Actual players in this game/division, when the player supplied it. */
  attendance: number | null;
  committed: boolean;
  /** Best placement the path generator may assume for this event. */
  bestFinishConstraint: number | null;
  notes: string;
};

export type AttendanceBaselines = {
  season: number;
  verified: boolean;
  description: string;
  provenance: string;
  howToVerify: string;
  baselines: Record<Game, Record<'regional' | 'special' | 'international', {
    attendance: number | null; sourceEvent: string | null; verified: boolean;
  }>>;
  note: string;
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
  /** Added to the historical-low attendance baseline for planned majors. */
  attendanceAdjustment: number;
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
  /** True when positive CP is contingent on a kicker that has not been shown to be met. */
  conditional: boolean;
  /** Attendance actually used, and where it came from. */
  attendanceUsed: number | null;
  attendanceSource: 'entered' | 'baseline' | 'implied-by-award' | 'unknown';
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

export type Displacement = {
  eventId: string;
  netPoints: number;
  displacedEventId: string | null;
  displacedPoints: number;
  message: string;
};

export type Evaluation = {
  results: EvaluatedResult[];
  currentPoints: number;
  projectedPoints: number;
  buckets: BucketSummary[];
  displacements: Displacement[];
  directInvites: EvaluatedResult[];
  errors: { eventId: string; message: string }[];
};
