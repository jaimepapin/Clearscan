/**
 * GET /api/config
 * Returns public Supabase credentials to the frontend.
 * The OpenRouter key never leaves the server.
 */
export async function onRequestGet({ env }) {
  return Response.json({
    supabaseUrl:  env.SUPABASE_URL  || null,
    supabaseAnon: env.SUPABASE_ANON || null,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
