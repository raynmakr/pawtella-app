// DB rows are snake_case; API JSON is camelCase. Convert at the API boundary.

const camelCache = new Map();

export function toCamel(key) {
  let v = camelCache.get(key);
  if (!v) {
    v = key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
    camelCache.set(key, v);
  }
  return v;
}

/** Deeply camelize object keys. Dates, Buffers and primitives pass through. */
export function camelize(value) {
  if (Array.isArray(value)) return value.map(camelize);
  if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[toCamel(k)] = camelize(v);
    return out;
  }
  return value;
}

/** Pick a subset of keys from an object. */
export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/** Omit keys from an object. */
export function omit(obj, keys) {
  const out = { ...obj };
  for (const k of keys) delete out[k];
  return out;
}

/** Cents → "12.34" string for display payloads. */
export function centsToDecimal(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}
