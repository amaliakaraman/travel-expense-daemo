-- Travel Expense Approval System Schema
-- Designed for deterministic policy enforcement w Daemo AI

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE user_role AS ENUM ('employee', 'finance_manager', 'admin');
CREATE TYPE trip_status AS ENUM ('draft', 'pending_review', 'approved', 'approved_exception', 'denied');
CREATE TYPE item_type AS ENUM ('flight', 'hotel', 'meal', 'transport');
CREATE TYPE violation_severity AS ENUM ('warning', 'blocker');
CREATE TYPE approval_decision AS ENUM ('approved', 'approved_exception', 'denied');

-- =============================================================================
-- TABLES
-- =============================================================================

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role user_role NOT NULL,
  department TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Travel policies
-- All monetary values stored as INT CENTS for determinism
CREATE TABLE travel_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  economy_only BOOLEAN NOT NULL DEFAULT true,
  hotel_nightly_cap_cents BIGINT NOT NULL DEFAULT 25000,      -- $250.00
  meal_daily_cap_cents BIGINT NOT NULL DEFAULT 7500,          -- $75.00
  preapproval_over_cents BIGINT NOT NULL DEFAULT 150000,      -- $1500.00
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trips (travel requests)
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  destination_city TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  purpose TEXT NOT NULL,
  status trip_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trip items (expenses within trip)
-- amount_cents: stored as int cents
-- meta: JSON for type-specific data
CREATE TABLE trip_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  type item_type NOT NULL,
  description TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Policy violations
CREATE TABLE violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                              -- BUSINESS_CLASS, HOTEL_CAP, MEAL_CAP, PREAPPROVAL
  severity violation_severity NOT NULL,
  message TEXT NOT NULL,
  computed_value_cents BIGINT,                     -- Value that triggered violation
  policy_value_cents BIGINT,                       -- Policy limit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Approval decisions
CREATE TABLE approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  reviewer_user_id UUID NOT NULL REFERENCES users(id),
  decision approval_decision NOT NULL,
  reason TEXT,                                     -- Required for approved_exception
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_trips_user_status ON trips(user_id, status);
CREATE INDEX idx_trip_items_trip ON trip_items(trip_id);
CREATE INDEX idx_violations_trip ON violations(trip_id);
CREATE INDEX idx_approvals_trip ON approvals(trip_id);
CREATE INDEX idx_violations_code_created ON violations(code, created_at);