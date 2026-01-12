/**
 * Validation Utilities using Zod
 * 
 * Provides deterministic input validation with structured errors
 * that allow Daemo's self-correction mechanism to retry with fixed inputs.
 */

import { z, ZodError, ZodSchema } from 'zod';
import type { StructuredError } from '../types/domain';

/**
 * Validate arguments using a Zod schema.
 * Returns either the validated data or a structured error.
 */
export function validateArgs<T>(
  schema: ZodSchema<T>,
  args: unknown
): { success: true; data: T } | { success: false; error: StructuredError } {
  try {
    const data = schema.parse(args);
    return { success: true, data };
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input arguments',
          details: err.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
            received: e.code === 'invalid_type' ? (e as any).received : undefined,
          })),
          hint: 'Please correct the fields listed in details and retry',
        },
      };
    }
    
    // Unexpected error
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed unexpectedly',
        hint: String(err),
      },
    };
  }
}

// =============================================================================
// SHARED ZOD SCHEMAS
// =============================================================================

export const uuidSchema = z.string().uuid('Must be a valid UUID');

export const dateSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  'Date must be in YYYY-MM-DD format'
);

export const itemTypeSchema = z.enum(['flight', 'hotel', 'meal', 'transport']);

export const tripStatusSchema = z.enum([
  'draft',
  'pending_review',
  'approved',
  'approved_exception',
  'denied',
]);

export const approvalDecisionSchema = z.enum([
  'approved',
  'approved_exception',
  'denied',
]);

export const groupByViolationSchema = z.enum(['type', 'department']);
export const groupBySpendSchema = z.enum(['department', 'employee']);

// =============================================================================
// TOOL INPUT SCHEMAS
// =============================================================================

export const createTripArgsSchema = z.object({
  destinationCity: z.string().min(1, 'Destination city is required'),
  startDate: dateSchema,
  endDate: dateSchema,
  purpose: z.string().min(1, 'Purpose is required'),
}).refine(
  (data) => data.startDate <= data.endDate,
  { message: 'Start date must be on or before end date' }
);

export const addTripItemArgsSchema = z.object({
  tripId: uuidSchema,
  type: itemTypeSchema,
  description: z.string().min(1, 'Description is required'),
  amountCents: z.number().int().positive('Amount must be a positive integer (cents)'),
  meta: z.record(z.unknown()).optional().default({}),
});

export const submitTripArgsSchema = z.object({
  tripId: uuidSchema,
});

export const getMyTripsArgsSchema = z.object({
  status: tripStatusSchema.optional(),
}).optional().transform(val => val ?? {});

export const listPendingTripsArgsSchema = z.object({
  department: z.string().optional(),
  hasBlockers: z.boolean().optional(),
}).optional().transform(val => val ?? {});

export const getTripReviewPacketArgsSchema = z.object({
  tripId: uuidSchema,
});

export const decideTripArgsSchema = z.object({
  tripId: uuidSchema,
  decision: approvalDecisionSchema,
  reason: z.string().optional(),
}).refine(
  (data) => {
    // Reason is required for approved_exception
    if (data.decision === 'approved_exception' && !data.reason?.trim()) {
      return false;
    }
    return true;
  },
  { 
    message: 'Reason is required when approving with exception',
    path: ['reason'],
  }
);

export const violationAnalyticsArgsSchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
  groupBy: groupByViolationSchema,
}).refine(
  (data) => data.startDate <= data.endDate,
  { message: 'Start date must be on or before end date' }
);

export const spendAnalyticsArgsSchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
  groupBy: groupBySpendSchema,
}).refine(
  (data) => data.startDate <= data.endDate,
  { message: 'Start date must be on or before end date' }
);