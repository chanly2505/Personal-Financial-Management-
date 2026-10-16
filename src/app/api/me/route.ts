import { jsonResponse, withUser } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * The signed-in user's own profile. There is no `id` parameter: the user is
 * always taken from the verified session, so this can only ever return the
 * caller's data. 401 without a valid session.
 */
export const GET = withUser(async (_request, _context, user) =>
  jsonResponse({
    id: user.id,
    email: user.email,
    name: user.name,
    timezone: user.timezone,
    baseCurrency: user.baseCurrency,
  }),
);
