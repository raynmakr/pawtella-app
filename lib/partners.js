// TODO(stub): minimal stand-in created by Backend C; Backend F owns the real module.
// Exports the contract surface lib/orders.js needs so paid orders can run end-to-end.
import { query } from './db.js';

const run = (tx) => (tx ? tx : { one: async (t, p) => (await query(t, p)).rows[0] ?? null, many: async (t, p) => (await query(t, p)).rows, query });

export async function findPartnerByCode(code) {
  return run().one('SELECT * FROM partners WHERE code = $1', [code]);
}

export async function getActiveAttribution(userId, tx) {
  return run(tx).one(
    `SELECT * FROM partner_attributions WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > now()) ORDER BY attributed_at DESC LIMIT 1`,
    [userId],
  );
}

export async function attributeUser() {
  console.log('[partners:stub] attributeUser noop');
  return null;
}

/** No-op until Backend F lands: logs and returns null. */
export async function accrueCommission(order) {
  console.log('[partners:stub] accrueCommission noop', { orderId: order?.id, userId: order?.user_id });
  return null;
}

export async function recomputeTiers() {
  return 0;
}
export async function matureEarnings() {
  return 0;
}
