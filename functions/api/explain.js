/**
 * Vercel Serverless Function: POST /api/explain
 * Returns a friendly plain-English AI explanation of the bill.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const OPENROUTER_KEY   = process.env.OPENROUTER_KEY;
  const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3-70b-instruct';

  if (!OPENROUTER_KEY) {
    return res.status(503).json({ error: 'OPENROUTER_KEY not configured' });
  }

  const { provider, serviceDate, billed, covered, amount, lineItems } = req.body || {};
  const chargesSummary = Array.isArray(lineItems) && lineItems.length
    ? lineItems.map(l => `${l.desc} ($${(l.amount || 0).toFixed(2)})`).join(', ')
    : 'not itemized';

  const prompt = `You are a warm, friendly assistant explaining a medical bill to someone who finds bills confusing and stressful. Use very simple everyday words — imagine explaining to a 12-year-old.

Bill details:
- Provider: ${provider}
- Service date: ${serviceDate}
- Total billed: $${(billed || 0).toFixed(2)}
- Insurance covered: $${(covered || 0).toFixed(2)}
- Patient owes: $${(amount || 0).toFixed(2)}
- Charges: ${chargesSummary}

Write exactly 3 short paragraphs:
1. What happened at the visit (what the bill is for)
2. Why they owe this amount (how insurance worked)
3. Reassure them this is a normal process and what to do next

No jargon. No bullet points. Just plain friendly paragraphs. Be warm and calm.`;

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': 'https://clearscan.app',
        'X-Title': 'ClearScan',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
        temperature: 0.4,
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return res.status(502).json({ error: 'LLM error: ' + upstream.status, detail: errText });
    }

    const data = await upstream.json();
    const text = data.choices?.[0]?.message?.content || 'No response received.';

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}

export const config = { api: { bodyParser: { sizeLimit: '512kb' } } };
