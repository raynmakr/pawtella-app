-- Subscribe & Save: app-managed supply subscriptions (auto-ship).
--
-- Our own Shopify app ("Pawtella API") owns the subscription contracts so we can apply tiered
-- pricing that the stock Shopify Subscriptions app cannot. Shopify is the system of record; these
-- tables are a fast, queryable projection kept in sync by webhooks (subscription_contracts/*,
-- subscription_billing_attempts/*). They drive the tier engine, the billing cron, and the account
-- UI. Everything stays inert in production until SUBSCRIPTIONS_ENABLED is turned on.

-- The selling plan groups/plans we create with sellingPlanGroupCreate. One row per cadence plan
-- (every 2/4/6/8 weeks), all under one merchant-coded group. The setup script keeps this in sync.
CREATE TABLE IF NOT EXISTS selling_plan_groups (
  id                 SERIAL PRIMARY KEY,
  shopify_group_id   TEXT NOT NULL,
  merchant_code      TEXT NOT NULL,
  shopify_plan_id    TEXT UNIQUE NOT NULL,
  interval_weeks     INTEGER NOT NULL CHECK (interval_weeks > 0),
  base_percent       NUMERIC(5,2) NOT NULL DEFAULT 5,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS selling_plan_groups_weeks_idx ON selling_plan_groups(interval_weeks);

-- Mirror of a Shopify SubscriptionContract. tier_percent is the discount currently applied to all of
-- this customer's contracts (5 base, 10 once normalized monthly base spend exceeds $100 CAD).
-- monthly_value_cents is THIS contract's normalized base spend (sum of base_price * qty * 4.345/weeks);
-- the customer total is the sum across their active contracts.
CREATE TABLE IF NOT EXISTS subscription_contracts (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER REFERENCES users(id) ON DELETE SET NULL,
  shopify_contract_id   TEXT UNIQUE NOT NULL,
  shopify_customer_id   TEXT,
  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'paused', 'cancelled', 'expired', 'failed')),
  interval_weeks        INTEGER CHECK (interval_weeks > 0),
  tier_percent          NUMERIC(5,2) NOT NULL DEFAULT 5,
  monthly_value_cents   INTEGER NOT NULL DEFAULT 0,
  currency              TEXT NOT NULL DEFAULT 'CAD',
  next_billing_at       TIMESTAMPTZ,
  billing_failures      INTEGER NOT NULL DEFAULT 0,
  last_billing_error    TEXT,
  raw                   JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_contracts_user_idx ON subscription_contracts(user_id, status);
CREATE INDEX IF NOT EXISTS subscription_contracts_customer_idx ON subscription_contracts(shopify_customer_id, status);
CREATE INDEX IF NOT EXISTS subscription_contracts_due_idx ON subscription_contracts(status, next_billing_at);

CREATE TABLE IF NOT EXISTS subscription_lines (
  id                   SERIAL PRIMARY KEY,
  contract_id          INTEGER NOT NULL REFERENCES subscription_contracts(id) ON DELETE CASCADE,
  shopify_line_id      TEXT NOT NULL,
  variant_id           TEXT,
  product_id           TEXT,
  product_handle       TEXT,
  title                TEXT,
  sku                  TEXT,
  quantity             INTEGER NOT NULL DEFAULT 1,
  base_price_cents     INTEGER NOT NULL DEFAULT 0,   -- one-time (pre-subscription-discount) unit price
  current_price_cents  INTEGER NOT NULL DEFAULT 0,   -- unit price currently on the contract line
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_id, shopify_line_id)
);
CREATE INDEX IF NOT EXISTS subscription_lines_contract_idx ON subscription_lines(contract_id);

-- One row per subscriptionBillingAttemptCreate we trigger. idempotency_key is our dedupe handle both
-- locally and at Shopify, so a retried cron never double-charges.
CREATE TABLE IF NOT EXISTS subscription_billing_attempts (
  id                    SERIAL PRIMARY KEY,
  contract_id           INTEGER REFERENCES subscription_contracts(id) ON DELETE CASCADE,
  shopify_contract_id   TEXT NOT NULL,
  shopify_attempt_id    TEXT,
  idempotency_key       TEXT UNIQUE NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'success', 'failure')),
  error_code            TEXT,
  shopify_order_id      TEXT,
  attempt_number        INTEGER NOT NULL DEFAULT 1,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS subscription_billing_attempts_contract_idx
  ON subscription_billing_attempts(contract_id, created_at DESC);

CREATE TRIGGER selling_plan_groups_updated_at BEFORE UPDATE ON selling_plan_groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER subscription_contracts_updated_at BEFORE UPDATE ON subscription_contracts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER subscription_lines_updated_at BEFORE UPDATE ON subscription_lines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
