/**
 * Role-Based Access Control (RBAC) Utilities
 * 
 * Enforces Daemo's principle: the AI cannot bypass security rules.
 * All permission checks happen server-side in tool functions.
 */

import type { SessionContext, TripStatus, StructuredError } from '../types/domain';

/**
 * Check if user can view a trip
 * - Employees can only view their own trips
 * - Finance managers and admins can view any trip
 */
export function canViewTrip(
  ctx: SessionContext,
  tripUserId: string
): { allowed: boolean; error?: StructuredError } {
  if (ctx.role === 'finance_manager' || ctx.role === 'admin') {
    return { allowed: true };
  }

  if (ctx.userId === tripUserId) {
    return { allowed: true };
  }

  return {
    allowed: false,
    error: {
      code: 'FORBIDDEN',
      message: 'You can only view your own trips',
      hint: 'Employees cannot access trips belonging to other users',
    },
  };
}

/**
 * Check if user can modify a trip (add items, edit, delete)
 * - Only the trip owner can modify
 * - Trip must be in draft status
 */
export function canModifyTrip(
  ctx: SessionContext,
  tripUserId: string,
  tripStatus: TripStatus
): { allowed: boolean; error?: StructuredError } {
  // Only owner can modify
  if (ctx.userId !== tripUserId) {
    return {
      allowed: false,
      error: {
        code: 'FORBIDDEN',
        message: 'You can only modify your own trips',
      },
    };
  }

  // Only draft trips can be modified
  if (tripStatus !== 'draft') {
    return {
      allowed: false,
      error: {
        code: 'INVALID_STATE',
        message: `Trip cannot be modified in '${tripStatus}' status`,
        hint: 'Only trips in draft status can be modified. Create a new trip or contact finance to reopen.',
      },
    };
  }

  return { allowed: true };
}

/**
 * Check if user can submit a trip for review
 * - Only the trip owner can submit
 * - Trip must be in draft status
 */
export function canSubmitTrip(
  ctx: SessionContext,
  tripUserId: string,
  tripStatus: TripStatus
): { allowed: boolean; error?: StructuredError } {
  if (ctx.userId !== tripUserId) {
    return {
      allowed: false,
      error: {
        code: 'FORBIDDEN',
        message: 'You can only submit your own trips for review',
      },
    };
  }

  if (tripStatus !== 'draft') {
    return {
      allowed: false,
      error: {
        code: 'INVALID_STATE',
        message: `Trip is already in '${tripStatus}' status and cannot be resubmitted`,
        hint: tripStatus === 'pending_review' 
          ? 'This trip is already pending review' 
          : 'This trip has already been processed',
      },
    };
  }

  return { allowed: true };
}

/**
 * Check if user can review/decide on a trip
 * - Only finance_manager or admin can review
 * - Trip must be in pending_review status
 */
export function canReviewTrip(
  ctx: SessionContext,
  tripStatus: TripStatus
): { allowed: boolean; error?: StructuredError } {
  if (ctx.role !== 'finance_manager' && ctx.role !== 'admin') {
    return {
      allowed: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Only finance managers and admins can review trips',
        hint: `Your current role is '${ctx.role}'`,
      },
    };
  }

  if (tripStatus !== 'pending_review') {
    return {
      allowed: false,
      error: {
        code: 'INVALID_STATE',
        message: `Trip is in '${tripStatus}' status and cannot be reviewed`,
        hint: 'Only trips with pending_review status can be approved or denied',
      },
    };
  }

  return { allowed: true };
}

/**
 * Check if user can view analytics
 * - Only finance_manager or admin can view analytics
 */
export function canViewAnalytics(
  ctx: SessionContext
): { allowed: boolean; error?: StructuredError } {
  if (ctx.role !== 'finance_manager' && ctx.role !== 'admin') {
    return {
      allowed: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Only finance managers and admins can view analytics',
        hint: `Your current role is '${ctx.role}'`,
      },
    };
  }

  return { allowed: true };
}