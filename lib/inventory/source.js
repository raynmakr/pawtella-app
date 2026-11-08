// Pluggable InventorySource: `getSource(name)` → { name, listItems() → Promise<Item[]> }.
// Item = { sku, barcode?, name, category?, brand?, priceCents, costCents?, qtyOnHand, updatedAt? }.
// Selected by INVENTORY_SOURCE: mock (default) | csv | franpos-csv | franpos-api | octopus-bridge.
import { env } from '../env.js';
import { createCsvSource } from './franpos-csv.js';
import { createFranposApiSource } from './franpos-api.js';
import { createOctopusBridgeSource } from './octopus-bridge.js';
import { createMockSource } from './mock.js';

export const SOURCES = ['mock', 'csv', 'franpos-csv', 'franpos-api', 'octopus-bridge'];

export function getSource(name = env.inventory.source, opts = {}) {
  switch (String(name || 'mock').toLowerCase()) {
    case 'mock':
      return createMockSource();
    case 'csv':
    case 'franpos-csv':
    case 'franpos':
      return createCsvSource(opts);
    case 'franpos-api':
      return createFranposApiSource();
    case 'octopus-bridge':
    case 'octopus':
      return createOctopusBridgeSource();
    default:
      throw new Error(`Unknown inventory source "${name}". Expected one of: ${SOURCES.join(', ')}`);
  }
}

export { parseFranposCsv } from './franpos-csv.js';
