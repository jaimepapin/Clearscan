# ClearScan — Medical Bill Scanner

Upload a medical bill image or PDF and get a plain-English breakdown of what you owe and why. Powered by Tesseract.js OCR and an LLM via OpenRouter.

---

## Project Structure

```
clearscan/
├── public/
│   └── index.html          ← The entire frontend (single HTML file)
├── functions/
│   └── api/
│       ├── config.js       ← Cloudflare Pages Function: GET /api/config
│       ├── parse.js        ← Cloudflare Pages Function: POST /api/parse
│       └── explain.js      ← Cloudflare Pages Function: POST /api/explain
├── api/
│   ├── config.js           ← Vercel Serverless Function: GET /api/config
│   ├── parse.js            ← Vercel Serverless Function: POST /api/parse
│   └── explain.js          ← Vercel Serverless Function: POST /api/explain
├── wrangler.toml           ← Cloudflare Pages config
├── vercel.json             ← Vercel routing config
├── package.json
├── .gitignore
├── .env.example            ← Copy to .env.local for local dev
└── README.md
```

> **Why two `api/` folders?**
> - `functions/api/` = Cloudflare Pages Functions (Wrangler/Edge runtime)
> - `api/` = Vercel Serverless Functions (Node.js runtime)
>
> Deploy to only one platform — the other folder is harmlessly ignored.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_KEY` | ✅ Yes | Your OpenRouter API key |
| `OPENROUTER_MODEL` | No | Default: `meta-llama/llama-3-70b-instruct` |
| `SUPABASE_URL` | No | Enables persistent bill history |
| `SUPABASE_ANON` | No | Supabase anon/public key |

---

## Option A — Deploy to Cloudflare Pages (Recommended)

Cloudflare Pages is free and runs your backend as Edge Functions globally.

### Step 1 — Push to GitHub

```bash
cd clearscan
git init
git add .
git commit -m "Initial commit"
# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/clearscan.git
git push -u origin main
```

### Step 2 — Connect to Cloudflare Pages

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Pages** → **Create a project**
2. Click **Connect to Git** → select your `clearscan` repository
3. Set build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `public`
4. Click **Save and Deploy**

### Step 3 — Add Environment Variables

1. In Cloudflare Pages → your project → **Settings** → **Environment Variables**
2. Add these variables for **Production** (and **Preview** if you want):

| Variable | Value |
|---|---|
| `OPENROUTER_KEY` | `sk-or-v1-your-key-here` |
| `OPENROUTER_MODEL` | `meta-llama/llama-3-70b-instruct` |
| `SUPABASE_URL` | *(optional)* |
| `SUPABASE_ANON` | *(optional)* |

3. Click **Save** → go to **Deployments** → **Retry deployment**

Your app is live at `https://clearscan.pages.dev` (or your custom domain).

---

## Option B — Deploy to Vercel

### Step 1 — Push to GitHub (same as above)

### Step 2 — Import to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your `clearscan` GitHub repository
3. Vercel auto-detects it as a static + serverless project
4. Set **Root Directory** to `.` (default)
5. Click **Deploy**

### Step 3 — Add Environment Variables

1. Go to your project → **Settings** → **Environment Variables**
2. Add the same variables as above
3. Click **Save** → Vercel will redeploy automatically

---

## Local Development

```bash
# Install Wrangler (Cloudflare's CLI)
npm install -g wrangler

# Copy env template
cp .env.example .env.local

# Edit .env.local with your real keys
# Then run:
wrangler pages dev public --compatibility-date=2024-01-01
```

This serves `public/index.html` at `http://localhost:8788` with the Functions at `/api/*`.

---

## Supabase Setup (Optional — for bill history)

If you want bills to persist across devices (not just localStorage):

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run:

```sql
create table bills (
  id          text primary key,
  provider    text,
  "serviceDate" text,
  "dueDate"   text,
  account     text,
  amount      numeric,
  billed      numeric,
  covered     numeric,
  status      text,
  note        text,
  confidence  integer,
  "lineItems" jsonb,
  "rawText"   text,
  filename    text,
  "scannedAt" timestamptz default now(),
  emoji       text
);

-- Allow anonymous inserts and reads (for demo — add auth for production)
alter table bills enable row level security;
create policy "Public read"   on bills for select using (true);
create policy "Public insert" on bills for insert with check (true);
```

3. Go to **Settings → API** and copy your **Project URL** and **anon public** key
4. Add them as `SUPABASE_URL` and `SUPABASE_ANON` environment variables

---

## OpenRouter API Key

1. Go to [openrouter.ai](https://openrouter.ai) and sign up (free)
2. Navigate to **Keys** → **Create Key**
3. Copy the key and set it as `OPENROUTER_KEY`

The default model (`meta-llama/llama-3-70b-instruct`) has a free tier. Check [openrouter.ai/models](https://openrouter.ai/models) for alternatives.

---

## Security Notes

- **API keys never reach the browser.** The frontend calls `/api/parse` and `/api/explain` — your OpenRouter key lives only in the server environment.
- `SUPABASE_ANON` is safe to expose (it's a public key by design), but the app serves it via `/api/config` rather than hardcoding it.
- For production, add rate limiting to the `/api/*` routes via Cloudflare's WAF or Vercel's middleware.
