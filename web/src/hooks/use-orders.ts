"use client";

import { useQuery } from "@tanstack/react-query";
import { ordersService } from "@/services/orders";
import { queryKeys } from "@/lib/query-keys";
import { useSession } from "@/stores/session";

export function useOrders() {
  const { isAuthenticated } = useSession();
  return useQuery({ queryKey: queryKeys.shop.orders, queryFn: () => ordersService.list(1, 50), enabled: isAuthenticated });
}

export function useOrder(id: string | number) {
  const { isAuthenticated } = useSession();
  return useQuery({ queryKey: queryKeys.shop.order(id), queryFn: () => ordersService.get(id), enabled: isAuthenticated && !!id });
}
