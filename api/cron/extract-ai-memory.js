// Background AI context memory: extract a structured profile from conversations with new activity
// (memory-enabled users only) so chat latency never pays for it. Idempotent via memory_extracted_at.
import { route, requireCron } from '../../lib/http.js';
import { env } from '../../lib/env.js';
import { runMemoryExtraction } from '../../lib/ai-memory.js';

async function run(req) {
  requireCron(req, env.cronSecret);
  const result = await runMemoryExtraction({ limit: 25 });
  console.log('[cron] extract-ai-memory', result);
  return { ok: true, ...result };
}

export default route({ GET: run, POST: run });
