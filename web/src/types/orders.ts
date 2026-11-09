/** Mirrors lib/orders.js toApiOrder (shop_orders row, camelCased). */
export type OrderStatus =
  | "paid"
  | "processing"
  | "ready_for_pickup"
  | "out_for_delivery"
  | "shipped"
  | "delivered"
  | "picked_up"
  | "cancelled"
  | "refunded";

export type FulfillmentType = "pickup" | "local_delivery" | "shipping";

export interface OrderLineItem {
  sku: string | null;
  handle: string | null;
  title: string;
  quantity: number;
  priceCents: number;
  variantId: string | null;
  productId: string | null;
  tags?: string[];
  pawPointsPack?: number;
}

export interface Order {
  id: number;
  orderNumber: number | string;
  shopifyOrderId?: string | number | null;
  currency: string;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  discountCodes: Array<string | { code: string }>;
  fulfillmentType: FulfillmentType | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  status: OrderStatus;
  pointsEarned: number;
  pointsRedeemed: number;
  packPointsGranted: number;
  lineItems: OrderLineItem[];
  trackingUrl: string | null;
  placedAt: string;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  /** Only on GET /api/shop/orders/:id */
  reviewedHandles?: string[];
}

export interface OrdersPage {
  orders: Order[];
  page: number;
  limit: number;
}
