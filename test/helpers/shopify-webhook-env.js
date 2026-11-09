// Imported FIRST by webhook tests so lib/env.js sees a webhook secret (ESM imports are hoisted).
import '../../scripts/load-env.js';
process.env.SHOPIFY_WEBHOOK_SECRET ||= 'test-webhook-secret';
