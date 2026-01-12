/**
 * Travel Expense Service
 * 
 * The main Daemo service exposing all travel expense management tools.
 * Implements Daemo's core principles:
 * - Context Injection: userId/role from session, not LLM args
 * - Deterministic Execution: Zod validation + policy evaluation
 * - Self-Correction: Structured errors for retry
 * - RBAC: Role-based access enforced in every tool
 */

import 'reflect-metadata';
import { DaemoFunction } from 'daemo-engine';
import { z } from 'zod';

// Types
import type {
  TripStatus,
  ItemType,
  FlightMeta,
  HotelMeta,
  MealMeta,
} from '../types/domain';

import {
  TripDTO,
  TripItemDTO,
  ViolationDTO,
  ApprovalDTO,
  PolicySnapshotDTO,
  CreateTripResult,
  AddTripItemResult,
  SubmitTripResult,
  ListTripsResult,
  PendingTripsResult,
  PendingTripSummaryDTO,
  ReviewPacketResult,
  DecideTripResult,
  ViolationAnalyticsResult,
  SpendAnalyticsResult,
  AnalyticsBreakdownItem,
} from '../types/dto';

// Utilities
import { getSessionContext } from '../utils/context';
import {
  canViewTrip,
  canModifyTrip,
  canSubmitTrip,
  canReviewTrip,
  canViewAnalytics,
} from '../utils/rbac';
import {
  validateArgs,
  createTripArgsSchema,
  addTripItemArgsSchema,
  submitTripArgsSchema,
  getMyTripsArgsSchema,
  listPendingTripsArgsSchema,
  getTripReviewPacketArgsSchema,
  decideTripArgsSchema,
  violationAnalyticsArgsSchema,
  spendAnalyticsArgsSchema,
} from '../utils/validation';
import { centsToDollars, sumCents } from '../utils/money';

// Database
import * as db from '../db/queries';

// =============================================================================
// HELPER: Convert DB rows to DTOs
// =============================================================================

function tripRowToDTO(row: any): TripDTO {
  return {
    id: row.id,
    userId: row.user_id,
    destinationCity: row.destination_city,
    startDate: row.start_date,
    endDate: row.end_date,
    purpose: row.purpose,
    status: row.status,
    createdAt: row.created_at,
  };
}

function tripItemRowToDTO(row: any): TripItemDTO {
  return {
    id: row.id,
    tripId: row.trip_id,
    type: row.type,
    description: row.description,
    amountCents: row.amount_cents,
    meta: row.meta,
    createdAt: row.created_at,
  };
}

function violationRowToDTO(row: any): ViolationDTO {
  return {
    id: row.id,
    tripId: row.trip_id,
    code: row.code,
    severity: row.severity,
    message: row.message,
    computedValueCents: row.computed_value_cents,
    policyValueCents: row.policy_value_cents,
  };
}

function approvalRowToDTO(row: any): ApprovalDTO {
  return {
    id: row.id,
    tripId: row.trip_id,
    reviewerUserId: row.reviewer_user_id,
    decision: row.decision,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

function policyRowToDTO(row: any): PolicySnapshotDTO {
  return {
    id: row.id,
    economyOnly: row.economy_only,
    hotelNightlyCapCents: row.hotel_nightly_cap_cents,
    mealDailyCapCents: row.meal_daily_cap_cents,
    preapprovalOverCents: row.preapproval_over_cents,
  };
}

// =============================================================================
// POLICY EVALUATION (Deterministic)
// =============================================================================

interface PolicyEvaluationResult {
  violations: ViolationDTO[];
  tripTotalCents: number;
  policySnapshot: PolicySnapshotDTO;
  hasBlockers: boolean;
}

async function evaluatePolicyViolations(tripId: string): Promise<PolicyEvaluationResult | null> {
  // Get active policy
  const policyRow = await db.getActivePolicy();
  if (!policyRow) {
    console.error('No active policy found');
    return null;
  }

  const policy = policyRowToDTO(policyRow);
  const trip = await db.getTripById(tripId);
  if (!trip) return null;

  const items = await db.getTripItems(tripId);

  // Clear existing violations and recompute from scratch
  await db.deleteViolationsForTrip(tripId);

  const violations: ViolationDTO[] = [];

  // 1. Check flights for business class
  if (policy.economyOnly) {
    for (const item of items) {
      if (item.type === 'flight') {
        const meta = item.meta as unknown as FlightMeta;
        if (meta.cabin && meta.cabin !== 'economy') {
          const violation = await db.createViolation({
            tripId,
            code: 'BUSINESS_CLASS',
            severity: 'blocker',
            message: `Flight booked in ${meta.cabin} class; policy requires economy only`,
            computedValueCents: null,
            policyValueCents: null,
          });
          if (violation) violations.push(violationRowToDTO(violation));
        }
      }
    }
  }

  // 2. Check hotels for nightly rate cap
  for (const item of items) {
    if (item.type === 'hotel') {
      const meta = item.meta as unknown as HotelMeta;
      if (meta.nightly_rate_cents && meta.nightly_rate_cents > policy.hotelNightlyCapCents) {
        const violation = await db.createViolation({
          tripId,
          code: 'HOTEL_CAP',
          severity: 'warning',
          message: `Hotel nightly rate (${centsToDollars(meta.nightly_rate_cents)}) exceeds cap (${centsToDollars(policy.hotelNightlyCapCents)})`,
          computedValueCents: meta.nightly_rate_cents,
          policyValueCents: policy.hotelNightlyCapCents,
        });
        if (violation) violations.push(violationRowToDTO(violation));
      }
    }
  }

  // 3. Check meals for daily cap (group by date)
  const mealsByDate = new Map<string, number>();
  for (const item of items) {
    if (item.type === 'meal') {
      const meta = item.meta as unknown as MealMeta;
      const date = meta.date || 'unknown';
      const current = mealsByDate.get(date) || 0;
      mealsByDate.set(date, current + item.amount_cents);
    }
  }

  for (const [date, totalCents] of mealsByDate) {
    if (totalCents > policy.mealDailyCapCents) {
      const violation = await db.createViolation({
        tripId,
        code: 'MEAL_CAP',
        severity: 'warning',
        message: `Meal spending on ${date} (${centsToDollars(totalCents)}) exceeds daily cap (${centsToDollars(policy.mealDailyCapCents)})`,
        computedValueCents: totalCents,
        policyValueCents: policy.mealDailyCapCents,
      });
      if (violation) violations.push(violationRowToDTO(violation));
    }
  }

  // 4. Check total spend for preapproval threshold
  const tripTotalCents = sumCents(items.map((i) => i.amount_cents));
  if (tripTotalCents > policy.preapprovalOverCents && trip.status === 'pending_review') {
    const violation = await db.createViolation({
      tripId,
      code: 'PREAPPROVAL',
      severity: 'blocker',
      message: `Total trip spend (${centsToDollars(tripTotalCents)}) exceeds preapproval threshold (${centsToDollars(policy.preapprovalOverCents)})`,
      computedValueCents: tripTotalCents,
      policyValueCents: policy.preapprovalOverCents,
    });
    if (violation) violations.push(violationRowToDTO(violation));
  }

  const hasBlockers = violations.some((v) => v.severity === 'blocker');

  return {
    violations,
    tripTotalCents,
    policySnapshot: policy,
    hasBlockers,
  };
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class TravelExpenseService {
  // ===========================================================================
  // EMPLOYEE TOOLS
  // ===========================================================================

  @DaemoFunction({
    description:
      'Create a new travel trip request. The trip starts in draft status. ' +
      'After creating, add expense items (flights, hotels, meals, transport) ' +
      'then submit for review. Dates must be in YYYY-MM-DD format.',
    inputSchema: z.object({
      destinationCity: z.string().describe('Destination city name'),
      startDate: z.string().describe('Trip start date (YYYY-MM-DD)'),
      endDate: z.string().describe('Trip end date (YYYY-MM-DD)'),
      purpose: z.string().describe('Business purpose of the trip'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      trip: z.any().optional(),
      error: z.any().optional(),
    }),
  })
  async createTrip(args: {
    destinationCity: string;
    startDate: string;
    endDate: string;
    purpose: string;
  }): Promise<CreateTripResult> {
    try {
      // Validate input
      const validation = validateArgs(createTripArgsSchema, args);
      if (!validation.success) {
        return { success: false, error: validation.error };
      }

      // Get session context (injected, not from args)
      const ctx = getSessionContext();

      // Create trip
      const tripRow = await db.createTrip({
        userId: ctx.userId,
        destinationCity: validation.data.destinationCity,
        startDate: validation.data.startDate,
        endDate: validation.data.endDate,
        purpose: validation.data.purpose,
      });

      if (!tripRow) {
        return {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to create trip in database',
            hint: 'Please try again',
          },
        };
      }

      return {
        success: true,
        trip: tripRowToDTO(tripRow),
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unexpected error creating trip',
          hint: String(err),
        },
      };
    }
  }

  @DaemoFunction({
    description:
      'Add an expense item to a trip. Only works for trips in draft status owned by the current user. ' +
      'Types: flight, hotel, meal, transport. Amount is in cents (e.g., $250.00 = 25000). ' +
      'Meta should include type-specific data: ' +
      'flight: {cabin: "economy"|"business"|"first"}, ' +
      'hotel: {nightly_rate_cents: number, nights: number}, ' +
      'meal: {date: "YYYY-MM-DD"}.',
    inputSchema: z.object({
      tripId: z.string().describe('Trip ID to add item to'),
      type: z.enum(['flight', 'hotel', 'meal', 'transport']).describe('Item type'),
      description: z.string().describe('Description of the expense'),
      amountCents: z.number().describe('Amount in cents'),
      meta: z.record(z.unknown()).optional().describe('Type-specific metadata'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      item: z.any().optional(),
      error: z.any().optional(),
    }),
  })
  async addTripItem(args: {
    tripId: string;
    type: ItemType;
    description: string;
    amountCents: number;
    meta?: Record<string, unknown>;
  }): Promise<AddTripItemResult> {
    try {
      // Validate input
      const validation = validateArgs(addTripItemArgsSchema, args);
      if (!validation.success) {
        return { success: false, error: validation.error };
      }

      const ctx = getSessionContext();

      // Get trip
      const trip = await db.getTripById(validation.data.tripId);
      if (!trip) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Trip ${validation.data.tripId} not found`,
          },
        };
      }

      // Check permission
      const permission = canModifyTrip(ctx, trip.user_id, trip.status);
      if (!permission.allowed) {
        return { success: false, error: permission.error };
      }

      // Create item
      const itemRow = await db.createTripItem({
        tripId: validation.data.tripId,
        type: validation.data.type,
        description: validation.data.description,
        amountCents: validation.data.amountCents,
        meta: validation.data.meta || {},
      });

      if (!itemRow) {
        return {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to create trip item',
          },
        };
      }

      return {
        success: true,
        item: tripItemRowToDTO(itemRow),
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unexpected error adding trip item',
          hint: String(err),
        },
      };
    }
  }

  @DaemoFunction({
    description:
      'Submit a trip for finance review. This evaluates all policy rules and flags violations. ' +
      'Returns the list of violations found and whether any are blockers. ' +
      'Only the trip owner can submit, and only draft trips can be submitted.',
    inputSchema: z.object({
      tripId: z.string().describe('Trip ID to submit for review'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      status: z.string().optional(),
      violations: z.array(z.any()).optional(),
      tripTotalCents: z.number().optional(),
      hasBlockers: z.boolean().optional(),
      error: z.any().optional(),
    }),
  })
  async submitTripForReview(args: { tripId: string }): Promise<SubmitTripResult> {
    try {
      // Validate input
      const validation = validateArgs(submitTripArgsSchema, args);
      if (!validation.success) {
        return { success: false, error: validation.error };
      }

      const ctx = getSessionContext();

      // Get trip
      const trip = await db.getTripById(validation.data.tripId);
      if (!trip) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Trip ${validation.data.tripId} not found`,
          },
        };
      }

      // Check permission
      const permission = canSubmitTrip(ctx, trip.user_id, trip.status);
      if (!permission.allowed) {
        return { success: false, error: permission.error };
      }

      // Update status to pending_review
      await db.updateTripStatus(validation.data.tripId, 'pending_review');

      // Evaluate policy violations
      const evaluation = await evaluatePolicyViolations(validation.data.tripId);
      if (!evaluation) {
        return {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to evaluate policy violations',
          },
        };
      }

      return {
        success: true,
        status: 'pending_review',
        violations: evaluation.violations,
        tripTotalCents: evaluation.tripTotalCents,
        hasBlockers: evaluation.hasBlockers,
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unexpected error submitting trip',
          hint: String(err),
        },
      };
    }
  }

  @DaemoFunction({
    description:
      'Get all trips for the current user. Optionally filter by status. ' +
      'Employees can only see their own trips.',
    inputSchema: z.object({
      status: z.enum(['draft', 'pending_review', 'approved', 'approved_exception', 'denied']).optional().describe('Filter by trip status'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      trips: z.array(z.any()).optional(),
      count: z.number().optional(),
      error: z.any().optional(),
    }),
  })
  async getMyTrips(args?: { status?: TripStatus }): Promise<ListTripsResult> {
    try {
      // Validate input (optional)
      const validation = validateArgs(getMyTripsArgsSchema, args || {});
      if (!validation.success) {
        return { success: false, error: validation.error };
      }

      const ctx = getSessionContext();

      const data = validation.data as { status?: TripStatus } | undefined;
      const tripRows = await db.getTripsByUserId(ctx.userId, data?.status);
      const trips = tripRows.map(tripRowToDTO);

      return {
        success: true,
        trips,
        count: trips.length,
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unexpected error fetching trips',
          hint: String(err),
        },
      };
    }
  }

  // ===========================================================================
  // FINANCE TOOLS
  // ===========================================================================

  @DaemoFunction({
    description:
      'List all trips pending review. Only finance managers and admins can use this. ' +
      'Optionally filter by department or only show trips with blocker violations.',
    inputSchema: z.object({
      department: z.string().optional().describe('Filter by department name'),
      hasBlockers: z.boolean().optional().describe('Filter to only trips with blocker violations'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      trips: z.array(z.any()).optional(),
      count: z.number().optional(),
      error: z.any().optional(),
    }),
  })
  async listPendingTrips(args?: {
    department?: string;
    hasBlockers?: boolean;
  }): Promise<PendingTripsResult> {
    try {
      // Validate input (optional)
      const validation = validateArgs(listPendingTripsArgsSchema, args || {});
      if (!validation.success) {
        return { success: false, error: validation.error };
      }

      const ctx = getSessionContext();

      // Check permission
      const permission = canViewAnalytics(ctx);
      if (!permission.allowed) {
        return { success: false, error: permission.error };
      }

      // Get pending trips with user info
      const data = validation.data as { department?: string; hasBlockers?: boolean } | undefined;
      const tripRows = await db.getPendingTrips({
        department: data?.department,
      });

      // Build summaries with violation counts
      const summaries: PendingTripSummaryDTO[] = [];
      for (const tripRow of tripRows) {
        const violations = await db.getViolationsForTrip(tripRow.id);
        const totalCents = await db.getTripTotalCents(tripRow.id);
        const hasBlockers = violations.some((v) => v.severity === 'blocker');

        // Filter by hasBlockers if specified
        if (data?.hasBlockers !== undefined) {
          if (data.hasBlockers !== hasBlockers) continue;
        }

        summaries.push({
          tripId: tripRow.id,
          employeeName: tripRow.user.name,
          department: tripRow.user.department,
          destinationCity: tripRow.destination_city,
          startDate: tripRow.start_date,
          endDate: tripRow.end_date,
          status: tripRow.status,
          violationCount: violations.length,
          hasBlockers,
          tripTotalCents: totalCents,
        });
      }

      return {
        success: true,
        trips: summaries,
        count: summaries.length,
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unexpected error listing pending trips',
          hint: String(err),
        },
      };
    }
  }

  @DaemoFunction({
    description:
      'Get the complete review packet for a trip. Includes trip details, all items, ' +
      'violations, previous approvals, and current policy snapshot. ' +
      'Use this before making an approval decision to understand the full context.',
    inputSchema: z.object({
      tripId: z.string().describe('Trip ID to get review packet for'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      trip: z.any().optional(),
      employeeName: z.string().optional(),
      department: z.string().optional(),
      items: z.array(z.any()).optional(),
      violations: z.array(z.any()).optional(),
      approvals: z.array(z.any()).optional(),
      policySnapshot: z.any().optional(),
      tripTotalCents: z.number().optional(),
      hasBlockers: z.boolean().optional(),
      error: z.any().optional(),
    }),
  })
  async getTripReviewPacket(args: { tripId: string }): Promise<ReviewPacketResult> {
    try {
      // Validate input
      const validation = validateArgs(getTripReviewPacketArgsSchema, args);
      if (!validation.success) {
        return { success: false, error: validation.error };
      }

      const ctx = getSessionContext();

      // Get trip
      const trip = await db.getTripById(validation.data.tripId);
      if (!trip) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Trip ${validation.data.tripId} not found`,
          },
        };
      }

      // Check view permission
      const permission = canViewTrip(ctx, trip.user_id);
      if (!permission.allowed) {
        return { success: false, error: permission.error };
      }

      // Get user info
      const user = await db.getUserById(trip.user_id);

      // Get all related data
      const items = await db.getTripItems(validation.data.tripId);
      const violations = await db.getViolationsForTrip(validation.data.tripId);
      const approvals = await db.getApprovalsForTrip(validation.data.tripId);
      const policyRow = await db.getActivePolicy();

      const tripTotalCents = sumCents(items.map((i) => i.amount_cents));
      const hasBlockers = violations.some((v) => v.severity === 'blocker');

      return {
        success: true,
        trip: tripRowToDTO(trip),
        employeeName: user?.name || 'Unknown',
        department: user?.department || 'Unknown',
        items: items.map(tripItemRowToDTO),
        violations: violations.map(violationRowToDTO),
        approvals: approvals.map(approvalRowToDTO),
        policySnapshot: policyRow ? policyRowToDTO(policyRow) : undefined,
        tripTotalCents,
        hasBlockers,
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unexpected error fetching review packet',
          hint: String(err),
        },
      };
    }
  }

  @DaemoFunction({
    description:
      'Make an approval decision on a trip. Only finance managers and admins can decide. ' +
      'Decisions: "approved", "approved_exception" (requires reason), "denied". ' +
      'Always call getTripReviewPacket first to understand violations before deciding.',
    inputSchema: z.object({
      tripId: z.string().describe('Trip ID to make decision on'),
      decision: z.enum(['approved', 'approved_exception', 'denied']).describe('Approval decision'),
      reason: z.string().optional().describe('Reason for decision (required for approved_exception)'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      newStatus: z.string().optional(),
      approval: z.any().optional(),
      error: z.any().optional(),
    }),
  })
  async decideTrip(args: {
    tripId: string;
    decision: 'approved' | 'approved_exception' | 'denied';
    reason?: string;
  }): Promise<DecideTripResult> {
    try {
      // Validate input
      const validation = validateArgs(decideTripArgsSchema, args);
      if (!validation.success) {
        return { success: false, error: validation.error };
      }

      const ctx = getSessionContext();

      // Get trip
      const trip = await db.getTripById(validation.data.tripId);
      if (!trip) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Trip ${validation.data.tripId} not found`,
          },
        };
      }

      // Check permission
      const permission = canReviewTrip(ctx, trip.status);
      if (!permission.allowed) {
        return { success: false, error: permission.error };
      }

      // Determine new status
      let newStatus: TripStatus;
      switch (validation.data.decision) {
        case 'approved':
          newStatus = 'approved';
          break;
        case 'approved_exception':
          newStatus = 'approved_exception';
          break;
        case 'denied':
          newStatus = 'denied';
          break;
      }

      // Create approval record
      const approvalRow = await db.createApproval({
        tripId: validation.data.tripId,
        reviewerUserId: ctx.userId,
        decision: validation.data.decision,
        reason: validation.data.reason,
      });

      if (!approvalRow) {
        return {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to record approval decision',
          },
        };
      }

      // Update trip status
      await db.updateTripStatus(validation.data.tripId, newStatus);

      return {
        success: true,
        newStatus,
        approval: approvalRowToDTO(approvalRow),
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unexpected error recording decision',
          hint: String(err),
        },
      };
    }
  }

  // ===========================================================================
  // ANALYTICS TOOLS
  // ===========================================================================

  @DaemoFunction({
    description:
      'Get violation analytics for a date range. Group by "type" (violation code) ' +
      'or "department". Only finance managers and admins can view analytics.',
    inputSchema: z.object({
      startDate: z.string().describe('Start date (YYYY-MM-DD)'),
      endDate: z.string().describe('End date (YYYY-MM-DD)'),
      groupBy: z.enum(['type', 'department']).describe('Group violations by type or department'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      summary: z.any().optional(),
      breakdown: z.array(z.any()).optional(),
      error: z.any().optional(),
    }),
  })
  async getViolationAnalytics(args: {
    startDate: string;
    endDate: string;
    groupBy: 'type' | 'department';
  }): Promise<ViolationAnalyticsResult> {
    try {
      // Validate input
      const validation = validateArgs(violationAnalyticsArgsSchema, args);
      if (!validation.success) {
        return { success: false, error: validation.error };
      }

      const ctx = getSessionContext();

      // Check permission
      const permission = canViewAnalytics(ctx);
      if (!permission.allowed) {
        return { success: false, error: permission.error };
      }

      // Get violations in date range
      const violations = await db.getViolationsInDateRange(
        validation.data.startDate,
        validation.data.endDate
      );

      // Build summary
      const blockerCount = violations.filter((v) => v.severity === 'blocker').length;
      const warningCount = violations.filter((v) => v.severity === 'warning').length;

      // Group by requested dimension
      const grouped = new Map<string, { count: number; totalCents: number }>();

      for (const v of violations) {
        const key =
          validation.data.groupBy === 'type'
            ? v.code
            : v.trip.user.department;

        const current = grouped.get(key) || { count: 0, totalCents: 0 };
        current.count += 1;
        current.totalCents += v.computed_value_cents || 0;
        grouped.set(key, current);
      }

      const breakdown: AnalyticsBreakdownItem[] = Array.from(grouped.entries()).map(
        ([groupKey, data]) => ({
          groupKey,
          count: data.count,
          totalCents: data.totalCents,
        })
      );

      return {
        success: true,
        summary: {
          totalViolations: violations.length,
          blockerCount,
          warningCount,
          dateRange: {
            start: validation.data.startDate,
            end: validation.data.endDate,
          },
        },
        breakdown,
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unexpected error computing violation analytics',
          hint: String(err),
        },
      };
    }
  }

  @DaemoFunction({
    description:
      'Get spend analytics for a date range. Group by "department" or "employee". ' +
      'Only finance managers and admins can view analytics.',
    inputSchema: z.object({
      startDate: z.string().describe('Start date (YYYY-MM-DD)'),
      endDate: z.string().describe('End date (YYYY-MM-DD)'),
      groupBy: z.enum(['department', 'employee']).describe('Group spend by department or employee'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      summary: z.any().optional(),
      breakdown: z.array(z.any()).optional(),
      error: z.any().optional(),
    }),
  })
  async getSpendAnalytics(args: {
    startDate: string;
    endDate: string;
    groupBy: 'department' | 'employee';
  }): Promise<SpendAnalyticsResult> {
    try {
      // Validate input
      const validation = validateArgs(spendAnalyticsArgsSchema, args);
      if (!validation.success) {
        return { success: false, error: validation.error };
      }

      const ctx = getSessionContext();

      // Check permission
      const permission = canViewAnalytics(ctx);
      if (!permission.allowed) {
        return { success: false, error: permission.error };
      }

      // Get trips in date range with items
      const trips = await db.getTripsInDateRange(
        validation.data.startDate,
        validation.data.endDate
      );

      // Calculate totals
      let totalSpendCents = 0;
      const grouped = new Map<string, { count: number; totalCents: number }>();

      for (const trip of trips) {
        const tripTotal = sumCents(trip.items.map((i) => i.amount_cents));
        totalSpendCents += tripTotal;

        const key =
          validation.data.groupBy === 'department'
            ? trip.user.department
            : trip.user.name;

        const current = grouped.get(key) || { count: 0, totalCents: 0 };
        current.count += 1;
        current.totalCents += tripTotal;
        grouped.set(key, current);
      }

      const breakdown: AnalyticsBreakdownItem[] = Array.from(grouped.entries()).map(
        ([groupKey, data]) => ({
          groupKey,
          count: data.count,
          totalCents: data.totalCents,
        })
      );

      return {
        success: true,
        summary: {
          totalSpendCents,
          tripCount: trips.length,
          averagePerTripCents: trips.length > 0 ? Math.round(totalSpendCents / trips.length) : 0,
          dateRange: {
            start: validation.data.startDate,
            end: validation.data.endDate,
          },
        },
        breakdown,
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unexpected error computing spend analytics',
          hint: String(err),
        },
      };
    }
  }
}