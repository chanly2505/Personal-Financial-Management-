/**
 * Hourly scheduler on Netlify (docs/DEPLOYMENT.md): calls the app's own cron
 * endpoint, which posts due recurring transactions and does housekeeping.
 * The endpoint is idempotent, so a repeated or overlapping run is harmless.
 * Netlify runs scheduled functions on published production deploys only.
 */
interface ScheduledContext {
  site: { url?: string };
}

async function runScheduledJobs(_request: Request, context: ScheduledContext) {
  const secret = process.env.CRON_SECRET;
  const base = context.site.url ?? process.env.URL;
  if (!secret || !base) {
    console.error(JSON.stringify({ level: "error", event: "scheduler.not_configured" }));
    return new Response("Not configured", { status: 503 });
  }
  const response = await fetch(new URL("/api/cron/recurring", base), {
    headers: { authorization: `Bearer ${secret}` },
  });
  const level = response.ok ? "info" : "error";
  console.log(JSON.stringify({ level, event: "scheduler.run", status: response.status }));
  return new Response(null, { status: response.ok ? 204 : 502 });
}

export default runScheduledJobs;

// 5 minutes past every hour (UTC); Phnom Penh is UTC+7, so local midnight
// rules post by 00:05.
export const config = { schedule: "5 * * * *" };
