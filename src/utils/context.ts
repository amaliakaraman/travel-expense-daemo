/**
 * Session Context Injection
 * 
 * This module simulates Daemo's Context Injection principle by reading
 * user identity from environment variables rather than accepting them
 * from LLM-provided function arguments.
 * 
 * In production, this would integrate with your actual auth system
 * (JWT tokens, session middleware, etc.)
 */

import type { SessionContext, UserRole } from '../types/domain';

const VALID_ROLES: UserRole[] = ['employee', 'finance_manager', 'admin'];

/**
 * Get the current session context from environment variables.
 * This is called at the start of every tool function to inject identity.
 * 
 * The LLM CANNOT override these values - they come from a trusted source.
 */
export function getSessionContext(): SessionContext {
  const userId = process.env.SESSION_USER_ID;
  const role = process.env.SESSION_ROLE as UserRole | undefined;
  const department = process.env.SESSION_DEPARTMENT;

  if (!userId) {
    throw new Error(
      'SESSION_USER_ID not configured. Set it in .env to simulate an authenticated user.'
    );
  }

  if (!role || !VALID_ROLES.includes(role)) {
    throw new Error(
      `SESSION_ROLE must be one of: ${VALID_ROLES.join(', ')}. Got: ${role}`
    );
  }

  if (!department) {
    throw new Error(
      'SESSION_DEPARTMENT not configured. Set it in .env to simulate an authenticated user.'
    );
  }

  return {
    userId,
    role,
    department,
  };
}

/**
 * Helper to check if current session has finance/admin privileges
 */
export function isFinanceOrAdmin(ctx: SessionContext): boolean {
  return ctx.role === 'finance_manager' || ctx.role === 'admin';
}

/**
 * Helper to check if current session is admin
 */
export function isAdmin(ctx: SessionContext): boolean {
  return ctx.role === 'admin';
}