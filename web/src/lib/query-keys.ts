/** Central React Query keys. Add one entry per API area; invalidate by prefix after mutations. */
export const queryKeys = {
  session: ["session"] as const,
  me: ["me"] as const,
  pets: {
    all: ["pets"] as const,
    detail: (id: number | string) => ["pets", String(id)] as const,
  },
  users: {
    profile: (handle: string) => ["users", handle] as const,
    posts: (handle: string) => ["users", handle, "posts"] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    list: (page = 1) => ["notifications", "list", page] as const,
    unread: ["notifications", "unread"] as const,
  },
  points: {
    all: ["points"] as const,
    summary: ["points", "summary"] as const,
    transactions: (page = 1) => ["points", "transactions", page] as const,
    packs: ["points", "packs"] as const,
  },
  posts: {
    all: ["posts"] as const,
    feed: (mode: string, challengeId?: number | string) => ["posts", "feed", mode, challengeId ?? null] as const,
    detail: (id: number | string) => ["posts", String(id)] as const,
    comments: (id: number | string) => ["posts", String(id), "comments"] as const,
  },
  ai: {
    conversations: ["ai", "conversations"] as const,
    conversation: (id: string | number) => ["ai", "conversations", String(id)] as const,
    presets: ["ai", "presets"] as const,
    generations: ["ai", "generations"] as const,
    generation: (id: string | number) => ["ai", "generations", String(id)] as const,
    memory: ["ai", "memory"] as const,
  },
  shop: {
    collections: ["shop", "collections"] as const,
    products: (params: Record<string, string | undefined>) => ["shop", "products", params] as const,
    product: (handle: string) => ["shop", "products", handle] as const,
    cart: (id: string) => ["shop", "cart", id] as const,
    orders: ["shop", "orders"] as const,
    order: (id: string | number) => ["shop", "orders", String(id)] as const,
    fulfillment: ["shop", "fulfillment"] as const,
  },
  challenges: {
    all: ["challenges"] as const,
    detail: (id: string | number) => ["challenges", String(id)] as const,
  },
  partners: {
    list: (params: Record<string, string | undefined>) => ["partners", params] as const,
    detail: (id: string | number) => ["partners", String(id)] as const,
    me: ["partners", "me"] as const,
  },
  subscriptions: {
    all: ["subscriptions"] as const,
  },
};
