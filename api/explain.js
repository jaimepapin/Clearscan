/**
 * Vercel / Cloudflare Serverless Function: POST /api/explain
 * Uses Groq API (not OpenRouter) for fast, free LLM inference.
 *
 * Required env var:  GROQ_API_KEY
 * Optional env var:  GROQ_MODEL  (default: llama-3.1-8b-instant)
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const GROQ_MODEL   = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

  if (!GROQ_API_KEY) {
    return res.status(503).json({ error: 'GROQ_API_KEY not configured in environment variables' });
  }

  const { provider, serviceDate, billed, covered, amount, lineItems } = req.body || {};

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model:       GROQ_MODEL,
        messages:    [{ role: 'user', content: prompt }],
        max_tokens:  600,
        temperature: 0.4,
      }),
    });

    clearTimeout(timeout);

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('Groq error:', upstream.status, errText);
      return res.status(502).json({ error: `Groq API error: ${upstream.status}`, detail: errText });
    }

    const data = await upstream.json();
    const text = data?.choices?.[0]?.message?.content?.trim();

    if (!text) {
      return res.status(502).json({ error: 'Groq returned an empty response', detail: JSON.stringify(data) });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ text });

  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timed out after 25s' });
    }
    console.error('explain.js error:', e);
    return res.status(500).json({ error: String(e) });
  }
}

export const config = { api: { bodyParser: { sizeLimit: '512kb' } } };
