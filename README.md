# Travel Expense Agent

An AI-powered travel expense approval system built with [Daemo](https://app.daemo.ai). Employees can submit trips and expenses through natural language, and finance managers can review and approve them, all through a chat interface.

## Why this exists

Corporate travel approvals are slow, inconsistent, and full of manual review. Employees submit expenses in scattered formats, managers chase missing info, and policy violations are often discovered too late in the process.

This project explores how an AI agent can act as the interface layer for a real approval system, keeping humans in control of decisions while automating the entire workflow around them.

## Built with

- **Node.js + TypeScript**
- **Daemo** — AI agent platform
- **Supabase** — PostgreSQL database
- **Zod** — input validation

## What it does

**For employees:**
- "Create a trip to New York next week for a client meeting"
- "Add a $450 flight and a hotel for 3 nights at $200/night"
- "Submit my trip for review"

**For finance managers:**
- "Show me all pending trips"
- "What are the policy violations on Alice's trip?"
- "Approve it with exception — the client requested business class"

The AI handles the conversation, but all the actual work happens through type-safe functions connected to a real Supabase database.

## How it works

```
You (chat) → Daemo AI → Your functions → Supabase
```

Your code runs locally. When you chat in the Daemo playground, it figures out which function to call, sends a request to your running service, and your function does the actual database work. The AI never touches your database directly.

## Quick setup

### 1. Get your accounts ready
- [Supabase](https://supabase.com) — free tier works fine
- [Daemo](https://app.daemo.ai) — create an agent and grab your API key

### 2. Set up the database
Run these in Supabase's SQL editor:
- `sql/schema.sql` — creates the tables
- `sql/seed.sql` — adds some test data (fake employees, trips, etc.)

### 3. Configure your `.env`

```env
# Your Daemo agent key
DAEMO_AGENT_API_KEY=your-key-here

# Your Supabase creds (Settings > API > Service Role Key)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Who you're logged in as (pick from seed data)
SESSION_USER_ID=11111111-1111-1111-1111-111111111111
SESSION_ROLE=employee
SESSION_DEPARTMENT=Engineering
```

### 4. Run it

```bash
npm install
npm run dev
```

You should see your 9 functions register, then "Authentication successful". Head to [app.daemo.ai](https://app.daemo.ai), open your agent's Playground, and start chatting!

## Switching roles

To switch between users, adjust your `.env`:

| Who | USER_ID | ROLE |
|-----|---------|------|
| Alice (engineer) | `11111111-1111-1111-1111-111111111111` | employee |
| Bob (sales) | `22222222-2222-2222-2222-222222222222` | employee |
| David (finance) | `44444444-4444-4444-4444-444444444444` | finance_manager |

Change the values, and restart with `npm run dev`. Note: The AI will only let you do things your role's permissions allow.

## The 9 functions

| Function | Who can use it | What it does |
|----------|----------------|--------------|
| `createTrip` | employees | Start a new trip request |
| `addTripItem` | employees | Add flights, hotels, meals |
| `submitTripForReview` | employees | Send to finance for approval |
| `getMyTrips` | employees | See your own trips |
| `listPendingTrips` | finance | See what needs review |
| `getTripReviewPacket` | finance | Full details + violations |
| `decideTrip` | finance | Approve, deny, or approve with exception |
| `getViolationAnalytics` | finance | Stats on policy violations |
| `getSpendAnalytics` | finance | Spending by department/employee |

## Policy rules

The system automatically flags trips that break company policy:

| Violation | What triggers it | Blocker? |
|-----------|------------------|----------|
| BUSINESS_CLASS | Booked business when policy says economy | Yes |
| HOTEL_CAP | Hotel > $250/night | No (warning) |
| MEAL_CAP | Meals > $75/day | No (warning) |
| PREAPPROVAL | Trip total > $1,500 | Yes |

Blockers require the finance manager to "approve with exception" and give a reason.

## Project structure

```
src/
├── index.ts                    # Connects to Daemo
├── services/
│   └── travelExpenseService.ts # The 9 functions
├── db/
│   ├── supabaseClient.ts       # Database connection
│   └── queries.ts              # All the SQL stuff
├── types/                      # TypeScript types
└── utils/
    ├── context.ts              # Gets user from .env
    ├── rbac.ts                 # Permission checks
    └── validation.ts           # Input validation (Zod)
```

## Troubleshooting

**"Failed to connect to Supabase"** — Check your URL and service role key. Make sure you ran the schema.sql.


**"FORBIDDEN" when trying something** — Change `SESSION_ROLE` to a user with the permissions needed in `.env` and restart.

**Connection keeps resetting** — Make sure you're using `https://engine.daemo.ai:50052` as the gateway URL

---

Built for Daemo.
