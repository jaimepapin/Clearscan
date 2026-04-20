export async function onRequestPost({ request, env }) {
  const OPENROUTER_KEY   = env.OPENROUTER_KEY;
  const OPENROUTER_MODEL = env.OPENROUTER_MODEL || 'meta-llama/llama-3-70b-instruct';
  const OPENROUTER_URL   = 'https://openrouter.ai/api/v1/chat/completions';

  if (!OPENROUTER_KEY) {
    return Response.json({ error: 'OPENROUTER_KEY not configured' }, { status: 503 });
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  let prompt;

  if (body.mode === 'dispute_letter') {
    const { bill, errorSummary } = body;
    prompt = `You are a patient advocate helping someone write a formal medical billing dispute letter.

Bill details:
- Provider: ${bill.provider}
- Account/Invoice #: ${bill.account}
- Service date: ${bill.serviceDate}
- Total billed: $${(bill.billed || 0).toFixed(2)}
- Patient balance: $${(bill.amount || 0).toFixed(2)}

Identified billing issues:
${errorSummary}

Write a professional but firm dispute letter the patient can send to the provider's billing department. Include:
1. Date placeholder [DATE]
2. Patient name placeholder [YOUR NAME] and address placeholder [YOUR ADDRESS]
3. Reference to the account number and service date
4. A clear description of each disputed item
5. A request for an itemized bill and written explanation of each charge
6. A statement that payment is withheld pending resolution
7. A professional closing with signature line

Keep it under 350 words. Formal but not aggressive. Do not add any commentary before or after the letter.`;
  } else {
    const { provider, serviceDate, billed, covered, amount, lineItems } = body;
    const chargesSummary = Array.isArray(lineItems) && lineItems.length
      ? lineItems.map(l => `${l.desc} ($${(l.amount || 0).toFixed(2)})`).join(', ')
      : 'not itemized';
    prompt = `You are a warm, friendly assistant explaining a medical bill to someone who finds bills confusing and stressful. Use very simple everyday words — imagine explaining to a 12-year-old.

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
  }

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
        max_tokens: body.mode === 'dispute_letter' ? 800 : 600,
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return Response.json({ error: 'LLM error: ' + res.status, detail: errText }, { status: 502 });
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || 'No response received.';
    return Response.json({ text, content: text }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
