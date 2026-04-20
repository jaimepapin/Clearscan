/**
 * POST /api/explain
 * Body: { provider, serviceDate, billed, covered, amount, lineItems }
 * Returns a friendly plain-English explanation of the bill.
 */
export async function onRequestPost({ request, env }) {
  const OPENROUTER_KEY   = env.OPENROUTER_KEY;
  const OPENROUTER_MODEL = env.OPENROUTER_MODEL || 'meta-llama/llama-3-70b-instruct';
  const OPENROUTER_URL   = 'https://openrouter.ai/api/v1/chat/completions';

  if (!OPENROUTER_KEY) {
    return Response.json({ error: 'OPENROUTER_KEY not configured' }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { provider, serviceDate, billed, covered, amount, lineItems } = body;
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
    const res = await fetch(OPENROUTER_URL, {
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

    if (!res.ok) {
      const errText = await res.text();
      return Response.json({ error: 'LLM error: ' + res.status, detail: errText }, { status: 502 });
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || 'No response received.';

    return Response.json({ text }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
