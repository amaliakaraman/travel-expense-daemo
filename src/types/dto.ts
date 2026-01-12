import { DaemoSchema } from 'daemo-engine';
import type { 
  TripStatus, 
  ItemType, 
  ViolationSeverity, 
  ViolationCode,
  ApprovalDecision,
  StructuredError 
} from './domain';

// =============================================================================
// SHARED COMPONENTS
// =============================================================================

@DaemoSchema({
  description: 'A travel trip record',
  properties: {
    id: { type: 'string', description: 'Unique trip ID (UUID)' },
    userId: { type: 'string', description: 'Owner user ID' },
    destinationCity: { type: 'string', description: 'Destination city name' },
    startDate: { type: 'string', description: 'Trip start date (YYYY-MM-DD)' },
    endDate: { type: 'string', description: 'Trip end date (YYYY-MM-DD)' },
    purpose: { type: 'string', description: 'Business purpose of the trip' },
    status: { type: 'string', description: 'Current status: draft | pending_review | approved | approved_exception | denied' },
    createdAt: { type: 'string', description: 'ISO timestamp of creation' },
  },
})
export class TripDTO {
  id: string = '';
  userId: string = '';
  destinationCity: string = '';
  startDate: string = '';
  endDate: string = '';
  purpose: string = '';
  status: TripStatus = 'draft';
  createdAt: string = '';
}

@DaemoSchema({
  description: 'A trip expense item',
  properties: {
    id: { type: 'string', description: 'Unique item ID (UUID)' },
    tripId: { type: 'string', description: 'Parent trip ID' },
    type: { type: 'string', description: 'Item type: flight | hotel | meal | transport' },
    description: { type: 'string', description: 'Human-readable description' },
    amountCents: { type: 'number', description: 'Amount in cents (integer)' },
    meta: { type: 'object', description: 'Type-specific metadata (cabin, nightly_rate_cents, date, etc.)' },
    createdAt: { type: 'string', description: 'ISO timestamp of creation' },
  },
})
export class TripItemDTO {
  id: string = '';
  tripId: string = '';
  type: ItemType = 'flight';
  description: string = '';
  amountCents: number = 0;
  meta: Record<string, unknown> = {};
  createdAt: string = '';
}

@DaemoSchema({
  description: 'A policy violation detected on a trip',
  properties: {
    id: { type: 'string', description: 'Unique violation ID (UUID)' },
    tripId: { type: 'string', description: 'Trip ID this violation belongs to' },
    code: { type: 'string', description: 'Violation code: BUSINESS_CLASS | HOTEL_CAP | MEAL_CAP | PREAPPROVAL' },
    severity: { type: 'string', description: 'Severity level: warning (can approve) | blocker (needs exception)' },
    message: { type: 'string', description: 'Human-readable violation explanation' },
    computedValueCents: { type: 'number', description: 'The actual value that triggered the violation (cents)' },
    policyValueCents: { type: 'number', description: 'The policy limit (cents)' },
  },
})
export class ViolationDTO {
  id: string = '';
  tripId: string = '';
  code: ViolationCode = 'BUSINESS_CLASS';
  severity: ViolationSeverity = 'warning';
  message: string = '';
  computedValueCents: number | null = null;
  policyValueCents: number | null = null;
}

@DaemoSchema({
  description: 'An approval decision record',
  properties: {
    id: { type: 'string', description: 'Unique approval ID (UUID)' },
    tripId: { type: 'string', description: 'Trip ID this approval is for' },
    reviewerUserId: { type: 'string', description: 'User ID of the reviewer' },
    decision: { type: 'string', description: 'Decision: approved | approved_exception | denied' },
    reason: { type: 'string', description: 'Reason for the decision (required for approved_exception)' },
    createdAt: { type: 'string', description: 'ISO timestamp of decision' },
  },
})
export class ApprovalDTO {
  id: string = '';
  tripId: string = '';
  reviewerUserId: string = '';
  decision: ApprovalDecision = 'approved';
  reason: string | null = null;
  createdAt: string = '';
}

@DaemoSchema({
  description: 'Current travel policy settings',
  properties: {
    id: { type: 'string', description: 'Policy ID' },
    economyOnly: { type: 'boolean', description: 'If true, only economy class flights are allowed' },
    hotelNightlyCapCents: { type: 'number', description: 'Maximum nightly hotel rate in cents' },
    mealDailyCapCents: { type: 'number', description: 'Maximum daily meal spending in cents' },
    preapprovalOverCents: { type: 'number', description: 'Trip total threshold requiring preapproval in cents' },
  },
})
export class PolicySnapshotDTO {
  id: string = '';
  economyOnly: boolean = true;
  hotelNightlyCapCents: number = 0;
  mealDailyCapCents: number = 0;
  preapprovalOverCents: number = 0;
}

// =============================================================================
// RESULT DTOS FOR TOOL RETURNS
// =============================================================================

@DaemoSchema({
  description: 'Result of creating a new trip',
  properties: {
    success: { type: 'boolean', description: 'Whether the operation succeeded' },
    trip: { type: 'object', description: 'The created trip record' },
    error: { type: 'object', description: 'Error details if success is false' },
  },
})
export class CreateTripResult {
  success: boolean = false;
  trip?: TripDTO;
  error?: StructuredError;
}

@DaemoSchema({
  description: 'Result of adding an item to a trip',
  properties: {
    success: { type: 'boolean', description: 'Whether the operation succeeded' },
    item: { type: 'object', description: 'The created trip item' },
    error: { type: 'object', description: 'Error details if success is false' },
  },
})
export class AddTripItemResult {
  success: boolean = false;
  item?: TripItemDTO;
  error?: StructuredError;
}

@DaemoSchema({
  description: 'Result of submitting a trip for review, includes policy violations',
  properties: {
    success: { type: 'boolean', description: 'Whether the operation succeeded' },
    status: { type: 'string', description: 'New trip status after submission' },
    violations: { type: 'array', description: 'List of policy violations found' },
    tripTotalCents: { type: 'number', description: 'Total trip cost in cents' },
    hasBlockers: { type: 'boolean', description: 'Whether any violations are blockers' },
    error: { type: 'object', description: 'Error details if success is false' },
  },
})
export class SubmitTripResult {
  success: boolean = false;
  status?: TripStatus;
  violations?: ViolationDTO[];
  tripTotalCents?: number;
  hasBlockers?: boolean;
  error?: StructuredError;
}

@DaemoSchema({
  description: 'Result of listing trips for the current user',
  properties: {
    success: { type: 'boolean', description: 'Whether the operation succeeded' },
    trips: { type: 'array', description: 'List of trips' },
    count: { type: 'number', description: 'Number of trips returned' },
    error: { type: 'object', description: 'Error details if success is false' },
  },
})
export class ListTripsResult {
  success: boolean = false;
  trips?: TripDTO[];
  count?: number;
  error?: StructuredError;
}

@DaemoSchema({
  description: 'Summary of a pending trip for review list',
  properties: {
    tripId: { type: 'string', description: 'Trip ID' },
    employeeName: { type: 'string', description: 'Name of the employee who submitted' },
    department: { type: 'string', description: 'Employee department' },
    destinationCity: { type: 'string', description: 'Trip destination' },
    startDate: { type: 'string', description: 'Trip start date' },
    endDate: { type: 'string', description: 'Trip end date' },
    status: { type: 'string', description: 'Current trip status' },
    violationCount: { type: 'number', description: 'Number of violations' },
    hasBlockers: { type: 'boolean', description: 'Whether trip has blocker violations' },
    tripTotalCents: { type: 'number', description: 'Total trip cost in cents' },
  },
})
export class PendingTripSummaryDTO {
  tripId: string = '';
  employeeName: string = '';
  department: string = '';
  destinationCity: string = '';
  startDate: string = '';
  endDate: string = '';
  status: TripStatus = 'pending_review';
  violationCount: number = 0;
  hasBlockers: boolean = false;
  tripTotalCents: number = 0;
}

@DaemoSchema({
  description: 'Result of listing pending trips for finance review',
  properties: {
    success: { type: 'boolean', description: 'Whether the operation succeeded' },
    trips: { type: 'array', description: 'List of pending trip summaries' },
    count: { type: 'number', description: 'Number of trips returned' },
    error: { type: 'object', description: 'Error details if success is false' },
  },
})
export class PendingTripsResult {
  success: boolean = false;
  trips?: PendingTripSummaryDTO[];
  count?: number;
  error?: StructuredError;
}

@DaemoSchema({
  description: 'Complete review packet for a trip, includes all details needed for approval decision',
  properties: {
    success: { type: 'boolean', description: 'Whether the operation succeeded' },
    trip: { type: 'object', description: 'The trip record' },
    employeeName: { type: 'string', description: 'Name of the employee' },
    department: { type: 'string', description: 'Employee department' },
    items: { type: 'array', description: 'All expense items in the trip' },
    violations: { type: 'array', description: 'All policy violations' },
    approvals: { type: 'array', description: 'Previous approval decisions' },
    policySnapshot: { type: 'object', description: 'Current policy settings used for evaluation' },
    tripTotalCents: { type: 'number', description: 'Total trip cost in cents' },
    hasBlockers: { type: 'boolean', description: 'Whether trip has blocker violations' },
    error: { type: 'object', description: 'Error details if success is false' },
  },
})
export class ReviewPacketResult {
  success: boolean = false;
  trip?: TripDTO;
  employeeName?: string;
  department?: string;
  items?: TripItemDTO[];
  violations?: ViolationDTO[];
  approvals?: ApprovalDTO[];
  policySnapshot?: PolicySnapshotDTO;
  tripTotalCents?: number;
  hasBlockers?: boolean;
  error?: StructuredError;
}

@DaemoSchema({
  description: 'Result of making an approval decision on a trip',
  properties: {
    success: { type: 'boolean', description: 'Whether the operation succeeded' },
    newStatus: { type: 'string', description: 'The new trip status after decision' },
    approval: { type: 'object', description: 'The approval record created' },
    error: { type: 'object', description: 'Error details if success is false' },
  },
})
export class DecideTripResult {
  success: boolean = false;
  newStatus?: TripStatus;
  approval?: ApprovalDTO;
  error?: StructuredError;
}

// =============================================================================
// ANALYTICS DTOS
// =============================================================================

@DaemoSchema({
  description: 'A breakdown item for analytics grouping',
  properties: {
    groupKey: { type: 'string', description: 'The group key (type name, department name, or employee name)' },
    count: { type: 'number', description: 'Count of items in this group' },
    totalCents: { type: 'number', description: 'Total amount in cents (where applicable)' },
  },
})
export class AnalyticsBreakdownItem {
  groupKey: string = '';
  count: number = 0;
  totalCents: number = 0;
}

@DaemoSchema({
  description: 'Result of violation analytics query',
  properties: {
    success: { type: 'boolean', description: 'Whether the operation succeeded' },
    summary: { type: 'object', description: 'Summary statistics' },
    breakdown: { type: 'array', description: 'Breakdown by the requested grouping' },
    error: { type: 'object', description: 'Error details if success is false' },
  },
})
export class ViolationAnalyticsResult {
  success: boolean = false;
  summary?: {
    totalViolations: number;
    blockerCount: number;
    warningCount: number;
    dateRange: { start: string; end: string };
  };
  breakdown?: AnalyticsBreakdownItem[];
  error?: StructuredError;
}

@DaemoSchema({
  description: 'Result of spend analytics query',
  properties: {
    success: { type: 'boolean', description: 'Whether the operation succeeded' },
    summary: { type: 'object', description: 'Summary statistics' },
    breakdown: { type: 'array', description: 'Breakdown by the requested grouping' },
    error: { type: 'object', description: 'Error details if success is false' },
  },
})
export class SpendAnalyticsResult {
  success: boolean = false;
  summary?: {
    totalSpendCents: number;
    tripCount: number;
    averagePerTripCents: number;
    dateRange: { start: string; end: string };
  };
  breakdown?: AnalyticsBreakdownItem[];
  error?: StructuredError;
}