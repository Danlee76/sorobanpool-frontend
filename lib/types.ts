export interface Tier {
  minUnits: number;
  unitPrice: string; // stroops
}

export interface OfferView {
  id: string;
  title: string;
  brand: string | null;
  description: string;
  unitLabel: string;
  category: string;
  images: string[];
  moq: number;
  maxUnits: number;
  maxPerMember: number;
  leadTimeHours: number;
  tiersUsdc: Tier[];
  tiersNgn: { minUnits: number; priceNgn: string }[];
  validUntil: string;
}

export type PoolState = 'Open' | 'Filled' | 'Accepted' | 'Dispatched' | 'Delivered' | 'Settled' | 'Expired' | 'Failed' | 'Cancelled';

export interface PoolView {
  id: string;
  state: PoolState;
  shareSlug: string;
  offerId: string;
  organizer: string;
  supplier: string;
  supplierTier?: 'S0' | 'S1' | 'S2' | 'S3' | null;
  supplierSettledPools?: number | null;
  supplierDisputeRate?: number | null;
  hub: { address: string; contact: string };
  pickupWindow: { from?: string; to?: string };
  fillDeadline: string;
  totalUnits: number;
  receivedUnits: number | null;
  moq: number | null;
  maxUnits: number | null;
  members: number;
  membersList?: Array<Partial<PickupMember> & { displayName?: string | null; optedIn?: boolean }> | null;
  pickupMembers?: PickupMember[] | null;
  ngnPerUsd: number | null;
  filledAt: string | null;
  progressPct: number;
  currentUnitPriceUsdc: string;
  currentUnitPriceNaira: string | null;
  previousUnitPriceNaira?: string | null;
  currentTierLevel?: number;
  nextBreak: { unitsToGo: number; unitPriceUsdc: string } | null;
  tiersUsdc: Tier[];
  finalUnitPriceUsdc: string | null;
  offer: OfferView | null;
  trustMessage: string;
  myCommitment?: { units: number; paid: string; pickedUp: boolean } | null;
  /** Hours the supplier has to accept after the pool fills. Defaults to 24 when absent. */
  acceptWindowHours?: number;
  /** Refund breakdown fields */
  tierDifferenceRefund?: string;
  shortfallRefund?: string;
  disputeRefund?: string;
}

export interface PoolCard {
  id: string;
  state: PoolState;
  organizer: string;
  supplier: string;
  shareSlug: string;
  title: string | null;
  unitLabel: string | null;
  currentUnitPriceNaira: string | null;
  moq: number | null;
  totalUnits: number;
  progressPct: number;
  fillDeadline: string;
  hub: string;
}

export interface DisputeView {
  id: string;
  poolId: string;
  opener: string;
  state: 'OPEN' | 'RESOLVED' | 'TIMED_OUT';
  claimedAmount: string; // USDC decimal string
  openedAt: string;
  slaDueAt: string;
  msToSla?: number;
  /** Why the buyer opened the dispute (one of the report reasons). */
  reasonCode?: string;
}

export interface SupplierProfile {
  businessName: string;
  kybStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface RiskOverview {
  gmv: string;
  escrowHeld: string;
  poolsByState: Record<string, number>;
  failureRate7d: number;
  dispute7d: { disputes: number; deliveredPools: number; rate: number };
  bySupplier: { supplier: string; pools: number; disputes: number; disputeRate: number }[];
  pairs: { organizer: string; supplier: string; pools: number; shareOfOrganizer: number }[];
  flags: { kind: string; message: string; subject?: string }[];
  generatedAt: string;
}

export interface StatementLine { poolId: string; product: string; settledAt: string; unitsDelivered: number; gross: string; platformFee: string; organizerFee: string; net: string }
export interface Statement { lines: StatementLine[]; total: { gross: string; platformFee: string; organizerFee: string; net: string } }

export interface BondInfo {
  total: string;
  reserved: string;
}

/** A product category and whether the chain allows it. */
export interface CategoryRow {
  id: string;
  name: string;
  perishable: boolean;
  enabled: boolean;
  /** The on-chain allow-list entry, or null when the chain has no entry for this category yet. */
  onChain: boolean | null;
}

export interface RatingEntry {
  score: number;
  comment: string | null;
  ratedAt: string;
  itemName?: string;
}

export interface DisputeHistoryEntry {
  id: string;
  itemName?: string;
  outcome: 'WON' | 'LOST' | 'SETTLED';
  resolution?: 'REFUND' | 'REPLACE' | 'REJECT';
  openedAt: string;
  resolvedAt?: string;
}

export interface SupplierReputation {
  averageRating: number;
  totalRatings: number;
  completedPools: number;
  onTimeDeliveryPct: number;
  totalDisputes: number;
  disputesWon: number;
  recentRatings: RatingEntry[];
  disputeHistory: DisputeHistoryEntry[];
}

export type PickupStatus = 'pending' | 'collected';

export interface PickupMember {
  id: string;
  address?: string;
  displayName?: string | null;
  optedIn?: boolean;
  units: number;
  allocatedUnits: number;
  status: PickupStatus;
  pickedUp?: boolean;
  seq?: number;
  collectedAt?: string | null;
}

export interface PickupMemberEvent {
  type?: 'pickup' | 'member_collected';
  memberId: string;
  status: PickupStatus;
  units?: number;
  allocatedUnits?: number;
  seq?: number;
  timestamp?: number;
}

export type WalletActivityKind = 'pool_payment' | 'refund' | 'deposit';

export interface BaseWalletActivity {
  id: string;
  timestamp: string; // ISO date string
  amountUsdc: string; // stroops or USDC decimal string
  amountNaira?: string;
  poolId?: string;
  poolTitle?: string;
}

export interface PoolPaymentActivity extends BaseWalletActivity {
  kind: 'pool_payment';
  poolId: string;
}

export interface RefundActivity extends BaseWalletActivity {
  kind: 'refund';
  reason?: string;
}

export interface DepositActivity extends BaseWalletActivity {
  kind: 'deposit';
}

export interface UnknownActivity extends BaseWalletActivity {
  kind: 'unknown';
  rawKind?: string;
}

export type WalletActivity =
  | PoolPaymentActivity
  | RefundActivity
  | DepositActivity
  | UnknownActivity;
