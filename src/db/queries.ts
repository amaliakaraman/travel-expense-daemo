/**
 * Database Query Helpers
 * 
 * Encapsulates all Supabase queries. Tool functions use these helpers
 * rather than making direct database calls.
 */

import { getSupabase } from './supabaseClient';
import type {
  UserRow,
  TravelPolicyRow,
  TripRow,
  TripItemRow,
  ViolationRow,
  ApprovalRow,
  TripStatus,
  ItemType,
  ViolationCode,
  ViolationSeverity,
  ApprovalDecision,
} from '../types/domain';

// =============================================================================
// USERS
// =============================================================================

export async function getUserById(userId: string): Promise<UserRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) return null;
  return data as UserRow;
}

// =============================================================================
// POLICIES
// =============================================================================

export async function getActivePolicy(): Promise<TravelPolicyRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('travel_policies')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data as TravelPolicyRow;
}

// =============================================================================
// TRIPS
// =============================================================================

export async function createTrip(params: {
  userId: string;
  destinationCity: string;
  startDate: string;
  endDate: string;
  purpose: string;
}): Promise<TripRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('trips')
    .insert({
      user_id: params.userId,
      destination_city: params.destinationCity,
      start_date: params.startDate,
      end_date: params.endDate,
      purpose: params.purpose,
      status: 'draft',
    })
    .select()
    .single();

  if (error) {
    console.error('createTrip error:', error);
    return null;
  }
  return data as TripRow;
}

export async function getTripById(tripId: string): Promise<TripRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('id', tripId)
    .single();

  if (error) return null;
  return data as TripRow;
}

export async function getTripsByUserId(
  userId: string,
  status?: TripStatus
): Promise<TripRow[]> {
  const supabase = getSupabase();
  let query = supabase
    .from('trips')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) return [];
  return data as TripRow[];
}

export async function getPendingTrips(params?: {
  department?: string;
}): Promise<Array<TripRow & { user: UserRow }>> {
  const supabase = getSupabase();
  let query = supabase
    .from('trips')
    .select('*, user:users(*)')
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) return [];

  let results = data as Array<TripRow & { user: UserRow }>;

  // Filter by department if specified
  if (params?.department) {
    results = results.filter((t) => t.user.department === params.department);
  }

  return results;
}

export async function updateTripStatus(
  tripId: string,
  status: TripStatus
): Promise<boolean> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('trips')
    .update({ status })
    .eq('id', tripId);

  return !error;
}

// =============================================================================
// TRIP ITEMS
// =============================================================================

export async function createTripItem(params: {
  tripId: string;
  type: ItemType;
  description: string;
  amountCents: number;
  meta: Record<string, unknown>;
}): Promise<TripItemRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('trip_items')
    .insert({
      trip_id: params.tripId,
      type: params.type,
      description: params.description,
      amount_cents: params.amountCents,
      meta: params.meta,
    })
    .select()
    .single();

  if (error) {
    console.error('createTripItem error:', error);
    return null;
  }
  return data as TripItemRow;
}

export async function getTripItems(tripId: string): Promise<TripItemRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('trip_items')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true });

  if (error) return [];
  return data as TripItemRow[];
}

export async function getTripTotalCents(tripId: string): Promise<number> {
  const items = await getTripItems(tripId);
  return items.reduce((sum, item) => sum + item.amount_cents, 0);
}

// =============================================================================
// VIOLATIONS
// =============================================================================

export async function deleteViolationsForTrip(tripId: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.from('violations').delete().eq('trip_id', tripId);
}

export async function createViolation(params: {
  tripId: string;
  code: ViolationCode;
  severity: ViolationSeverity;
  message: string;
  computedValueCents?: number | null;
  policyValueCents?: number | null;
}): Promise<ViolationRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('violations')
    .insert({
      trip_id: params.tripId,
      code: params.code,
      severity: params.severity,
      message: params.message,
      computed_value_cents: params.computedValueCents ?? null,
      policy_value_cents: params.policyValueCents ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('createViolation error:', error);
    return null;
  }
  return data as ViolationRow;
}

export async function getViolationsForTrip(tripId: string): Promise<ViolationRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('violations')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true });

  if (error) return [];
  return data as ViolationRow[];
}

export async function getViolationsInDateRange(
  startDate: string,
  endDate: string
): Promise<Array<ViolationRow & { trip: TripRow & { user: UserRow } }>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('violations')
    .select('*, trip:trips(*, user:users(*))')
    .gte('created_at', `${startDate}T00:00:00Z`)
    .lte('created_at', `${endDate}T23:59:59Z`);

  if (error) return [];
  return data as Array<ViolationRow & { trip: TripRow & { user: UserRow } }>;
}

// =============================================================================
// APPROVALS
// =============================================================================

export async function createApproval(params: {
  tripId: string;
  reviewerUserId: string;
  decision: ApprovalDecision;
  reason?: string | null;
}): Promise<ApprovalRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('approvals')
    .insert({
      trip_id: params.tripId,
      reviewer_user_id: params.reviewerUserId,
      decision: params.decision,
      reason: params.reason ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('createApproval error:', error);
    return null;
  }
  return data as ApprovalRow;
}

export async function getApprovalsForTrip(tripId: string): Promise<ApprovalRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('approvals')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true });

  if (error) return [];
  return data as ApprovalRow[];
}

// =============================================================================
// ANALYTICS QUERIES
// =============================================================================

export async function getTripsInDateRange(
  startDate: string,
  endDate: string
): Promise<Array<TripRow & { user: UserRow; items: TripItemRow[] }>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('trips')
    .select('*, user:users(*), items:trip_items(*)')
    .gte('start_date', startDate)
    .lte('start_date', endDate);

  if (error) return [];
  return data as Array<TripRow & { user: UserRow; items: TripItemRow[] }>;
}