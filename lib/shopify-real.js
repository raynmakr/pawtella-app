// Shopify adapter against the real Storefront + Admin GraphQL APIs (version env.shopify.apiVersion,
// default 2026-10). Same interface as lib/shopify-mock.js; lib/shopify.js picks one.
//
// Verified against shopify.dev (2026-10): CartInput { lines, buyerIdentity, attributes, discountCodes },
// CartLineInput { merchandiseId, quantity, attributes }, CartLineUpdateInput { id, quantity },
// cartLinesRemove(cartId, lineIds), cartDiscountCodesUpdate(cartId, discountCodes), Cart { id,
// checkoutUrl, attributes, buyerIdentity, cost { subtotalAmount totalAmount }, discountCodes { code
// applicable }, lines { id quantity cost merchandise } }, discountCodeBasicCreate(basicCodeDiscount),
// discountCodeDeactivate(id), giftCardCreate(input { initialValue, note, customerId }) → giftCardCode,
// customers(query: "email:\"…\""), productSet(input, synchronous), ProductVariantSetInput { sku,
// barcode, price, inventoryPolicy, optionValues! }, productVariantsBulkUpdate(productId, variants
// [{ id, inventoryPolicy }]), inventorySetQuantities(input { name, reason, quantities [{
// inventoryItemId, locationId, quantity, changeFromQuantity }] }), metafieldsSet(metafields).
// Not re-verified this round (long-standing fields): Product.{featuredImage,images,priceRange,
// compareAtPriceRange,variants.quantityAvailable}, Collection.image, productUpdate(product:).
import { storefront, admin, gid, moneyToCents, centsToMoney } from './shopify-client.js';
import { env } from './env.js';

export const isMock = false;

export const PAW_POINTS_TAG_RE = /^paw-points:(\d+)$/i;

/** Parse `paw-points:<n>` out of a tag list. */
export function pawPointsFromTags(tags = []) {
  for (const t of tags) {
    const m = String(t).trim().match(PAW_POINTS_TAG_RE);
    if (m) return parseInt(m[1], 10);
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Fragments
// ---------------------------------------------------------------------------------------------

const PRODUCT_FRAGMENT = /* GraphQL */ `
  fragment ProductFields on Product {
    id
    handle
    title
    description
    vendor
    tags
    availableForSale
    featuredImage { url altText }
    images(first: 8) { nodes { url altText } }
    priceRange { minVariantPrice { amount currencyCode } }
    compareAtPriceRange { minVariantPrice { amount currencyCode } }
    variants(first: 25) {
      nodes {
        id
        title
        sku
        availableForSale
        quantityAvailable
        price { amount currencyCode }
        compareAtPrice { amount currencyCode }
      }
    }
  }
`;

const CART_FRAGMENT = /* GraphQL */ `
  fragment CartFields on Cart {
    id
    checkoutUrl
    totalQuantity
    attributes { key value }
    buyerIdentity { email }
    cost {
      subtotalAmount { amount currencyCode }
      totalAmount { amount currencyCode }
    }
    discountCodes { code applicable }
    lines(first: 100) {
      nodes {
        id
        quantity
        cost { totalAmount { amount currencyCode } amountPerQuantity { amount currencyCode } }
        merchandise {
          ... on ProductVariant {
            id
            title
            sku
            image { url altText }
            price { amount currencyCode }
            product { id handle title tags }
          }
        }
      }
    }
  }
`;

// ---------------------------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------------------------

export function mapProduct(node) {
  if (!node) return null;
  const variants = (node.variants?.nodes || []).map((v) => ({
    id: v.id,
    title: v.title,
    sku: v.sku || null,
    priceCents: moneyToCents(v.price?.amount),
    compareAtPriceCents: v.compareAtPrice ? moneyToCents(v.compareAtPrice.amount) : undefined,
    availableForSale: !!v.availableForSale,
    quantityAvailable: v.quantityAvailable ?? null,
  }));
  const images = (node.images?.nodes || []).map((i) => ({ url: i.url, alt: i.altText || node.title }));
  if (!images.length && node.featuredImage) images.push({ url: node.featuredImage.url, alt: node.featuredImage.altText || node.title });
  const compareAt = moneyToCents(node.compareAtPriceRange?.minVariantPrice?.amount);
  const priceCents = moneyToCents(node.priceRange?.minVariantPrice?.amount);
  const pack = pawPointsFromTags(node.tags || []);
  const out = {
    id: node.id,
    handle: node.handle,
    title: node.title,
    description: node.description || '',
    vendor: node.vendor || '',
    tags: node.tags || [],
    images,
    priceCents,
    currency: node.priceRange?.minVariantPrice?.currencyCode || 'CAD',
    variants,
    availableForSale: !!node.availableForSale,
  };
  if (compareAt > priceCents) out.compareAtPriceCents = compareAt;
  if (pack) out.pawPointsPack = pack;
  return out;
}

export function mapCart(cart) {
  if (!cart) return null;
  return {
    id: cart.id,
    checkoutUrl: cart.checkoutUrl,
    lines: (cart.lines?.nodes || []).map((l) => ({
      id: l.id,
      quantity: l.quantity,
      merchandiseId: l.merchandise?.id,
      title: l.merchandise?.product?.title || l.merchandise?.title || '',
      variantTitle: l.merchandise?.title || '',
      handle: l.merchandise?.product?.handle || null,
      sku: l.merchandise?.sku || null,
      imageUrl: l.merchandise?.image?.url || null,
      priceCents: moneyToCents(l.cost?.amountPerQuantity?.amount ?? l.merchandise?.price?.amount),
      lineTotalCents: moneyToCents(l.cost?.totalAmount?.amount),
      pawPointsPack: pawPointsFromTags(l.merchandise?.product?.tags || []),
    })),
    subtotalCents: moneyToCents(cart.cost?.subtotalAmount?.amount),
    totalCents: moneyToCents(cart.cost?.totalAmount?.amount),
    discountCodes: (cart.discountCodes || []).map((d) => ({ code: d.code, applicable: !!d.applicable })),
    currency: cart.cost?.totalAmount?.currencyCode || 'CAD',
    attributes: Object.fromEntries((cart.attributes || []).map((a) => [a.key, a.value])),
    buyerEmail: cart.buyerIdentity?.email || null,
    totalQuantity: cart.totalQuantity ?? 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Catalog (Storefront)
// ---------------------------------------------------------------------------------------------

export async function getCollections() {
  const data = await storefront(/* GraphQL */ `
    query Collections {
      collections(first: 50, sortKey: TITLE) {
        nodes {
          id
          handle
          title
          image { url altText }
          products(first: 250) { nodes { id } }
        }
      }
    }
  `);
  return (data.collections?.nodes || []).map((c) => ({
    id: c.id,
    handle: c.handle,
    title: c.title,
    imageUrl: c.image?.url || null,
    productCount: c.products?.nodes?.length ?? 0,
  }));
}

export async function getProducts({ collection, query, cursor, first = 24 } = {}) {
  const size = Math.min(Math.max(parseInt(first, 10) || 24, 1), 100);
  if (collection) {
    const data = await storefront(
      /* GraphQL */ `
        ${PRODUCT_FRAGMENT}
        query CollectionProducts($handle: String!, $first: Int!, $after: String) {
          collection(handle: $handle) {
            products(first: $first, after: $after) {
              pageInfo { hasNextPage endCursor }
              nodes { ...ProductFields }
            }
          }
        }
      `,
      { handle: collection, first: size, after: cursor || null },
    );
    const conn = data.collection?.products;
    let products = (conn?.nodes || []).map(mapProduct);
    if (query) {
      const q = String(query).toLowerCase();
      products = products.filter((p) => `${p.title} ${p.vendor} ${p.tags.join(' ')} ${p.description}`.toLowerCase().includes(q));
    }
    return { products, nextCursor: conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null };
  }
  const data = await storefront(
    /* GraphQL */ `
      ${PRODUCT_FRAGMENT}
      query Products($first: Int!, $after: String, $query: String) {
        products(first: $first, after: $after, query: $query, sortKey: TITLE) {
          pageInfo { hasNextPage endCursor }
          nodes { ...ProductFields }
        }
      }
    `,
    { first: size, after: cursor || null, query: query ? String(query) : null },
  );
  const conn = data.products;
  return {
    products: (conn?.nodes || []).map(mapProduct),
    nextCursor: conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null,
  };
}

export async function getProduct(handle) {
  const data = await storefront(
    /* GraphQL */ `
      ${PRODUCT_FRAGMENT}
      query Product($handle: String!) {
        product(handle: $handle) { ...ProductFields }
      }
    `,
    { handle },
  );
  return mapProduct(data.product);
}

/** Admin-side lookup used by the webhook mapper: product id → { handle, tags }. */
export async function getProductMetaById(productId) {
  const data = await admin(
    /* GraphQL */ `
      query ProductMeta($id: ID!) { product(id: $id) { id handle tags } }
    `,
    { id: gid('Product', productId) },
  );
  return data.product ? { id: data.product.id, handle: data.product.handle, tags: data.product.tags || [] } : null;
}

// ---------------------------------------------------------------------------------------------
// Cart (Storefront)
// ---------------------------------------------------------------------------------------------

function toLineInputs(lines = []) {
  return lines.map((l) => ({
    merchandiseId: l.merchandiseId || l.variantId,
    quantity: Math.max(1, parseInt(l.quantity ?? 1, 10) || 1),
    ...(l.attributes ? { attributes: Object.entries(l.attributes).map(([key, value]) => ({ key, value: String(value) })) } : {}),
  }));
}

export async function cartCreate({ lines = [], buyerEmail, attributes = {}, discountCodes } = {}) {
  const input = {
    lines: toLineInputs(lines),
    attributes: Object.entries(attributes).map(([key, value]) => ({ key, value: String(value) })),
  };
  if (buyerEmail) input.buyerIdentity = { email: buyerEmail };
  if (discountCodes?.length) input.discountCodes = discountCodes;
  const data = await storefront(
    /* GraphQL */ `
      ${CART_FRAGMENT}
      mutation CartCreate($input: CartInput!) {
        cartCreate(input: $input) { cart { ...CartFields } userErrors { field message code } }
      }
    `,
    { input },
  );
  return mapCart(data.cartCreate.cart);
}

export async function cartGet(id) {
  const data = await storefront(
    /* GraphQL */ `
      ${CART_FRAGMENT}
      query CartGet($id: ID!) { cart(id: $id) { ...CartFields } }
    `,
    { id },
  );
  return mapCart(data.cart);
}

export async function cartLinesAdd(id, lines) {
  const data = await storefront(
    /* GraphQL */ `
      ${CART_FRAGMENT}
      mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
        cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ...CartFields } userErrors { field message code } }
      }
    `,
    { cartId: id, lines: toLineInputs(lines) },
  );
  return mapCart(data.cartLinesAdd.cart);
}

export async function cartLinesUpdate(id, lines) {
  const data = await storefront(
    /* GraphQL */ `
      ${CART_FRAGMENT}
      mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
        cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { ...CartFields } userErrors { field message code } }
      }
    `,
    { cartId: id, lines: lines.map((l) => ({ id: l.id, quantity: Math.max(0, parseInt(l.quantity ?? 1, 10) || 0) })) },
  );
  return mapCart(data.cartLinesUpdate.cart);
}

export async function cartLinesRemove(id, lineIds) {
  const data = await storefront(
    /* GraphQL */ `
      ${CART_FRAGMENT}
      mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
        cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { ...CartFields } userErrors { field message code } }
      }
    `,
    { cartId: id, lineIds },
  );
  return mapCart(data.cartLinesRemove.cart);
}

export async function cartDiscountCodesUpdate(id, codes) {
  const data = await storefront(
    /* GraphQL */ `
      ${CART_FRAGMENT}
      mutation CartDiscountCodesUpdate($cartId: ID!, $discountCodes: [String!]!) {
        cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) { cart { ...CartFields } userErrors { field message code } }
      }
    `,
    { cartId: id, discountCodes: codes || [] },
  );
  return mapCart(data.cartDiscountCodesUpdate.cart);
}

export async function cartBuyerIdentityUpdate(id, { email } = {}) {
  const data = await storefront(
    /* GraphQL */ `
      ${CART_FRAGMENT}
      mutation CartBuyerIdentityUpdate($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) {
        cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) { cart { ...CartFields } userErrors { field message code } }
      }
    `,
    { cartId: id, buyerIdentity: { email: email || null } },
  );
  return mapCart(data.cartBuyerIdentityUpdate.cart);
}

export async function cartAttributesUpdate(id, attributes = {}) {
  const data = await storefront(
    /* GraphQL */ `
      ${CART_FRAGMENT}
      mutation CartAttributesUpdate($cartId: ID!, $attributes: [AttributeInput!]!) {
        cartAttributesUpdate(cartId: $cartId, attributes: $attributes) { cart { ...CartFields } userErrors { field message code } }
      }
    `,
    { cartId: id, attributes: Object.entries(attributes).map(([key, value]) => ({ key, value: String(value) })) },
  );
  return mapCart(data.cartAttributesUpdate.cart);
}

// ---------------------------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------------------------

/**
 * usageLimit: default 1 + appliesOncePerCustomer (Paw Point hold codes). Pass `usageLimit: null`
 * for a reusable code (partner discounts): no usage limit, any customer may use it repeatedly.
 */
export async function createDiscountCode({ code, amountCents, percent, customerId, usageLimit = 1, endsAt, title }) {
  const value = percent
    ? { percentage: Number(percent) / 100 }
    : { discountAmount: { amount: centsToMoney(amountCents), appliesOnEachItem: false } };
  const reusable = usageLimit === null;
  const basicCodeDiscount = {
    title: title || `Pawtella ${code}`,
    code,
    startsAt: new Date().toISOString(),
    endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    ...(reusable ? {} : { usageLimit: Math.max(1, parseInt(usageLimit, 10) || 1) }),
    appliesOncePerCustomer: !reusable,
    customerSelection: customerId ? { customers: { add: [gid('Customer', customerId)] } } : { all: true },
    customerGets: { value, items: { all: true } },
    combinesWith: { orderDiscounts: false, productDiscounts: true, shippingDiscounts: true },
  };
  const data = await admin(
    /* GraphQL */ `
      mutation DiscountCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          codeDiscountNode { id codeDiscount { ... on DiscountCodeBasic { title codes(first: 1) { nodes { code } } } } }
          userErrors { field message code }
        }
      }
    `,
    { basicCodeDiscount },
  );
  const node = data.discountCodeBasicCreate.codeDiscountNode;
  return { id: node.id, code: node.codeDiscount?.codes?.nodes?.[0]?.code || code };
}

export async function deactivateDiscountCode(id) {
  await admin(
    /* GraphQL */ `
      mutation DiscountDeactivate($id: ID!) {
        discountCodeDeactivate(id: $id) {
          codeDiscountNode { id codeDiscount { ... on DiscountCodeBasic { status } } }
          userErrors { field message code }
        }
      }
    `,
    { id },
  );
  return true;
}

export async function createGiftCard({ amountCents, note, customerId }) {
  const input = { initialValue: centsToMoney(amountCents) };
  if (note) input.note = note;
  if (customerId) input.customerId = gid('Customer', customerId);
  const data = await admin(
    /* GraphQL */ `
      mutation GiftCardCreate($input: GiftCardCreateInput!) {
        giftCardCreate(input: $input) {
          giftCard { id lastCharacters balance { amount currencyCode } }
          giftCardCode
          userErrors { field message code }
        }
      }
    `,
    { input },
  );
  const { giftCard, giftCardCode } = data.giftCardCreate;
  return { id: giftCard.id, code: giftCardCode, lastCharacters: giftCard.lastCharacters || String(giftCardCode).slice(-4) };
}

export async function findCustomerByEmail(email) {
  if (!email) return null;
  const safe = String(email).replace(/["\\]/g, '');
  const data = await admin(
    /* GraphQL */ `
      query CustomerByEmail($query: String!) {
        customers(first: 1, query: $query) { nodes { id defaultEmailAddress { emailAddress } } }
      }
    `,
    { query: `email:"${safe}"` },
  );
  const node = data.customers?.nodes?.[0];
  return node ? { id: node.id, email: node.defaultEmailAddress?.emailAddress || email } : null;
}

export async function createProduct({ title, sku, barcode, priceCents, vendor, tags = [], status = 'ACTIVE', descriptionHtml, handle, imageUrl, locationId }) {
  const input = {
    title,
    status,
    vendor: vendor || undefined,
    tags,
    handle: handle || undefined,
    descriptionHtml: descriptionHtml || undefined,
    productOptions: [{ name: 'Title', position: 1, values: [{ name: 'Default Title' }] }],
    variants: [
      {
        optionValues: [{ optionName: 'Title', name: 'Default Title' }],
        price: centsToMoney(priceCents),
        sku: sku || undefined,
        barcode: barcode || undefined,
        inventoryPolicy: 'DENY',
        inventoryItem: { tracked: true },
        ...(locationId || env.shopify.depotLocationId
          ? { inventoryQuantities: [{ locationId: locationId || env.shopify.depotLocationId, name: 'available', quantity: 0 }] }
          : {}),
      },
    ],
  };
  if (imageUrl) input.files = [{ originalSource: imageUrl, alt: title, contentType: 'IMAGE' }];
  const data = await admin(
    /* GraphQL */ `
      mutation ProductSet($input: ProductSetInput!) {
        productSet(input: $input, synchronous: true) {
          product { id handle variants(first: 1) { nodes { id inventoryItem { id } } } }
          userErrors { field message code }
        }
      }
    `,
    { input },
  );
  const p = data.productSet.product;
  const v = p.variants?.nodes?.[0];
  return { productId: p.id, variantId: v?.id, inventoryItemId: v?.inventoryItem?.id, handle: p.handle };
}

export async function updateProduct(productId, { status, tags, metafields } = {}) {
  const id = gid('Product', productId);
  if (status !== undefined || tags !== undefined) {
    const product = { id };
    if (status !== undefined) product.status = status;
    if (tags !== undefined) product.tags = tags;
    await admin(
      /* GraphQL */ `
        mutation ProductUpdate($product: ProductUpdateInput!) {
          productUpdate(product: $product) { product { id } userErrors { field message } }
        }
      `,
      { product },
    );
  }
  if (metafields && Object.keys(metafields).length) {
    const list = Object.entries(metafields).map(([key, spec]) => {
      const o = typeof spec === 'object' && spec !== null ? spec : { value: spec };
      return {
        ownerId: id,
        namespace: o.namespace || 'pawtella',
        key,
        type: o.type || (Number.isInteger(o.value) ? 'number_integer' : 'single_line_text_field'),
        value: String(o.value),
      };
    });
    await admin(
      /* GraphQL */ `
        mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) { metafields { key namespace value } userErrors { field message code } }
        }
      `,
      { metafields: list.slice(0, 25) },
    );
  }
  return { id };
}

export async function setInventoryQuantity(inventoryItemId, locationId, quantity) {
  await admin(
    /* GraphQL */ `
      mutation InventorySet($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          inventoryAdjustmentGroup { reason changes { name delta quantityAfterChange } }
          userErrors { field message code }
        }
      }
    `,
    {
      input: {
        name: 'available',
        reason: 'correction',
        referenceDocumentUri: `gid://pawtella/InventorySync/${Date.now()}`,
        quantities: [
          {
            inventoryItemId: gid('InventoryItem', inventoryItemId),
            locationId: gid('Location', locationId || env.shopify.depotLocationId),
            quantity: Math.max(0, parseInt(quantity, 10) || 0),
            changeFromQuantity: null,
          },
        ],
      },
    },
  );
  return true;
}

export async function setVariantInventoryPolicy(variantId, policy, productId) {
  const inventoryPolicy = String(policy).toUpperCase() === 'CONTINUE' ? 'CONTINUE' : 'DENY';
  let pid = productId;
  if (!pid) {
    const d = await admin(/* GraphQL */ `query V($id: ID!) { productVariant(id: $id) { product { id } } }`, { id: gid('ProductVariant', variantId) });
    pid = d.productVariant?.product?.id;
  }
  await admin(
    /* GraphQL */ `
      mutation VariantPolicy($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants { id }
          userErrors { field message }
        }
      }
    `,
    { productId: gid('Product', pid), variants: [{ id: gid('ProductVariant', variantId), inventoryPolicy }] },
  );
  return true;
}

export function __reset() {
  /* no state */
}
