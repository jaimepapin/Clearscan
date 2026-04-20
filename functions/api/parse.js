/**
 * POST /api/parse
 * Body: { text: string }
 * Proxies bill OCR text to OpenRouter. API key stays server-side.
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

  const rawText = (body.text || '').slice(0, 4000);

  const prompt = `You are a medical billing expert. Extract structured data from this medical bill OCR text.

Return ONLY valid JSON, no explanation, no markdown, no backticks. Just the raw JSON object.

Extract these fields exactly:
{
  "provider": "hospital or clinic name, or null",
  "serviceDate": "date of service as string, or null",
  "dueDate": "payment due date as string, or null",
  "account": "account or invoice number as string, or null",
  "amountDue": number or null,
  "totalBilled": number or null,
  "insurancePaid": number or null,
  "lineItems": [
    { "code": "CPT code or empty string", "desc": "plain English description", "amount": number }
  ],
  "confidence": number between 0 and 100
}

Rules:
- amountDue = what the patient actually owes right now
- totalBilled = full amount before insurance
- insurancePaid = what insurance covered
- All dollar amounts must be numbers, not strings. No $ signs.
- If a field is not clearly present in the text, use null
- confidence: 90+ if all key fields found, 70-89 if most found, 40-69 if some found, below 40 if text is mostly unreadable
- lineItems: only include if CPT codes or itemized charges are visible

Bill text:
${rawText}`;

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
        max_tokens: 1000,
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return Response.json({ error: 'LLM error: ' + res.status, detail: errText }, { status: 502 });
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const clean = text.replace(/```json|```/gi, '').trim();
    const parsed = JSON.parse(clean);

    return Response.json(parsed, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
