/**
 * Vercel Serverless Function: POST /api/explain
 * Returns a friendly plain-English AI explanation of the bill.
 *
 * FIXES:
 *  1. lineItems.map was corrupted to [lineItems.map](http://lineItems.map) — fixed
 *  2. Switched model to claude-haiku-3-5 via Anthropic API (free tier reliable)
 *     OR keep OpenRouter but use meta-llama/llama-3.1-8b-instruct (still free, active)
 *  3. Added explicit timeout (25s) so the UI never hangs forever
 *  4. Better error messages returned to frontend
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const OPENROUTER_KEY   = process.env.OPENROUTER_KEY;
  // llama-3-70b-instruct is deprecated — use the 8b free model or 3.1-70b
  const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free';

  if (!OPENROUTER_KEY) {
    return res.status(503).json({ error: 'OPENROUTER_KEY not configured' });
  }

  const { provider, serviceDate, billed, covered, amount, lineItems } = req.body || {};

  // FIX 1: was `[lineItems.map](http://lineItems.map)` — broken hyperlink syntax
  const chargesSummary = Array.isArray(lineItems) && lineItems.length
    ? lineItems.map(l => `${l.desc} ($${(l.amount || 0).toFixed(2)})`).join(', ')
    : 'not itemized';

  const prompt = `You are a warm, friendly assistant explaining a medical bill to someone who finds bills confusing and stressful. Use very simple everyday words — imagine explaining to a 12-year-old.

Bill details:
- Provider: ${provider || 'Unknown'}
- Service date: ${serviceDate || 'Unknown'}
- Total billed: $${(billed || 0).toFixed(2)}
- Insurance covered: $${(covered || 0).toFixed(2)}
- Patient owes: $${(amount || 0).toFixed(2)}
- Charges: ${chargesSummary}

Write exactly 3 short paragraphs:
1. What happened at the visit (what the bill is for)
2. Why they owe this amount (how insurance worked)
3. Reassure them this is a normal process and what to do next

No jargon. No bullet points. Just plain friendly paragraphs. Be warm and calm.`;

  // FIX 2: AbortController for a hard 25-second timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer':  'https://clearscan.app',
        'X-Title':       'ClearScan',
      },
      body: JSON.stringify({
        model:      OPENROUTER_MODEL,
        messages:   [{ role: 'user', content: prompt }],
        max_tokens: 600,
        temperature: 0.4,
      }),
    });

    clearTimeout(timeout);

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('OpenRouter error:', upstream.status, errText);
      return res.status(502).json({
        error:  `LLM error: ${upstream.status}`,
        detail: errText,
      });
    }

    const data = await upstream.json();

    // FIX 3: guard against unexpected response shapes
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      console.error('Empty LLM response:', JSON.stringify(data));
      return res.status(502).json({ error: 'LLM returned an empty response.', detail: JSON.stringify(data) });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ text });

  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      return res.status(504).json({ error: 'AI explanation timed out (>25s). Try again or check your OpenRouter model.' });
    }
    console.error('explain.js error:', e);
    return res.status(500).json({ error: String(e) });
  }
}

export const config = { api: { bodyParser: { sizeLimit: '512kb' } } };
