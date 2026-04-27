/**
 * Vercel / Cloudflare Serverless Function: POST /api/parse
 * Uses Groq API instead of OpenRouter.
 *
 * Required env var: GROQ_API_KEY
 * Optional env var: GROQ_MODEL (default: llama-3.1-8b-instant)
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const GROQ_MODEL   = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

  if (!GROQ_API_KEY) {
    return res.status(503).json({ error: 'GROQ_API_KEY not configured' });
  }

  const rawText = (req.body?.text || '').slice(0, 4000);

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
- All dollar amounts must be numbers. No $ signs.
- If a field is not clearly present, use null
- confidence: 90+ all fields found, 70-89 most found, 40-69 some found, <40 mostly unreadable
- lineItems: only include if itemized charges are visible
Bill text:
${rawText}`;

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
        max_tokens:  1000,
        temperature: 0.1,
      }),
    });

    clearTimeout(timeout);

    if (!upstream.ok) {
      const errText = await upstream.text();
      return res.status(502).json({ error: 'Groq API error: ' + upstream.status, detail: errText });
    }

    const data = await upstream.json();
    const text = data?.choices?.[0]?.message?.content || '';
    const clean = text.replace(/```json|```/gi, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      return res.status(502).json({ error: 'Failed to parse LLM response as JSON', raw: clean });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(parsed);

  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timed out after 25s' });
    }
    return res.status(500).json({ error: String(e) });
  }
}

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };
