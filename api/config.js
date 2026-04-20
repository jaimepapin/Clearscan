/**
 * Vercel Serverless Function: GET /api/config
 * Returns public Supabase credentials to the frontend.
 */
export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    supabaseUrl:  process.env.SUPABASE_URL  || null,
    supabaseAnon: process.env.SUPABASE_ANON || null,
  });
}
