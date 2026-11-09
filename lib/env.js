// Single place that reads environment variables and exposes feature flags.
// Missing third-party keys switch the matching module into mock mode instead of crashing.

const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL_ENV;

function str(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function list(name) {
  return str(name)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function bool(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(v.toLowerCase());
}

const jwtSecret = str('JWT_SECRET');
if (isProd && !jwtSecret) {
  throw new Error('JWT_SECRET must be set in production');
}

export const env = {
  isProd,
  databaseUrl: str('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/pawtella'),
  databaseSsl: bool('DATABASE_SSL', true),
  jwtSecret: jwtSecret || 'dev-only-secret-not-for-production',
  appUrl: str('APP_URL', 'http://localhost:3000').replace(/\/$/, ''),
  appScheme: str('APP_SCHEME', 'pawtella'),
  cronSecret: str('CRON_SECRET'),
  adminEmail: str('ADMIN_EMAIL'),
  timezone: str('APP_TIMEZONE', 'America/Toronto'),

  apple: { bundleId: str('APPLE_BUNDLE_ID') },
  google: { clientIds: list('GOOGLE_CLIENT_IDS') },

  claude: {
    apiKey: str('ANTHROPIC_API_KEY'),
    chatModel: str('CLAUDE_MODEL_CHAT', 'claude-sonnet-5-5'),
    fastModel: str('CLAUDE_MODEL_FAST', 'claude-haiku-5-5'),
  },
  xai: {
    apiKey: str('XAI_API_KEY'),
    imageModel: str('XAI_IMAGE_MODEL', 'grok-imagine-image-2.0'),
    videoModel: str('XAI_VIDEO_MODEL', 'grok-imagine-video-1.5-lite'),
    videoModelHd: str('XAI_VIDEO_MODEL_HD', 'grok-imagine-video-1.5'),
  },
  cloudinary: {
    cloudName: str('CLOUDINARY_CLOUD_NAME'),
    apiKey: str('CLOUDINARY_API_KEY'),
    apiSecret: str('CLOUDINARY_API_SECRET'),
    watermarkId: str('CLOUDINARY_WATERMARK_ID', 'pawtella/watermark'),
  },
  shopify: {
    storeDomain: str('SHOPIFY_STORE_DOMAIN'),
    // Storefront: a private token (server-side, preferred) or a public one.
    storefrontToken: str('SHOPIFY_STOREFRONT_TOKEN'),
    storefrontPrivateToken: str('SHOPIFY_STOREFRONT_PRIVATE_TOKEN'),
    // Admin: a static token (legacy custom apps) or Dev Dashboard client credentials,
    // exchanged for a 24 h token by lib/shopify-client.js.
    adminToken: str('SHOPIFY_ADMIN_TOKEN'),
    clientId: str('SHOPIFY_CLIENT_ID'),
    clientSecret: str('SHOPIFY_CLIENT_SECRET'),
    apiVersion: str('SHOPIFY_API_VERSION', '2026-10'),
    // Dev Dashboard apps sign webhooks with the app's client secret.
    webhookSecret: str('SHOPIFY_WEBHOOK_SECRET') || str('SHOPIFY_CLIENT_SECRET'),
    depotLocationId: str('SHOPIFY_DEPOT_LOCATION_ID'),
  },
  inventory: {
    source: str('INVENTORY_SOURCE', 'mock'),
    importSecret: str('INVENTORY_IMPORT_SECRET'),
    franposApiUrl: str('FRANPOS_API_URL'),
    franposApiKey: str('FRANPOS_API_KEY'),
  },
  email: {
    resendApiKey: str('RESEND_API_KEY'),
    from: str('FROM_EMAIL', 'Pawtella <hello@pawtella.com>'),
  },
};

export const flags = {
  hasClaude: !!env.claude.apiKey,
  hasXai: !!env.xai.apiKey,
  hasCloudinary: !!(env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret),
  hasShopify: !!(env.shopify.storeDomain && (env.shopify.storefrontPrivateToken || env.shopify.storefrontToken)),
  hasShopifyAdmin: !!(
    env.shopify.storeDomain &&
    (env.shopify.adminToken || (env.shopify.clientId && env.shopify.clientSecret))
  ),
  hasEmail: !!env.email.resendApiKey,
  // Subscribe & Save stays fully inert until this is turned on, even if selling plans exist upstream.
  subscriptionsEnabled: bool('SUBSCRIPTIONS_ENABLED', false),
};

export default env;
