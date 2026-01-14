/**
 * Travel Expense Daemo Agent - Entry Point
 * 
 * Daemo Winter Developer Fellowship Demo
 * 
 * This file:
 * 1. Loads environment variables (dotenv)
 * 2. Imports reflect-metadata (MUST be first for decorators)
 * 3. Builds the Daemo session with system prompt
 * 4. Registers the TravelExpenseService
 * 5. Connects via DaemoHostedConnection
 */

// CRITICAL: import reflect-metadata FIRST before any decorators
import 'dotenv/config';
import 'reflect-metadata';

import { DaemoBuilder, DaemoHostedConnection } from 'daemo-engine';
import { TravelExpenseService } from './services/travelExpenseService';
import { testConnection } from './db/supabaseClient';

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

const SYSTEM_PROMPT = `You are a Travel Expense Approval Assistant for finance teams.

## Your Capabilities
You help employees submit travel expense requests and help finance managers review and approve them.

## Rules
1. ALWAYS use tools for any action. Never fabricate approvals, totals, or violation status.
2. User identity (userId, role) is injected from session context. NEVER ask for or accept userId/role from the user.
3. The current user's role determines what they can do:
   - employee: create trips, add items, submit for review, view own trips
   - finance_manager/admin: list pending trips, review trip details, approve/deny

## Workflow for Employees
1. createTrip - Create a new trip with destination, dates, and purpose
2. addTripItem - Add expenses (flight, hotel, meal, transport) with amounts in CENTS
   - For flights: include meta.cabin ("economy", "business", or "first")
   - For hotels: include meta.nightly_rate_cents and meta.nights
   - For meals: include meta.date (YYYY-MM-DD)
3. submitTripForReview - Submit when done; this evaluates policy violations

## Workflow for Finance Managers
1. listPendingTrips - See all trips awaiting review (can filter by department or blockers)
2. getTripReviewPacket - ALWAYS call this before deciding; shows full details and violations
3. decideTrip - Make decision: "approved", "approved_exception" (requires reason), or "denied"

## Policy Violations
- BUSINESS_CLASS (blocker): Non-economy flights when policy requires economy
- HOTEL_CAP (warning): Hotel nightly rate exceeds policy cap
- MEAL_CAP (warning): Daily meal spending exceeds policy cap
- PREAPPROVAL (blocker): Total trip cost exceeds preapproval threshold

## Important Notes
- All amounts are in CENTS (e.g., $250.00 = 25000 cents)
- Dates must be in YYYY-MM-DD format
- "blocker" violations require "approved_exception" with a reason to approve
- If a tool returns an error, explain it to the user and suggest corrections
`;

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('Travel Expense Daemo Agent Starting...\n');

  // Validate required environment variables
  const requiredEnvVars = [
    'DAEMO_AGENT_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SESSION_USER_ID',
    'SESSION_ROLE',
    'SESSION_DEPARTMENT',
  ];

  const missing = requiredEnvVars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach((v) => console.error(`   - ${v}`));
    console.error('\nCopy .env.example to .env and fill in the values.');
    process.exit(1);
  }

  // Log session context (for demo visibility)
  console.log('Session Context (injected, not from LLM):');
  console.log(`   User ID: ${process.env.SESSION_USER_ID}`);
  console.log(`   Role: ${process.env.SESSION_ROLE}`);
  console.log(`   Department: ${process.env.SESSION_DEPARTMENT}\n`);

  // Test Supabase connection
  console.log('Testing Supabase connection...');
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error('Failed to connect to Supabase. Check your credentials.');
    process.exit(1);
  }
  console.log('Supabase connected\n');

  // Create service instance
  const travelExpenseService = new TravelExpenseService();

  // Build Daemo session data
  console.log('Building Daemo session...');
  const sessionData = new DaemoBuilder()
    .withServiceName('TravelExpenseService')
    .withSystemPrompt(SYSTEM_PROMPT)
    .registerService(travelExpenseService)
    .build();

  // Create hosted connection
  const gatewayUrl = process.env.DAEMO_GATEWAY_URL || 'https://engine.daemo.ai:50052';
  const connection = new DaemoHostedConnection(
    { 
      daemoGatewayUrl: gatewayUrl,
      agentApiKey: process.env.DAEMO_AGENT_API_KEY!,
    },
    sessionData
  );

  // Start the connection
  console.log('Connecting to Daemo Engine...');
  await connection.start();

  console.log('\nTravel Expense Agent is ONLINE!\n');
  console.log('Dashboard: https://app.daemo.ai');
  console.log('   - View registered functions');
  console.log('   - Test in Playground');
  console.log('   - Monitor logs\n');
  console.log('To switch roles, edit .env and restart the service.\n');
  console.log('Press Ctrl+C to stop.\n');
}

// Run
main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
