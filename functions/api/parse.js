import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const OPENROUTER_KEY   = process.env.OPENROUTER_KEY;
  const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3-70b-instruct';
  const OPENROUTER_URL   = 'https://openrouter.ai/api/v1/chat/completions';

  if (!OPENROUTER_KEY) return res.status(503).json({ error: 'OPENROUTER_KEY not configured' });

  const rawText = (req.body?.text || '').slice(0, 4000);

  const prompt = `You are a medical billing expert and patient advocate. Extract structured data from this medical bill OCR text AND flag potential billing errors.

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
  "confidence": number between 0 and 100,
  "billingErrors": [
    {
      "type": "duplicate|upcoding|unbundling|missing_adjustment|suspicious_amount|other",
      "severity": "high|medium|low",
      "title": "short human-readable title",
      "description": "1-2 sentence plain English explanation of why this looks wrong",
      "lineItemCode": "CPT code if applicable, or null",
      "estimatedOvercharge": number or null
    }
  ]
}

Rules:
- amountDue = what the patient actually owes right now
- totalBilled = full amount before insurance
- insurancePaid = what insurance covered
- All dollar amounts must be numbers, not strings. No $ signs.
- billingErrors: check for duplicate charges, upcoding, unbundling, missing adjustments, suspicious round-number amounts
- If no billing errors found, return billingErrors as empty array []
- Only flag issues you can reasonably infer from the text

Bill text:
${rawText}`;

  try {
    const apiRes = await fetch(OPENROUTER_URL, {
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
        max_tokens: 1500,
        temperature: 0.1,
      }),
    });

    const data = await apiRes.json();
    const text = data.choices?.[0]?.message?.content || '';
    const clean = text.replace(/```json|```/gi, '').trim();
    const parsed = JSON.parse(clean);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
