# StockHouse — Full Build Plan

## Summary

Build StockHouse from scratch: a monorepo with `server/` (Node.js + Express + better-sqlite3) and `client/` (React 18 + Vite + Tailwind + Recharts). 13 coding tasks across 7 phases, max 4 concurrent agents. Critical path: T1 → T3 → T4 → T5 → T8 → T10 (6 serial steps). All math formulas, business logic, and UI specifications follow the master prompt verbatim.

## Key Architecture Decisions

- **Schema-first**: Task 1 delivers the complete `schema.sql` (all ~25 tables) upfront. No agent may add/alter tables — this prevents migration conflicts.
- **Movement writer is the ledger**: All stock changes flow through `inventoryService.postMovement()`. No other code inserts into `stock_movements`.
- **Services are pure**: Services never touch `req`/`res`. Routes are thin orchestrators. Business logic is unit-testable.
- **Prepared statements at module scope**: Never call `db.prepare()` inside a handler or loop.
- **React Query for all server state**: No Redux, no Context for server data. Hierarchical query keys for surgical invalidation.
- **JavaScript (not TypeScript)** per spec — use JSDoc for component prop documentation.

## Performance Patterns (All Agents Must Follow)

1. **SQLite pragmas** on connection: `WAL`, `foreign_keys=ON`, `busy_timeout=5000`, `synchronous=NORMAL`, `cache_size=-20000`, `temp_store=MEMORY`
2. **Covering indexes** on `stock_movements(ingredient_id, movement_date, qty_base, unit_cost, movement_type)` for report queries
3. **FK indexes** on every foreign key column (SQLite does NOT auto-index FKs)
4. **No N+1**: Use JOINs or `json_group_array`/`json_object` for parent+children queries
5. **No SELECT ***: Always specify explicit columns in production queries
6. **Transaction wrapping**: All multi-table mutations in `db.transaction()`
7. **Bulk seed inserts**: Prepare once, loop `.run()` inside single transaction
8. **Frontend**: `React.lazy()` for all page routes; `staleTime: 5min` on QueryClient; `useMemo` for chart data transforms; debounce search inputs 300ms
9. **Unit conversion cache**: Build adjacency list on startup, cache BFS results in Map, invalidate on conversion CRUD
10. **Quantities**: `round3()` helper; Money: `round2()` helper; Currency: `Intl.NumberFormat('en-IN')` → ₹1,23,456.78

## Error Handling Pattern

- `AppError` base class with `statusCode` and `code` fields
- Subclasses: `NotFoundError(404)`, `ValidationError(400)`, `ConflictError(409)`, `UnauthorizedError(401)`, `ForbiddenError(403)`
- Global `errorHandler` middleware: known errors return structured `{ error: { code, message, details? } }`, unknown → 500
- Every route: `authenticate → authorize → validate(zodSchema) → handler → service call → response`

## Zod Schema Convention

One file per resource in `server/src/schemas/`. Exports: `createXxxSchema`, `updateXxxSchema`, `xxxParamsSchema`, `xxxQuerySchema`. Client-side schemas in `client/src/schemas/` mirror server schemas adapted for form needs.

---

## Task Breakdown

### Task 1: Backend Foundation (Checkpoints 1–3) — XL

**Scope**: Complete project scaffold, database, schema, core services, auth, and all middleware. This is the "constitution" — every subsequent task depends on it.

**Files**:
- Root: `package.json`, `.env.example`, `.gitignore`
- `server/package.json`, `server/src/index.js` (Express bootstrap with cors, morgan, error handler)
- `server/src/db.js` (better-sqlite3 singleton + pragmas + migration runner)
- `server/src/schema.sql` (ALL ~25 tables verbatim from spec Section 4 + indexes on every FK)
- `server/src/middleware/` — `auth.js`, `requireRole.js`, `validate.js`, `errorHandler.js`
- `server/src/utils/` — `errors.js` (error hierarchy), `response.js` (envelope helpers), `helpers.js` (round2, round3)
- `server/src/services/conversionService.js` — BFS graph traversal, `toBase()`, `fromBase()`, `convert()`, `describeConversion()`, memoized conversion cache
- `server/src/services/costingService.js` — weighted moving average on purchase confirm
- `server/src/services/inventoryService.js` — `postMovement()` single transactional writer + `getStock()` reader
- `server/src/routes/auth.js` — login, me, user CRUD (admin)
- `server/src/schemas/auth.schemas.js`
- `client/package.json`, `client/vite.config.js` (proxy /api → localhost:4000), `client/index.html`
- `client/tailwind.config.js`, `client/postcss.config.js`
- `client/src/main.jsx` (stub)

**Dependencies**: None
**Verification**: `npm install` succeeds in both folders; server starts and creates DB with all tables; `POST /api/auth/login` works with a manually inserted test user; conversion service passes inline smoke tests (1 carton → 12000 ml, carton→g throws UNIT_DIMENSION_MISMATCH).

---

### Task 2: Reference Data Routes (Checkpoint 4) — M

**Scope**: CRUD routes for units, ingredients, suppliers with full zod validation.

**Files**:
- `server/src/routes/units.js` — GET, POST, GET conversions, POST conversion, POST convert
- `server/src/routes/ingredients.js` — GET (with filters: q, category, low_stock, expiring_days, sort), GET /:id (with last 30 movements + sparkline data), POST, PATCH
- `server/src/routes/suppliers.js` — GET, POST, PATCH, GET price-changes
- `server/src/schemas/unit.schemas.js`, `ingredient.schemas.js`, `supplier.schemas.js`

**Dependencies**: Task 1
**Parallel with**: Task 3, Task 6

---

### Task 3: Menu, Recipes, Channels Routes (Checkpoint 6) — M

**Scope**: Menu items with recipe versioning, channels with commission rates.

**Files**:
- `server/src/routes/menuItems.js` — GET (with cost/margin), POST, PATCH, GET /:id/recipes, POST /:id/recipes (creates new version), POST /:id/recalc-cost
- `server/src/routes/channels.js` — GET, POST, PATCH
- `server/src/schemas/menuItem.schemas.js`, `channel.schemas.js`

**Dependencies**: Task 1 (core services), Task 2 (ingredients/units must exist for recipe lines)
**Note**: Recipe cost calculation uses `conversionService` to normalize quantities and `costingService` for ingredient costs.

---

### Task 4: Operations Routes (Checkpoints 5, 7, 8, 9) — XL

**Scope**: The four main transactional workflows — purchases, sales, wastage/transfers, and counts/variance. All use `inventoryService.postMovement()`.

**Files**:
- `server/src/routes/purchases.js` — GET, GET /:id, POST (draft), PATCH (draft only), POST /:id/confirm (WMA + movements), POST /:id/void (reversal movements), POST /ocr (stub or vision)
- `server/src/routes/sales.js` — POST (with recipe deduction), POST /import (CSV), GET, GET /summary, GET /missing-recipes
- `server/src/services/saleService.js` — sale ingestion + recipe explosion into movements
- `server/src/routes/wastage.js` — POST (single call, no drafts), GET, GET /summary
- `server/src/routes/transfers.js` — POST (paired transfer_out/transfer_in), GET
- `server/src/routes/counts.js` — POST (open count with expected snapshot), GET, GET /:id, PUT /:id/items, POST /:id/complete (posts count_correction movements)
- `server/src/services/varianceService.js` — expected vs actual calculation per spec Section 6.3
- `server/src/schemas/` — purchase, sale, wastage, transfer, count schemas
- `server/src/services/purchaseService.js` — purchase confirmation logic (WMA update + movements)

**Dependencies**: Task 1 (core services), Task 2 (ingredients/suppliers), Task 3 (recipes for sale deduction)
**Key logic**:
- Purchase confirm: within `db.transaction()` → update WMA via costingService → post `purchase` movements → upsert supplier_prices → update cached stock
- Sale recording: within `db.transaction()` → insert sale + sale_items → for each item, fetch active recipe → for each recipe line, `postMovement(type='sale', qty_base=-consumed)` → return unpriced_items count
- Wastage: single call → `postMovement(type='wastage', qty_base=-qty)` with est_value
- Count complete: validate all over-threshold variances have reason_text → post `count_correction` movements → fire variance alerts

---

### Task 5: Seed Script (Checkpoint 10) — XL

**Scope**: Idempotent seed generating 60 days of realistic data relative to "today". Uses service functions directly (not HTTP) to ensure data consistency.

**File**: `server/src/seed.js`

**Dependencies**: Tasks 1–4 (all backend services and routes)
**Key requirements**:
- Seed users: admin/admin123, manager/manager123 (Ravi Kumar), staff/pin 1234 (Sunita)
- 28 ingredients, 6 suppliers, 14 menu items with full recipes (all per spec Section 10)
- 60 days of sales with day-of-week baselines, channel/payment/shift weights, ±15% noise
- Purchases every 2 days per supplier, chicken price +8% step-up 10 days ago, tomato +5% 5 days ago
- 0–3 wastage events/day with reason weights
- 3 completed counts (7, 3, 1 days ago) — yesterday's count MUST reproduce the chicken variance scenario: opening 20kg → purchases 30kg → expected consumption 42kg → wastage 2kg → expected 6.0kg → actual 4.5kg → variance −1.5kg (−₹360)
- Opening stock movements 60 days ago
- Settings seed: food_cost_target=30, safety_stock_days=1, variance thresholds, etc.
- **Self-validation pass**: after seeding, verify sum of movements = current_stock_base for every ingredient
- **Deterministic**: use seeded PRNG for reproducible data
- Bulk insert pattern: `db.transaction()` wrapping prepared statement loops

---

### Task 6: Frontend Shell + Design System (Checkpoint 14) — XL

**Scope**: Complete frontend foundation — auth flow, layout, router, all shared UI components, chart wrappers, API client.

**Files**:
- `client/src/main.jsx`, `client/src/App.jsx`
- `client/src/api/client.js` — axios instance with JWT injection, 401 redirect, base URL /api
- `client/src/api/queryClient.js` — QueryClient with staleTime 5min, gcTime 10min, retry 1
- `client/src/context/AuthContext.jsx` — login/logout/me, token in localStorage
- `client/src/components/layout/` — `SidebarLayout.jsx` (collapsible sidebar, icon+label, active highlight), `Topbar.jsx` (search, alerts bell with unread count dropdown, user menu)
- `client/src/components/ui/` — `KpiCard.jsx`, `DataTable.jsx` (sortable, paginated, CSV export, sticky header), `Modal.jsx`, `ConfirmDialog.jsx`, `Toast.jsx`, `EmptyState.jsx`, `PageHeader.jsx` (title, date-range picker, action button), `IngredientCombobox.jsx`, `QtyUnitInput.jsx` (qty + unit select + live base-equivalent), `VarianceBadge.jsx`, `Badge.jsx`, `Spinner.jsx`, `FormField.jsx`
- `client/src/components/charts/` — `ChartCard.jsx`, `AreaChart.jsx`, `BarChart.jsx`, `DonutChart.jsx`, `ScatterChart.jsx` (all recharts wrappers)
- `client/src/utils/format.js` — `formatMoney()` (₹ en-IN), `formatQty()` (smart unit display: g→kg≥1000, ml→L≥1000), `formatDate()`
- `client/src/utils/constants.js`
- `client/src/router.jsx` — all 15 page routes with React.lazy + Suspense
- `client/src/pages/Login.jsx` — centered card, logo, demo credentials in dev mode
- Tailwind config: slate neutrals, indigo-600 primary, emerald-600 positive, rose-600 negative, amber-500 warning, white cards on slate-50, rounded-xl shadow-sm

**Dependencies**: Task 1 (scaffold + auth API)
**Parallel with**: Task 2, Task 3

**Component conventions** (JSDoc documented):
- DataTable: `columns` prop = `[{ key, label, render?, sortable?, align? }]`
- KpiCard: `{ label, value, delta, deltaLabel, sparklineData?, onClick? }`
- All components accept `className` for Tailwind merging
- Responsive: sidebar collapses to bottom tab bar <768px

---

### Task 7: Frontend Core Pages (Checkpoint 15 — Part 1) — XL

**Scope**: 5 main operation pages + their React Query hooks.

**Pages**:
1. **Daily Control (`/`)** — 6 KPI cards, 4 chart rows (sales trend, channel donut, payment stacked bar, food cost vs target), 5 list sections (low stock, expiring, at-risk menu items, alerts, variance summary)
2. **Inventory (`/inventory`)** — 5 tabs: Stock (DataTable with days-remaining color coding), Expiry, Movers (fast/slow), Price Changes, Variance (diverging bar chart + table by shift/employee)
3. **Purchases (`/purchases`)** — list with filters, detail drawer, New Purchase form (supplier select, repeating line rows with IngredientCombobox, running totals), Confirm with cost-impact summary, Scan Invoice button (OCR or notice)
4. **Wastage (`/wastage`)** — Quick Entry panel (≤4 interactions, ≤20s), running counter, analytics (by reason, ingredient, trend, shift)
5. **Sales (`/sales`)** — list with filters, New Sale modal, Import CSV with template download and error report, summary cards

**Hook files**: `client/src/api/` — `useDailyControl.js`, `useInventory.js`, `usePurchases.js`, `useWastage.js`, `useSales.js`

**Dependencies**: Tasks 5 (seed data), 6 (frontend shell), 4 (backend operations APIs)

---

### Task 8: Frontend Secondary Pages (Checkpoint 15 — Part 2) — XL

**Scope**: Remaining 7 pages + hooks.

**Pages**:
1. **Stock Counts (`/counts`)** — count list, New Count (scope selection), count sheet (expected/actual/variance with live calculation, reason required above threshold), Complete Count with confirmation modal
2. **Menu & Recipes (`/menu`)** — grid/table, item editor, Recipe editor (version banner, ingredient rows with QtyUnitInput, live cost readout)
3. **Profitability (`/profitability`)** — date range, profitability table with class chips, Menu Engineering scatter (popularity vs CM%, quadrant mean lines, labeled points), channel margin heatmap
4. **Forecast (`/forecast`)** — Generate button, 7-day table per menu item, Ingredient Requirements tab, Recommended Orders tab with "Create Draft PO" per supplier
5. **Purchase Orders (`/orders`)** — list with status pipeline chips, detail with approval panel, "AI suggested" badge, "Mark Received" flow
6. **Suppliers (`/suppliers`)** — cards/table with contact/terms/rating, detail with price list sparklines
7. **Settings (`/settings`)** (admin) — tabs: Ingredients, Units, Wastage Reasons, Channels, Users, Thresholds, Holidays, Data
8. **Audit (`/audit`)** (admin/manager) — filterable log with before/after diff viewer

**Dependencies**: Tasks 5, 6, 4 (same as Task 7)
**Parallel with**: Task 7

---

### Task 9: Backend Reports + Forecast + Alerts (Checkpoints 11–13) — XL

**Scope**: All report services, forecast engine, reorder recommendations, PO management, and alert system.

**Files**:
- `server/src/services/reportService.js` — daily control payload, food cost (actual + potential), variance (by ingredient/shift/employee), inventory valuation, movers, profitability (per item + channel matrix + Star/Plowhorse/Puzzle/Dog classification), channel mix
- `server/src/services/forecastService.js` — dow-4wk-trend method per spec Section 6.7, aggregate to ingredient requirements with safety qty
- `server/src/services/reorderService.js` — recommendations grouped by supplier per spec Section 6.8
- `server/src/services/alertService.js` — `scan()` on 15-min interval + on-demand, 8 alert types per spec Section 6.9, 12-hour dedup
- `server/src/routes/reports.js` — all GET /reports/* endpoints
- `server/src/routes/forecast.js` — POST generate, GET forecast, GET ingredient-requirements
- `server/src/routes/purchaseOrders.js` — POST recommendations, CRUD, approve, cancel, receive (creates confirmed purchase)
- `server/src/routes/alerts.js` — GET, POST read, POST scan
- `server/src/routes/settings.js` — GET, PUT (admin)
- `server/src/routes/audit.js` — GET (admin/manager)
- `server/src/routes/dashboard.js` — GET /dashboard/daily (alias), GET /health

**Dependencies**: Task 4 (all operations routes complete for data shape)
**Parallel with**: Task 5 (seed script)

---

### Task 10: AI System (Checkpoint 16) — XL

**Scope**: Complete AI chatbot — backend tools, guardrails, mock router, chat endpoint, and frontend chat UI.

**Backend files**:
- `server/src/ai/tools.js` — 12 tool definitions with JSON schemas: `get_daily_summary`, `get_sales_by_channel`, `get_food_cost`, `get_stock_levels`, `get_stock_variance`, `get_wastage_analysis`, `get_menu_profitability`, `get_forecast`, `get_purchase_recommendation`, `get_supplier_price_history`, `get_low_stock`/`get_expiring`, `create_draft_purchase_order`, `run_sql`
- `server/src/ai/systemPrompt.js` — verbatim nested prompt from spec Section 9.3 with `{{date}}` and `{{restaurant_name}}` substitution
- `server/src/ai/guardrails.js` — read-only SQL validation: single statement, starts with SELECT/WITH, denylist regex, no stacked statements, auto LIMIT 200, 2-second timeout, audit logging
- `server/src/services/aiService.js` — `chat(sessionId, message, user)`: load last 12 messages, assemble context, call LLM or mock router, execute tools against readonly DB connection (max 5 iterations), persist turns, return markdown reply
- `server/src/ai/mockRouter.js` — keyword-intent matching (English + Hinglish: "kal"→yesterday, "aaj"→today) routing to same tools, template replies matching LLM output shape
- `server/src/routes/ai.js` — POST /ai/chat, GET /ai/history/:session_id, GET /ai/suggested-prompts, GET /ai/status

**Frontend files**:
- `client/src/pages/Assistant.jsx` — full-height chat panel, markdown rendering (tables styled), tool-usage chips, suggested-prompt chips on empty state, input with send, session in localStorage, provider mode badge
- `client/src/api/useChat.js`

**Dependencies**: Task 9 (report services for tool implementations), Task 6 (frontend shell)
**Key**: AI uses a **separate readonly DB connection** (`new Database(path, { readonly: true })`). The `create_draft_purchase_order` tool requires `confirmed=true` parameter (model must have confirmed with user in preceding turn).

---

### Task 11: Vitest Tests (Checkpoint 17 — Part 1) — L

**Scope**: All unit tests specified in Section 13 with exact expected values.

**Files**: `server/tests/` directory:
- `conversionService.test.js` — carton→ml=12000, 2.5kg→g=2500, carton→g throws UNIT_DIMENSION_MISMATCH
- `costingService.test.js` — 0→buy 10kg@₹200→avg 200; buy 20kg@₹245→avg ₹230; consume 5kg→value ₹1150
- `varianceService.test.js` — opening 20kg + purchases 30kg − consumption 42kg − wastage 2kg = expected 6kg; actual 4.5kg → variance −1.5kg, −₹360
- `reorderService.test.js` — forecast 15kg + safety 3 − stock 0 − incoming 0 = 18kg; with min order 5 and result 2 → bumps to 5
- `forecastService.test.js` — [40,44,38,42] → dow_base 41, trend 0, no holiday → 41; with holiday 1.3 → 53.3
- `reportService.test.js` — consumption ₹34800 / net sales ₹100000 = 34.8%
- `profitability.test.js` — ₹280 biryani: Swiggy CM = ₹113.0 (40.4%), Dine-in CM = ₹174.6 (62.4%)
- `guardrails.test.js` — DROP TABLE rejected, SELECT * gets LIMIT, multi-statement rejected

**Dependencies**: Tasks 1, 4, 9 (services must exist)

---

### Task 12: Acceptance Verification + README (Checkpoint 17 — Part 2) — L

**Scope**: Run the full acceptance checklist (20 items from spec Section 13), fix any issues, write comprehensive README per Section 14.

**Files**: `README.md` — setup, env vars, demo logins, architecture diagram, schema overview, formula reference, AI modes, CSV template, known limitations, roadmap hooks

**Dependencies**: All previous tasks
**Verification**: All 20 acceptance criteria pass, `npm test` green, `npm run dev` boots cleanly.

---

## Execution Phases

```
Phase 1 — Foundation (Sequential)
  [T1: Backend Foundation] ───────────────────────────────►

Phase 2 — Reference Data + Frontend (3 parallel agents)
  [T2: Units/Ingredients/Suppliers routes] ──────►
  [T3: Menu/Recipes/Channels routes] ────────────►
  [T6: Frontend Shell + Design System] ──────────────────►

Phase 3 — Operations + Analytics (2 parallel agents)
  [T4: Purchases/Sales/Wastage/Counts] ─────────────────►
  [T9: Reports/Forecast/POs/Alerts] ────────────────────►

Phase 4 — Seed + Frontend Pages (3 parallel agents)
  [T5: Seed Script] ──────────────────►
  [T7: Frontend Core Pages] ──────────────────────────────►
  [T8: Frontend Secondary Pages] ─────────────────────────►

Phase 5 — AI System
  [T10: AI Chatbot backend + frontend] ──────────────────►

Phase 6 — Testing (2 parallel agents)
  [T11: Vitest Unit Tests] ──────────►
  [T12: Acceptance + README] ────────────────────────────►

Phase 7 — Code Review
  [3x CodeReview agents: completeness, correctness, impact]
```

## Integration Checkpoints

**Checkpoint 1 — "Schema Lock"** (after T1): All tables exist, auth works, core services pass smoke tests. No agent may alter schema.sql after this.

**Checkpoint 2 — "APIs Complete"** (after T2+T3+T4+T9): All ~40 endpoints functional. Cross-check: ingredient CRUD → purchase with that ingredient → sale with recipe using it → variance calculation. Verify stock movement ledger consistency.

**Checkpoint 3 — "Data Trustworthy"** (after T5): Seed validation pass — sum of movements = current_stock_base for every ingredient. Chicken variance scenario reproduces exactly (−1.5kg, −₹360).

**Checkpoint 4 — "UI Complete"** (after T6+T7+T8+T10): All 15 pages + chat render with seeded data. No console errors. Money in en-IN format. Wastage quick entry ≤4 interactions.

**Checkpoint 5 — "Release Ready"** (after T11+T12): All unit tests pass, all 20 acceptance criteria verified, README complete.

## Rejected Alternatives

1. **Python/FastAPI backend** (Plan C): Rejected because the spec explicitly locks Node.js + Express + better-sqlite3. Python would violate the locked stack.
2. **TypeScript frontend** (Plan C): Rejected — spec says "JavaScript, not TypeScript — keep the codebase approachable for a small team."
3. **Zustand for state** (Plan C): Rejected — spec mandates @tanstack/react-query for all server state, no Redux, no Context for server data.
4. **Cursor-based pagination everywhere** (Plan B): Overkill for a single-restaurant app with 60 days of data. Standard offset pagination (default 50, max 200) is simpler and sufficient. Cursor-based only if stock_movements table grows very large.
5. **Maximum parallelism from day 1** (Plan B): Rejected in favor of sequential foundation phase. The cost of fixing schema mismatches across parallel agents far exceeds the time saved by early parallelism.
6. **Seed script via HTTP calls** (considered): Rejected — seed should use service functions directly within transactions for data consistency and speed. A 15K-row seed completes in &lt;2s this way vs. minutes via HTTP.
