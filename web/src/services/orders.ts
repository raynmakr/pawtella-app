import { api } from "@/lib/api";
import type { Order, OrdersPage } from "@/types/orders";

export const ordersService = {
  list: (page = 1, limit = 20) => api<OrdersPage>("/api/shop/orders", { query: { page, limit } }),
  get: (id: number | string) => api<{ order: Order }>(`/api/shop/orders/${id}`),
};
