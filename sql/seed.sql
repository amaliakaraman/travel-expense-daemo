-- Travel Expense Approval Seed Data
-- Creates test data demonstrating policy violation scenarios

-- =============================================================================
-- POLICY
-- =============================================================================

INSERT INTO travel_policies (id, economy_only, hotel_nightly_cap_cents, meal_daily_cap_cents, preapproval_over_cents)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  true,                  -- economy_only
  25000,                 -- $250.00 hotel nightly cap
  7500,                  -- $75.00 meal daily cap
  150000                 -- $1500.00 preapproval threshold
);

-- =============================================================================
-- USERS (3 employees, 1 finance_manager, 1 admin)
-- =============================================================================

-- Employees
INSERT INTO users (id, name, role, department) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Alice Johnson', 'employee', 'Engineering'),
  ('22222222-2222-2222-2222-222222222222', 'Bob Smith', 'employee', 'Sales'),
  ('33333333-3333-3333-3333-333333333333', 'Carol Williams', 'employee', 'Marketing');

-- Finance Manager
INSERT INTO users (id, name, role, department) VALUES
  ('44444444-4444-4444-4444-444444444444', 'David Chen', 'finance_manager', 'Finance');

-- Admin
INSERT INTO users (id, name, role, department) VALUES
  ('55555555-5555-5555-5555-555555555555', 'Eva Martinez', 'admin', 'Finance');

-- =============================================================================
-- TRIPS + ITEMS (6 trips with violation scenarios)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Trip 1: Business Class Violation (BLOCKER)
-- Alice - Engineering - pending_review
-- -----------------------------------------------------------------------------
INSERT INTO trips (id, user_id, destination_city, start_date, end_date, purpose, status)
VALUES (
  'aaaa0001-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'New York',
  '2026-02-01',
  '2026-02-03',
  'Client presentation at NYC headquarters',
  'pending_review'
);

INSERT INTO trip_items (trip_id, type, description, amount_cents, meta) VALUES
  ('aaaa0001-0000-0000-0000-000000000001', 'flight', 'Round trip SFO to JFK - Business Class', 98000,
   '{"cabin": "business", "airline": "United"}'::jsonb),
  ('aaaa0001-0000-0000-0000-000000000001', 'hotel', 'Marriott Times Square - 2 nights', 45000,
   '{"nightly_rate_cents": 22500, "nights": 2}'::jsonb),
  ('aaaa0001-0000-0000-0000-000000000001', 'meal', 'Day 1 meals', 6500,
   '{"date": "2026-02-01"}'::jsonb),
  ('aaaa0001-0000-0000-0000-000000000001', 'meal', 'Day 2 meals', 7000,
   '{"date": "2026-02-02"}'::jsonb);

-- Pre-computed violations for Trip 1
INSERT INTO violations (trip_id, code, severity, message, computed_value_cents, policy_value_cents) VALUES
  ('aaaa0001-0000-0000-0000-000000000001', 'BUSINESS_CLASS', 'blocker',
   'Flight booked in business class; policy requires economy only', NULL, NULL);

-- -----------------------------------------------------------------------------
-- Trip 2: Hotel Cap Violation
-- Bob - Sales - pending_review
-- -----------------------------------------------------------------------------
INSERT INTO trips (id, user_id, destination_city, start_date, end_date, purpose, status)
VALUES (
  'aaaa0002-0000-0000-0000-000000000002',
  '22222222-2222-2222-2222-222222222222',
  'Chicago',
  '2026-02-10',
  '2026-02-12',
  'Sales conference and partner meetings',
  'pending_review'
);

INSERT INTO trip_items (trip_id, type, description, amount_cents, meta) VALUES
  ('aaaa0002-0000-0000-0000-000000000002', 'flight', 'Round trip LAX to ORD - Economy', 42000,
   '{"cabin": "economy", "airline": "American"}'::jsonb),
  ('aaaa0002-0000-0000-0000-000000000002', 'hotel', 'Four Seasons Chicago - 2 nights', 84000,
   '{"nightly_rate_cents": 42000, "nights": 2}'::jsonb),
  ('aaaa0002-0000-0000-0000-000000000002', 'meal', 'Day 1 meals', 6000,
   '{"date": "2026-02-10"}'::jsonb),
  ('aaaa0002-0000-0000-0000-000000000002', 'meal', 'Day 2 meals', 5500,
   '{"date": "2026-02-11"}'::jsonb);

-- Pre-computed violations for Trip 2
INSERT INTO violations (trip_id, code, severity, message, computed_value_cents, policy_value_cents) VALUES
  ('aaaa0002-0000-0000-0000-000000000002', 'HOTEL_CAP', 'warning',
   'Hotel nightly rate ($420.00) exceeds cap ($250.00)', 42000, 25000);

-- -----------------------------------------------------------------------------
-- Trip 3: Meal Cap Violation
-- Carol - Marketing - pending_review
-- -----------------------------------------------------------------------------
INSERT INTO trips (id, user_id, destination_city, start_date, end_date, purpose, status)
VALUES (
  'aaaa0003-0000-0000-0000-000000000003',
  '33333333-3333-3333-3333-333333333333',
  'Miami',
  '2026-02-15',
  '2026-02-17',
  'Marketing summit and brand workshop',
  'pending_review'
);

INSERT INTO trip_items (trip_id, type, description, amount_cents, meta) VALUES
  ('aaaa0003-0000-0000-0000-000000000003', 'flight', 'Round trip DFW to MIA - Economy', 35000,
   '{"cabin": "economy", "airline": "Delta"}'::jsonb),
  ('aaaa0003-0000-0000-0000-000000000003', 'hotel', 'Hilton Miami - 2 nights', 44000,
   '{"nightly_rate_cents": 22000, "nights": 2}'::jsonb),
  ('aaaa0003-0000-0000-0000-000000000003', 'meal', 'Day 1 meals - client dinner included', 12500,
   '{"date": "2026-02-15"}'::jsonb),
  ('aaaa0003-0000-0000-0000-000000000003', 'meal', 'Day 2 meals', 5000,
   '{"date": "2026-02-16"}'::jsonb);

-- Pre-computed violations for Trip 3
INSERT INTO violations (trip_id, code, severity, message, computed_value_cents, policy_value_cents) VALUES
  ('aaaa0003-0000-0000-0000-000000000003', 'MEAL_CAP', 'warning',
   'Meal spending on 2026-02-15 ($125.00) exceeds daily cap ($75.00)', 12500, 7500);

-- -----------------------------------------------------------------------------
-- Trip 4: Total Spend Over Preapproval Threshold (BLOCKER)
-- Alice - Engineering - pending_review
-- -----------------------------------------------------------------------------
INSERT INTO trips (id, user_id, destination_city, start_date, end_date, purpose, status)
VALUES (
  'aaaa0004-0000-0000-0000-000000000004',
  '11111111-1111-1111-1111-111111111111',
  'London',
  '2026-03-01',
  '2026-03-07',
  'International engineering conference',
  'pending_review'
);

INSERT INTO trip_items (trip_id, type, description, amount_cents, meta) VALUES
  ('aaaa0004-0000-0000-0000-000000000004', 'flight', 'Round trip SFO to LHR - Economy', 120000,
   '{"cabin": "economy", "airline": "British Airways"}'::jsonb),
  ('aaaa0004-0000-0000-0000-000000000004', 'hotel', 'Premier Inn London - 6 nights', 132000,
   '{"nightly_rate_cents": 22000, "nights": 6}'::jsonb),
  ('aaaa0004-0000-0000-0000-000000000004', 'meal', 'Day 1-2 meals', 14000,
   '{"date": "2026-03-01"}'::jsonb),
  ('aaaa0004-0000-0000-0000-000000000004', 'meal', 'Day 3-4 meals', 14000,
   '{"date": "2026-03-03"}'::jsonb),
  ('aaaa0004-0000-0000-0000-000000000004', 'meal', 'Day 5-6 meals', 14000,
   '{"date": "2026-03-05"}'::jsonb),
  ('aaaa0004-0000-0000-0000-000000000004', 'transport', 'Airport transfers and Tube pass', 8000,
   '{"type": "ground_transport"}'::jsonb);
-- Total: $3,020.00

-- Pre-computed violations for Trip 4
INSERT INTO violations (trip_id, code, severity, message, computed_value_cents, policy_value_cents) VALUES
  ('aaaa0004-0000-0000-0000-000000000004', 'PREAPPROVAL', 'blocker',
   'Total trip spend ($3,020.00) exceeds preapproval threshold ($1,500.00)', 302000, 150000);

-- -----------------------------------------------------------------------------
-- Trip 5: Clean Trip
-- Bob - Sales - pending_review
-- -----------------------------------------------------------------------------
INSERT INTO trips (id, user_id, destination_city, start_date, end_date, purpose, status)
VALUES (
  'aaaa0005-0000-0000-0000-000000000005',
  '22222222-2222-2222-2222-222222222222',
  'Denver',
  '2026-02-20',
  '2026-02-21',
  'Quick client check-in',
  'pending_review'
);

INSERT INTO trip_items (trip_id, type, description, amount_cents, meta) VALUES
  ('aaaa0005-0000-0000-0000-000000000005', 'flight', 'Round trip LAX to DEN - Economy', 28000,
   '{"cabin": "economy", "airline": "Southwest"}'::jsonb),
  ('aaaa0005-0000-0000-0000-000000000005', 'hotel', 'Hampton Inn Denver - 1 night', 18000,
   '{"nightly_rate_cents": 18000, "nights": 1}'::jsonb),
  ('aaaa0005-0000-0000-0000-000000000005', 'meal', 'Day 1 meals', 4500,
   '{"date": "2026-02-20"}'::jsonb);
-- Total: $505.00 - under threshold, all within caps

-- No violations for Trip 5

-- -----------------------------------------------------------------------------
-- Trip 6: Draft Trip (not yet submitted)
-- Carol - Marketing - draft
-- -----------------------------------------------------------------------------
INSERT INTO trips (id, user_id, destination_city, start_date, end_date, purpose, status)
VALUES (
  'aaaa0006-0000-0000-0000-000000000006',
  '33333333-3333-3333-3333-333333333333',
  'Seattle',
  '2026-03-15',
  '2026-03-17',
  'Product launch event',
  'draft'
);

INSERT INTO trip_items (trip_id, type, description, amount_cents, meta) VALUES
  ('aaaa0006-0000-0000-0000-000000000006', 'flight', 'Round trip DFW to SEA - Economy', 32000,
   '{"cabin": "economy", "airline": "Alaska"}'::jsonb),
  ('aaaa0006-0000-0000-0000-000000000006', 'hotel', 'Hyatt Seattle - 2 nights', 48000,
   '{"nightly_rate_cents": 24000, "nights": 2}'::jsonb);
-- Incomplete trip - no meals yet, still in draft

-- No violations computed yet