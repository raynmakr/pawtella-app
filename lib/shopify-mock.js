// In-memory Shopify stand-in with a realistic cat/dog catalog. Same interface as lib/shopify-real.js.
// Carts live in a module-level Map; checkoutUrl points at the dev-only /mock-checkout page which
// turns a cart into a fake `orders/paid` webhook so the whole points/commission loop runs locally.
import { env } from './env.js';
import { ApiError, badRequest, notFound } from './http.js';
import { pawPointsFromTags } from './shopify-real.js';
import { SUB_RULES } from './subscriptions/rules.js';

export const isMock = true;

const dog = (n) => `https://placedog.net/600/600?random=${n}`;
const cat = (n) => `https://loremflickr.com/600/600/cat?lock=${n}`;

export const COLLECTIONS = [
  { handle: 'dog-food', title: 'Dog Food', imageUrl: dog(101) },
  { handle: 'cat-food', title: 'Cat Food', imageUrl: cat(101) },
  { handle: 'treats', title: 'Treats', imageUrl: dog(102) },
  { handle: 'toys', title: 'Toys', imageUrl: cat(102) },
  { handle: 'litter-hygiene', title: 'Litter & Hygiene', imageUrl: cat(103) },
  { handle: 'grooming', title: 'Grooming', imageUrl: dog(103) },
  { handle: 'health-supplements', title: 'Health & Supplements', imageUrl: dog(104) },
  { handle: 'beds-travel', title: 'Beds & Travel', imageUrl: cat(104) },
  { handle: 'paw-points', title: 'Paw Points', imageUrl: dog(105) },
];

// [handle, title, vendor, priceCents, compareAtCents|null, sku, collection, tags[], qty, species, description]
const RAW = [
  ['acana-grasslands-dog-11kg', 'Acana Grasslands Dog Food 11.4 kg', 'Acana', 10999, 11999, 'ACA-GRASS-114', 'dog-food', ['dog', 'dry-food', 'grain-free', 'adult'], 6, 'dog', 'Lamb, duck and freshwater fish. 70% animal ingredients, made in Alberta.'],
  ['orijen-original-dog-6kg', 'Orijen Original Dog Food 6 kg', 'Orijen', 8999, null, 'ORI-ORIG-6', 'dog-food', ['dog', 'dry-food', 'grain-free'], 4, 'dog', 'Biologically appropriate kibble with 85% poultry, fish and eggs.'],
  ['purina-pro-plan-sensitive-15kg', 'Purina Pro Plan Sensitive Skin & Stomach 15 kg', 'Purina', 9499, null, 'PPP-SSS-15', 'dog-food', ['dog', 'dry-food', 'sensitive'], 3, 'dog', 'Salmon-first formula with oatmeal for easy digestion.'],
  ['hills-science-puppy-7kg', "Hill's Science Diet Puppy Small Bites 7 kg", "Hill's", 7499, null, 'HSD-PUP-7', 'dog-food', ['dog', 'dry-food', 'puppy'], 8, 'dog', 'DHA from fish oil for healthy brain and eye development.'],
  ['blue-wilderness-chicken-10kg', 'Blue Buffalo Wilderness Chicken 10.9 kg', 'Blue Buffalo', 8999, null, 'BB-WILD-109', 'dog-food', ['dog', 'dry-food', 'high-protein'], 0, 'dog', 'High-protein, grain-free recipe inspired by the diet of wolves.'],
  ['blue-homestyle-beef-can', 'Blue Buffalo Homestyle Beef Dinner 354 g can', 'Blue Buffalo', 399, null, 'BB-HOME-BEEF', 'dog-food', ['dog', 'wet-food'], 36, 'dog', 'Real beef, carrots and sweet potatoes in a savoury gravy.'],
  ['stella-chewys-beef-patties', "Stella & Chewy's Freeze-Dried Beef Patties 709 g", "Stella & Chewy's", 6999, null, 'SC-FD-BEEF-25', 'dog-food', ['dog', 'raw', 'freeze-dried'], 5, 'dog', 'Raw-coated nutrition you can scoop. 95% beef, organs and bone.'],
  ['orijen-original-cat-5kg', 'Orijen Original Cat Food 5.4 kg', 'Orijen', 8499, null, 'ORI-CAT-54', 'cat-food', ['cat', 'dry-food', 'grain-free'], 4, 'cat', 'Free-run chicken and turkey, wild-caught fish and nest-laid eggs.'],
  ['royal-canin-indoor-cat-4kg', 'Royal Canin Indoor Adult Cat 4 kg', 'Royal Canin', 5299, null, 'RC-INDOOR-4', 'cat-food', ['cat', 'dry-food', 'indoor'], 9, 'cat', 'Reduces litter box odour and supports a healthy weight for indoor cats.'],
  ['fancy-feast-pate-24', 'Fancy Feast Classic Paté Variety 24 × 85 g', 'Purina', 2999, 3299, 'FF-PATE-24', 'cat-food', ['cat', 'wet-food'], 14, 'cat', 'Chicken, turkey and seafood patés cats love.'],
  ['tiki-cat-luau-12', 'Tiki Cat Luau Variety 12 × 80 g', 'Tiki Cat', 3499, null, 'TIKI-LUAU-12', 'cat-food', ['cat', 'wet-food', 'grain-free'], 7, 'cat', 'Shredded meat and whole fish in broth. No grains, no fillers.'],
  ['weruva-cats-in-kitchen-12', 'Weruva Cats in the Kitchen Pouches 12 × 85 g', 'Weruva', 2899, null, 'WER-CITK-12', 'cat-food', ['cat', 'wet-food'], 11, 'cat', 'Hydrating gravy pouches made in a human food facility.'],
  ['smalls-fresh-cat-sampler', 'Smalls Fresh Cat Food Sampler 1.8 kg', 'Smalls', 4999, null, 'SML-SAMP-18', 'cat-food', ['cat', 'fresh', 'special-order'], 0, 'cat', 'Gently cooked human-grade cat food. Ships frozen.'],
  ['greenies-dental-regular-36', 'Greenies Regular Dental Treats 36 ct', 'Greenies', 4499, null, 'GRN-REG-36', 'treats', ['dog', 'dental', 'treats'], 11, 'dog', 'Vet-recommended dental chews that clean teeth and freshen breath.'],
  ['zukes-mini-naturals-pb', "Zuke's Mini Naturals Peanut Butter 454 g", "Zuke's", 1999, null, 'ZUK-MINI-PB', 'treats', ['dog', 'training', 'treats'], 0, 'dog', 'Tiny 3-calorie training treats made in the USA.'],
  ['temptations-chicken-180', 'Temptations Tasty Chicken Cat Treats 180 g', 'Temptations', 649, null, 'TMP-CHK-180', 'treats', ['cat', 'treats'], 22, 'cat', 'Crunchy outside, soft inside. Under 2 calories each.'],
  ['churu-tuna-20', 'Inaba Churu Tuna Purée 20 tubes', 'Inaba', 2199, null, 'INB-CHURU-20', 'treats', ['cat', 'treats', 'lickable'], 15, 'cat', 'The lickable treat cats go wild for. Grain-free, 6 calories per tube.'],
  ['bully-sticks-6in-5', 'Pawtella Natural Bully Sticks 6" 5-pack', 'Pawtella', 2499, null, 'PWT-BULLY-6-5', 'treats', ['dog', 'chews', 'treats'], 18, 'dog', 'Single-ingredient, odour-free, slow-roasted in Ontario.'],
  ['kong-classic-large', 'KONG Classic Large', 'KONG', 1899, null, 'KONG-CL-L', 'toys', ['dog', 'toys', 'enrichment'], 13, 'dog', 'The original stuffable rubber toy. Dishwasher safe.'],
  ['chuckit-ultra-ball-m-2', 'Chuckit! Ultra Ball Medium 2-pack', 'Chuckit!', 1299, null, 'CHK-ULTRA-M2', 'toys', ['dog', 'toys', 'fetch'], 20, 'dog', 'High bounce, floats, and glows in the twilight.'],
  ['west-paw-toppl-large', 'West Paw Zogoflex Toppl Large', 'West Paw', 2999, null, 'WP-TOPPL-L', 'toys', ['dog', 'toys', 'enrichment'], 6, 'dog', 'Treat-dispensing puzzle you can freeze. Made in Montana, recyclable.'],
  ['smartykat-skitter-critters', 'SmartyKat Skitter Critters 3-pack', 'SmartyKat', 799, null, 'SK-SKITTER-3', 'toys', ['cat', 'toys', 'catnip'], 17, 'cat', 'Catnip-filled mice with realistic textures.'],
  ['yeowww-catnip-banana', 'Yeowww! Catnip Banana', 'Yeowww!', 999, null, 'YEO-BANANA', 'toys', ['cat', 'toys', 'catnip'], 12, 'cat', 'Stuffed with 100% organic catnip. Cats lose their minds.'],
  ['cat-dancer-original', 'Cat Dancer Original Interactive Toy', 'Cat Dancer', 599, null, 'CD-ORIG', 'toys', ['cat', 'toys', 'interactive'], 25, 'cat', 'Spring steel wire and rolled cardboard. Simple and irresistible.'],
  ['worlds-best-litter-multi-12kg', "World's Best Cat Litter Multi-Cat 12.7 kg", "World's Best", 4999, null, 'WB-MULTI-127', 'litter-hygiene', ['cat', 'litter', 'natural'], 7, 'cat', 'Corn-based clumping litter. Flushable and 99% dust-free.'],
  ['dr-elseys-ultra-18kg', "Dr. Elsey's Ultra Litter 18 kg", "Dr. Elsey's", 3699, null, 'DE-ULTRA-18', 'litter-hygiene', ['cat', 'litter', 'clay'], 0, 'cat', 'Hard-clumping, hypoallergenic clay litter.'],
  ['arm-hammer-clump-seal-12kg', 'Arm & Hammer Clump & Seal 12.7 kg', 'Arm & Hammer', 3299, null, 'AH-CS-127', 'litter-hygiene', ['cat', 'litter'], 5, 'cat', 'Seals and destroys odours for 7 days.'],
  ['earth-rated-poop-bags-270', 'Earth Rated Poop Bags Lavender 270 ct', 'Earth Rated', 1699, null, 'ER-BAGS-270', 'litter-hygiene', ['dog', 'hygiene'], 30, 'dog', 'Thick, leak-proof bags made with recycled material.'],
  ['natures-miracle-stain-odor-946', "Nature's Miracle Stain & Odor Remover 946 ml", "Nature's Miracle", 1499, null, 'NM-SOR-946', 'litter-hygiene', ['dog', 'cat', 'hygiene'], 16, 'dog', 'Enzymatic formula that removes pet stains and odours for good.'],
  ['furminator-deshedding-large', 'FURminator deShedding Tool Large Dog', 'FURminator', 5499, 5999, 'FUR-L-DOG', 'grooming', ['dog', 'grooming'], 5, 'dog', 'Reduces shedding up to 90%. Stainless steel edge.'],
  ['earthbath-oatmeal-aloe-472', 'Earthbath Oatmeal & Aloe Shampoo 472 ml', 'Earthbath', 1799, null, 'EB-OAT-472', 'grooming', ['dog', 'cat', 'grooming', 'shampoo'], 12, 'dog', 'Soap-free, pH-balanced relief for dry, itchy skin.'],
  ['safari-nail-trimmer', 'Safari Professional Nail Trimmer', 'Safari', 1499, null, 'SAF-NAIL-PRO', 'grooming', ['dog', 'cat', 'grooming'], 7, 'cat', 'Sharp stainless blades with a safety stop.'],
  ['hertzko-slicker-brush', 'Hertzko Self-Cleaning Slicker Brush', 'Hertzko', 2199, null, 'HZ-SLICKER', 'grooming', ['dog', 'cat', 'grooming'], 9, 'cat', 'Retractable bristles make cleanup one click.'],
  ['zesty-paws-hip-joint-90', 'Zesty Paws Hip & Joint Bites 90 ct', 'Zesty Paws', 3999, null, 'ZP-HJ-90', 'health-supplements', ['dog', 'supplements', 'joint'], 8, 'dog', 'Glucosamine, chondroitin and MSM in a chicken-flavoured soft chew.'],
  ['advantage-ii-large-dog', 'Advantage II Flea Treatment Large Dog 6-dose', 'Elanco', 7499, null, 'ADV2-L-6', 'health-supplements', ['dog', 'flea-tick', 'health'], 3, 'dog', 'Kills fleas through contact. No biting required.'],
  ['feliway-classic-diffuser', 'Feliway Classic Diffuser Starter Kit', 'Ceva', 4299, null, 'FEL-CLASSIC-KIT', 'health-supplements', ['cat', 'health', 'calming'], 6, 'cat', 'Pheromone diffuser that helps cats feel safe and secure.'],
  ['purina-fortiflora-cat-30', 'Purina FortiFlora Cat Probiotic 30 sachets', 'Purina', 3899, null, 'PPV-FF-CAT-30', 'health-supplements', ['cat', 'supplements', 'digestive'], 10, 'cat', 'Veterinary probiotic for diarrhea and digestive health.'],
  ['sherpa-carrier-medium', 'Sherpa Original Deluxe Carrier Medium', 'Sherpa', 8999, null, 'SHP-DLX-M', 'beds-travel', ['dog', 'cat', 'travel', 'carrier'], 0, 'cat', 'Airline-approved soft carrier with spring wire frame.'],
  ['petsafe-easy-walk-harness-m', 'PetSafe Easy Walk Harness Medium', 'PetSafe', 3999, null, 'PS-EW-M', 'beds-travel', ['dog', 'walking', 'harness'], 4, 'dog', 'Front-clip harness that gently discourages pulling.'],
  ['pawtella-rope-leash-coral', 'Pawtella Rope Leash 6 ft Coral', 'Pawtella', 2499, null, 'PWT-LEASH-CORAL', 'beds-travel', ['dog', 'walking', 'leash'], 9, 'dog', 'Climbing-rope leash with brass hardware. Made in Toronto.'],
  ['furhaven-orthopedic-bed-l', 'Furhaven Orthopedic Sofa Bed Large', 'Furhaven', 7999, 9999, 'FH-ORTHO-L', 'beds-travel', ['dog', 'bed'], 5, 'dog', 'Egg-crate orthopedic foam with a removable, washable cover.'],
  ['k-h-thermo-kitty-bed', 'K&H Thermo-Kitty Heated Cat Bed', 'K&H Pet Products', 6499, null, 'KH-THERMO-KITTY', 'beds-travel', ['cat', 'bed', 'heated'], 3, 'cat', 'Gently heats to your cat’s body temperature. 4-watt, MET-listed.'],
  ['catit-flower-fountain-3l', 'Catit Flower Fountain 3 L', 'Catit', 4499, null, 'CATIT-FLOWER-3', 'litter-hygiene', ['cat', 'water', 'fountain'], 1, 'cat', 'Three flow settings keep cats drinking more.'],
  // Paw Point packs (digital)
  ['paw-points-100', 'Paw Points Pack · 100', 'Pawtella', 499, null, 'PP-100', 'paw-points', ['paw-points:100', 'digital'], 9999, 'dog', '100 Paw Points delivered instantly to your Pawtella account. Spend on AI creations or in store.'],
  ['paw-points-300', 'Paw Points Pack · 300', 'Pawtella', 1299, 1497, 'PP-300', 'paw-points', ['paw-points:300', 'digital', 'best-value'], 9999, 'cat', '300 Paw Points (13% bonus). Delivered instantly.'],
  ['paw-points-1000', 'Paw Points Pack · 1000', 'Pawtella', 3499, 4990, 'PP-1000', 'paw-points', ['paw-points:1000', 'digital'], 9999, 'dog', '1000 Paw Points (30% bonus). Delivered instantly.'],
];

function buildCatalog() {
  return RAW.map((r, i) => {
    const [handle, title, vendor, priceCents, compareAtPriceCents, sku, collection, tags, qty, species, description] = r;
    const n = 200 + i;
    const img = species === 'cat' ? cat(n) : dog(n);
    const numericId = 7000000000 + i;
    const variantId = 8000000000 + i;
    const product = {
      id: `gid://shopify/Product/${numericId}`,
      handle,
      title,
      description,
      vendor,
      tags,
      collection,
      images: [
        { url: img, alt: title },
        { url: species === 'cat' ? cat(n + 500) : dog(n + 500), alt: `${title} alternate view` },
      ],
      priceCents,
      currency: 'CAD',
      variants: [
        {
          id: `gid://shopify/ProductVariant/${variantId}`,
          title: 'Default Title',
          sku,
          priceCents,
          availableForSale: qty > 0 || tags.includes('special-order'),
          quantityAvailable: qty,
          inventoryItemId: `gid://shopify/InventoryItem/${9000000000 + i}`,
        },
      ],
      availableForSale: qty > 0 || tags.includes('special-order'),
    };
    if (compareAtPriceCents) product.compareAtPriceCents = compareAtPriceCents;
    const pack = pawPointsFromTags(tags);
    if (pack) product.pawPointsPack = pack;
    return product;
  });
}

let catalog = buildCatalog();
const carts = new Map();
const discountCodes = new Map(); // id → { code, active, ... }
let seq = 0;
const nextId = (type) => `gid://shopify/${type}/${Date.now() % 1_000_000_000}${String(++seq).padStart(4, '0')}`;

/** Public Product shape (strips mock-only fields). */
function publicProduct(p) {
  if (!p) return null;
  const { collection, ...rest } = p;
  return {
    ...rest,
    collectionHandles: collection ? [collection] : [],
    variants: rest.variants.map(({ inventoryItemId, ...v }) => v),
  };
}

export function __reset() {
  catalog = buildCatalog();
  carts.clear();
  discountCodes.clear();
  seq = 0;
}

/** Mock-only helpers used by orders.js, tests and the mock checkout page. */
export function __catalog() {
  return catalog;
}
export function findVariant(merchandiseId) {
  for (const p of catalog) {
    const v = p.variants.find((x) => x.id === merchandiseId);
    if (v) return { product: p, variant: v };
  }
  return null;
}
export function findProductBySku(sku) {
  if (!sku) return null;
  return catalog.find((p) => p.variants.some((v) => v.sku === sku)) || null;
}
export function findProductById(id) {
  const s = String(id ?? '');
  return catalog.find((p) => p.id === s || p.id.endsWith(`/${s}`)) || null;
}

// ---------------------------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------------------------

export async function getCollections() {
  return COLLECTIONS.map((c, i) => ({
    id: `gid://shopify/Collection/${6000000000 + i}`,
    handle: c.handle,
    title: c.title,
    imageUrl: c.imageUrl,
    productCount: catalog.filter((p) => p.collection === c.handle).length,
  }));
}

export async function getProducts({ collection, query, cursor, first = 24 } = {}) {
  const size = Math.min(Math.max(parseInt(first, 10) || 24, 1), 100);
  let list = catalog;
  if (collection) list = list.filter((p) => p.collection === collection);
  if (query) {
    const q = String(query).toLowerCase().trim();
    const terms = q.split(/\s+/).filter(Boolean);
    list = list.filter((p) => {
      const hay = `${p.title} ${p.vendor} ${p.tags.join(' ')} ${p.description} ${p.variants.map((v) => v.sku).join(' ')}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }
  const start = cursor ? Math.max(0, parseInt(Buffer.from(String(cursor), 'base64').toString('utf8'), 10) || 0) : 0;
  const page = list.slice(start, start + size);
  const nextIndex = start + size;
  return {
    products: page.map(publicProduct),
    nextCursor: nextIndex < list.length ? Buffer.from(String(nextIndex)).toString('base64') : null,
  };
}

export async function getProduct(handle) {
  return publicProduct(catalog.find((p) => p.handle === handle) || null);
}

export async function getProductMetaById(productId) {
  const p = findProductById(productId);
  return p ? { id: p.id, handle: p.handle, tags: p.tags } : null;
}

// ---------------------------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------------------------

function recompute(cart) {
  cart.subtotalCents = cart.lines.reduce((s, l) => s + l.priceCents * l.quantity, 0);
  let discount = 0;
  cart.discountCodes = cart.discountCodes.map((d) => {
    const def = [...discountCodes.values()].find((x) => x.code.toLowerCase() === d.code.toLowerCase() && x.active);
    const isPaw = /^PAW-/i.test(d.code);
    let applicable = false;
    let amount = 0;
    if (def) {
      applicable = cart.subtotalCents > 0;
      amount = def.percent ? Math.round((cart.subtotalCents * def.percent) / 100) : def.amountCents || 0;
    } else if (isPaw) {
      // A hold code we did not see minted (e.g. tests): accept it with no monetary effect.
      applicable = cart.subtotalCents > 0;
    }
    if (applicable) discount += Math.min(amount, cart.subtotalCents - discount);
    return { code: d.code, applicable };
  });
  cart.discountCents = discount;
  cart.totalCents = Math.max(0, cart.subtotalCents - discount);
  cart.totalQuantity = cart.lines.reduce((s, l) => s + l.quantity, 0);
  cart.updatedAt = new Date().toISOString();
  return cart;
}

function lineFromInput(l) {
  const merchandiseId = l.merchandiseId || l.variantId;
  const hit = findVariant(merchandiseId);
  if (!hit) throw badRequest(`Unknown merchandise ${merchandiseId}`);
  if (!hit.variant.availableForSale) throw badRequest(`${hit.product.title} is sold out`);
  const quantity = Math.max(1, parseInt(l.quantity ?? 1, 10) || 1);
  // Subscription line: apply the base Subscribe & Save discount so the mock cart mirrors the real
  // Storefront behaviour (Shopify applies the selling plan's pricing adjustment to the line).
  const sellingPlanId = l.sellingPlanId || null;
  const priceCents = sellingPlanId
    ? Math.round((hit.variant.priceCents * (100 - SUB_RULES.baseDiscountPercent)) / 100)
    : hit.variant.priceCents;
  return {
    id: nextId('CartLine'),
    quantity,
    merchandiseId,
    title: hit.product.title,
    variantTitle: hit.variant.title,
    handle: hit.product.handle,
    sku: hit.variant.sku,
    imageUrl: hit.product.images[0]?.url || null,
    priceCents,
    pawPointsPack: hit.product.pawPointsPack,
    productId: hit.product.id,
    sellingPlanId,
    sellingPlanName: sellingPlanId ? 'Subscribe & Save' : null,
  };
}

function view(cart) {
  if (!cart) return null;
  return {
    id: cart.id,
    checkoutUrl: cart.checkoutUrl,
    lines: cart.lines.map((l) => ({ ...l, lineTotalCents: l.priceCents * l.quantity })),
    subtotalCents: cart.subtotalCents,
    totalCents: cart.totalCents,
    discountCents: cart.discountCents,
    discountCodes: cart.discountCodes,
    currency: cart.currency,
    attributes: { ...cart.attributes },
    buyerEmail: cart.buyerEmail,
    totalQuantity: cart.totalQuantity,
  };
}

function mustCart(id) {
  const cart = carts.get(id);
  if (!cart) throw notFound('Cart not found');
  return cart;
}

export async function cartCreate({ lines = [], buyerEmail, attributes = {}, discountCodes: codes = [] } = {}) {
  const id = nextId('Cart');
  const token = id.split('/').pop();
  const cart = {
    id,
    checkoutUrl: `${env.appUrl}/mock-checkout/${encodeURIComponent(token)}`,
    lines: lines.map(lineFromInput),
    discountCodes: (codes || []).map((code) => ({ code, applicable: false })),
    currency: 'CAD',
    attributes: Object.fromEntries(Object.entries(attributes).map(([k, v]) => [k, String(v)])),
    buyerEmail: buyerEmail || null,
    createdAt: new Date().toISOString(),
  };
  mergeLines(cart);
  carts.set(id, recompute(cart));
  carts.set(token, cart); // allow lookup by the short token used in the checkout URL
  console.log('[shopify:mock] cartCreate', { id, lines: cart.lines.length });
  return view(cart);
}

function mergeLines(cart) {
  const byMerch = new Map();
  for (const l of cart.lines) {
    // A subscription line and a one-time line of the same variant are distinct cart lines.
    const key = `${l.merchandiseId}::${l.sellingPlanId || ''}`;
    const prev = byMerch.get(key);
    if (prev) prev.quantity += l.quantity;
    else byMerch.set(key, l);
  }
  cart.lines = [...byMerch.values()];
}

export async function cartGet(id) {
  const cart = carts.get(id);
  return cart ? view(recompute(cart)) : null;
}

export async function cartLinesAdd(id, lines) {
  const cart = mustCart(id);
  cart.lines.push(...lines.map(lineFromInput));
  mergeLines(cart);
  return view(recompute(cart));
}

export async function cartLinesUpdate(id, lines) {
  const cart = mustCart(id);
  for (const l of lines) {
    const line = cart.lines.find((x) => x.id === l.id);
    if (!line) throw badRequest(`Unknown cart line ${l.id}`);
    const q = parseInt(l.quantity ?? line.quantity, 10);
    if (!Number.isFinite(q) || q < 0) throw badRequest('Invalid quantity');
    line.quantity = q;
  }
  cart.lines = cart.lines.filter((x) => x.quantity > 0);
  return view(recompute(cart));
}

export async function cartLinesRemove(id, lineIds) {
  const cart = mustCart(id);
  const set = new Set(lineIds || []);
  cart.lines = cart.lines.filter((x) => !set.has(x.id));
  return view(recompute(cart));
}

export async function cartDiscountCodesUpdate(id, codes) {
  const cart = mustCart(id);
  cart.discountCodes = (codes || []).map((code) => ({ code: String(code), applicable: false }));
  return view(recompute(cart));
}

export async function cartBuyerIdentityUpdate(id, { email } = {}) {
  const cart = mustCart(id);
  cart.buyerEmail = email || null;
  return view(recompute(cart));
}

export async function cartAttributesUpdate(id, attributes = {}) {
  const cart = mustCart(id);
  cart.attributes = { ...cart.attributes, ...Object.fromEntries(Object.entries(attributes).map(([k, v]) => [k, String(v)])) };
  return view(recompute(cart));
}

// ---------------------------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------------------------

export async function createDiscountCode({ code, amountCents, percent, customerId, usageLimit = 1, endsAt, title }) {
  const id = nextId('DiscountCodeNode');
  const reusable = usageLimit === null; // partner codes: unlimited uses, any customer, repeatable
  discountCodes.set(id, {
    id, code, amountCents, percent, customerId, endsAt, title, active: true,
    usageLimit: reusable ? null : Math.max(1, parseInt(usageLimit, 10) || 1),
    appliesOncePerCustomer: !reusable,
  });
  console.log('[shopify:mock] createDiscountCode', { id, code, amountCents, percent, reusable });
  return { id, code };
}

export async function deactivateDiscountCode(id) {
  const d = discountCodes.get(id);
  if (d) d.active = false;
  console.log('[shopify:mock] deactivateDiscountCode', { id, found: !!d });
  return true;
}

export function __discountCodes() {
  return [...discountCodes.values()];
}

export async function createGiftCard({ amountCents, note, customerId }) {
  const code = `MOCK${Math.random().toString(36).slice(2, 10).toUpperCase()}GIFT`;
  console.log('[shopify:mock] createGiftCard', { amountCents, note, customerId });
  return { id: nextId('GiftCard'), code, lastCharacters: code.slice(-4) };
}

export async function findCustomerByEmail(email) {
  console.log('[shopify:mock] findCustomerByEmail', { email });
  return null;
}

export async function createProduct({ title, sku, barcode, priceCents, vendor, tags = [], status = 'ACTIVE', handle, imageUrl }) {
  const i = catalog.length;
  const h = handle || `${title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || `product-${i}`;
  if (catalog.some((p) => p.handle === h)) throw new ApiError(409, `Mock product with handle ${h} already exists`);
  const product = {
    id: `gid://shopify/Product/${7100000000 + i}`,
    handle: h,
    title,
    description: '',
    vendor: vendor || '',
    tags,
    collection: null,
    images: [{ url: imageUrl || dog(900 + i), alt: title }],
    priceCents,
    currency: 'CAD',
    variants: [
      {
        id: `gid://shopify/ProductVariant/${8100000000 + i}`,
        title: 'Default Title',
        sku,
        barcode,
        priceCents,
        availableForSale: false,
        quantityAvailable: 0,
        inventoryItemId: `gid://shopify/InventoryItem/${9100000000 + i}`,
        inventoryPolicy: 'DENY',
      },
    ],
    availableForSale: false,
    status,
  };
  catalog.push(product);
  console.log('[shopify:mock] createProduct', { handle: h, sku });
  return { productId: product.id, variantId: product.variants[0].id, inventoryItemId: product.variants[0].inventoryItemId, handle: h };
}

export async function updateProduct(productId, { status, tags, metafields } = {}) {
  const p = findProductById(productId);
  if (!p) throw notFound('Mock product not found');
  if (status !== undefined) p.status = status;
  if (tags !== undefined) p.tags = tags;
  if (metafields) p.metafields = { ...(p.metafields || {}), ...metafields };
  console.log('[shopify:mock] updateProduct', { productId, status, tags: tags?.length });
  return { id: p.id };
}

export async function setInventoryQuantity(inventoryItemId, locationId, quantity) {
  for (const p of catalog) {
    const v = p.variants.find((x) => x.inventoryItemId === inventoryItemId);
    if (v) {
      v.quantityAvailable = Math.max(0, parseInt(quantity, 10) || 0);
      v.availableForSale = v.quantityAvailable > 0 || v.inventoryPolicy === 'CONTINUE';
      p.availableForSale = p.variants.some((x) => x.availableForSale);
      console.log('[shopify:mock] setInventoryQuantity', { sku: v.sku, quantity: v.quantityAvailable });
      return true;
    }
  }
  console.log('[shopify:mock] setInventoryQuantity: unknown inventory item', { inventoryItemId });
  return true;
}

export async function setVariantInventoryPolicy(variantId, policy) {
  const hit = findVariant(variantId);
  if (hit) {
    hit.variant.inventoryPolicy = String(policy).toUpperCase() === 'CONTINUE' ? 'CONTINUE' : 'DENY';
    hit.variant.availableForSale = hit.variant.quantityAvailable > 0 || hit.variant.inventoryPolicy === 'CONTINUE';
    hit.product.availableForSale = hit.product.variants.some((x) => x.availableForSale);
  }
  console.log('[shopify:mock] setVariantInventoryPolicy', { variantId, policy, found: !!hit });
  return true;
}

export { pawPointsFromTags };
