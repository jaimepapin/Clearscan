/**
 * Vercel Serverless Function: POST /api/parse
 * Proxies bill OCR text to OpenRouter. API key stays server-side.
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
        max_tokens: 1000,
        temperature: 0.1,
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return res.status(502).json({ error: 'LLM error: ' + upstream.status, detail: errText });
    }

    const data = await upstream.json();
    const text = data.choices?.[0]?.message?.content || '';
    const clean = text.replace(/```json|```/gi, '').trim();
    const parsed = JSON.parse(clean);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };
