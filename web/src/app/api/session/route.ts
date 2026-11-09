import { getServerSession } from "@/lib/session";

/** GET /api/session → `{ user, pets }` from the API's /api/auth/me, or `{ user: null, pets: [] }`. */
export async function GET() {
  const session = await getServerSession();
  return Response.json(session, { headers: { "cache-control": "no-store" } });
}
