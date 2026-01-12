/**
 * Domain types and enums for Travel Expense system
 * These mirror the Supabase enums and provide type safety
 */

// =============================================================================
// ENUMS (match Supabase enums exactly)
// =============================================================================

export type UserRole = 'employee' | 'finance_manager' | 'admin';

export type TripStatus = 'draft' | 'pending_review' | 'approved' | 'approved_exception' | 'denied';

export type ItemType = 'flight' | 'hotel' | 'meal' | 'transport';

export type ViolationSeverity = 'warning' | 'blocker';

export type ApprovalDecision = 'approved' | 'approved_exception' | 'denied';

export type ViolationCode = 'BUSINESS_CLASS' | 'HOTEL_CAP' | 'MEAL_CAP' | 'PREAPPROVAL';

// =============================================================================
// DATABASE ROW TYPES
// =============================================================================

export interface UserRow {
  id: string;
  name: string;
  role: UserRole;
  department: string;
  created_at: string;
}

export interface TravelPolicyRow {
  id: string;
  economy_only: boolean;
  hotel_nightly_cap_cents: number;
  meal_daily_cap_cents: number;
  preapproval_over_cents: number;
  created_at: string;
}

export interface TripRow {
  id: string;
  user_id: string;
  destination_city: string;
  start_date: string;
  end_date: string;
  purpose: string;
  status: TripStatus;
  created_at: string;
}

export interface TripItemRow {
  id: string;
  trip_id: string;
  type: ItemType;
  description: string;
  amount_cents: number;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface ViolationRow {
  id: string;
  trip_id: string;
  code: ViolationCode;
  severity: ViolationSeverity;
  message: string;
  computed_value_cents: number | null;
  policy_value_cents: number | null;
  created_at: string;
}

export interface ApprovalRow {
  id: string;
  trip_id: string;
  reviewer_user_id: string;
  decision: ApprovalDecision;
  reason: string | null;
  created_at: string;
}

// =============================================================================
// META TYPES (for trip_items.meta JSONB field)
// =============================================================================

export interface FlightMeta {
  cabin: 'economy' | 'business' | 'first';
  airline?: string;
}

export interface HotelMeta {
  nightly_rate_cents: number;
  nights: number;
}

export interface MealMeta {
  date: string; // YYYY-MM-DD format
}

export interface TransportMeta {
  type?: string;
}

// =============================================================================
// SESSION CONTEXT
// =============================================================================

export interface SessionContext {
  userId: string;
  role: UserRole;
  department: string;
}

// =============================================================================
// ERROR TYPES (for structured self-correction)
// =============================================================================

export type ErrorCode = 
  | 'VALIDATION_ERROR'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_STATE'
  | 'INTERNAL_ERROR';

export interface StructuredError {
  code: ErrorCode;
  message: string;
  details?: unknown[];
  hint?: string;
}