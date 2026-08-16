# 07 — Deployment (Vercel)

One Vercel project, two runtimes, free Hobby tier.

---

## 1. How Vercel runs both

The frontend and backend are separate top-level folders (`frontend/`, `backend/` — see PLAN.md §2), not the single-root layout Vercel expects by default. That takes one manual setting:

**Vercel Project Settings → General → Root Directory → `frontend`.** This is what makes Vercel's zero-config Next.js detection find `frontend/package.json`, and it's also what makes the Python runtime look for `.py` files under `frontend/api/` rather than the true repo root.

```
repo root
├── backend/app/…                     ← FastAPI source (Python runtime)
└── frontend/                         ← Vercel Root Directory
    ├── app/  components/  lib/       ← Next.js  (Node runtime)
    ├── package.json  next.config.ts
    ├── api/index.py                  ← FastAPI entrypoint, imports ../../backend
    ├── requirements.txt              ← see §2
    └── vercel.json
```

Because `backend/` lives *outside* `frontend/`, one more setting is required or the Python function's import fails at build time:

**Vercel Project Settings → General → "Include source files outside of the Root Directory in the Build Step" → ON.** Without this, Vercel only bundles `frontend/`'s own subtree, and `backend/` never makes it into the deployment.

`frontend/api/index.py` inserts the repo root onto `sys.path` before importing, since `backend/` is two directories up from `frontend/api/`:

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend.app.main import app  # noqa: E402, F401
```

Vercel serves it at `/api/index`, and `frontend/next.config.ts` rewrites `/api/:path*` onto it. In development the same rewrite points at `http://127.0.0.1:8000`, so frontend code calls `/api/products` in both environments and never branches on `NODE_ENV`. Run the dev servers from their own folders: `cd backend && ...\myenv\Scripts\uvicorn backend.app.main:app --reload --port 8000` from the **repo root** (uvicorn needs to see the `backend` package), and `cd frontend && npm run dev` for Next.js.

---

## 2. `frontend/requirements.txt` — the one deployment gotcha (verified against a real Vercel build)

**Vercel's Python runtime resolves `requirements.txt` relative to the project's Root Directory** — `frontend/`, per §1. Your dependencies are in `backend/requirements.txt`, one level up, which Vercel will not find on its own, and the build fails with `ModuleNotFoundError: No module named 'fastapi'` — an error that looks like a code problem and is not.

The obvious fix — `-r ../backend/requirements.txt` as the entire content of `frontend/requirements.txt` — looks correct and even **appears to work partway**: Vercel's dependency installer (`uv`) resolves and installs every package from it without complaint. But a *second*, separate stage — Vercel's Python function bundler, which packages the deployed function after the whole build otherwise succeeds — uses a stricter parser that cannot follow a parent-directory (`../`) include at all, and fails the entire build right at the end with `could not parse requirements.txt`. This was confirmed against two real deploys: the first failure looked like a comment-parsing issue and got fixed; the second, identical failure pointed at the include line itself, with the comment issue already gone.

The fix that actually works: **`frontend/requirements.txt` is a full duplicate of `backend/requirements.txt`, not a reference to it.** No `-r`, no relative path, nothing for that bundler to trip on — it's just a flat list of pins. The cost is that the two files must be kept in sync by hand; there is no dependency-manager magic that avoids this while staying inside Vercel's Python runtime constraints. If you add or change a package, edit both files.

Also avoid comment text in either file that merely *resembles* an include directive (e.g. writing out `-r some/path` as an example inside a comment) — the same bundler was observed choking on that too, treating commented-out text as a real directive.

---

## 3. `vercel.json`

```json
{
  "functions": {
    "api/index.py": { "memory": 1024, "maxDuration": 30 }
  },
  "crons": [
    { "path": "/api/health", "schedule": "0 6 * * *" }
  ],
  "headers": [
    {
      "source": "/admin/:path*",
      "headers": [
        { "key": "X-Robots-Tag", "value": "noindex, nofollow" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "no-referrer" }
      ]
    }
  ]
}
```

`maxDuration: 30` is generous for an order request that does a locked transaction plus two 8-second-capped email calls. `X-Frame-Options: DENY` on `/admin` stops the panel being framed by another site.

---

## 4. Environment variables

Vercel Dashboard → Project → **Settings → Environment Variables**. There is no upload-a-file option; paste each key. Set every one for **Production**, **Preview** and **Development**.

Copy from your `.env`, with these three changed for production:

| Key | Production value |
|---|---|
| `APP_ENV` | `production` |
| `ALLOWED_ORIGINS` | `https://<your-project>.vercel.app` (the real domain, not blank — an empty value resolves to zero allowed origins) |
| `NEXT_PUBLIC_API_BASE_URL` | `https://<your-project>.vercel.app` (the real domain, **not blank** — see the note below) |

Everything else — `DATABASE_URL`, `SUPABASE_*`, `ADMIN_*`, `BREVO_*`, `OWNER_EMAIL`, the store rules, the bank details — carries over unchanged.

Three rules:

- **`NEXT_PUBLIC_*` variables are compiled into the JavaScript bundle** and readable by anyone with devtools. Only the four public values may carry that prefix. If `SUPABASE_SERVICE_ROLE_KEY` or `ADMIN_PASSWORD` ever gets a `NEXT_PUBLIC_` prefix, the secret is public — rotate it, do not just rename it.
- **`NEXT_PUBLIC_API_BASE_URL` must be the real production URL, not blank.** The original plan here was to leave it empty and let the server fall back to Vercel's auto-injected `VERCEL_URL` for same-deployment self-fetches (used by `getProducts()`/`getSettings()` in server components). That fallback was tested against a real deployment and found unreliable: the static/ISR pages that self-fetch their own catalogue via `VERCEL_URL` came back with an empty product list — the fetch failed silently and the code's own `.catch()` swallowed it — even though hitting the identical endpoint from outside the deployment worked every time. Symptom to watch for: the admin panel (entirely client-rendered, always same-origin) shows real data while the storefront (server-rendered) shows nothing. Fix is to set this explicitly to the known-working production domain.
- **Changing an env var does not redeploy, and for this specific one, a redeploy of the *same build* isn't enough either.** `/`, `/shop`, etc. are static/ISR pages — their data was fetched once at build time and baked in. You need an actual fresh `next build` (a new commit push, or "Redeploy" **with** "Use existing Build Cache" turned off) for the corrected URL to take effect, not just a redeploy that reuses the prior build's output.

---

## 5. First deploy

```powershell
git init
git add .
git status          # ← CONFIRM .env IS NOT LISTED. If it is, fix .gitignore first.
git commit -m "Mayra Store: Next.js frontend, FastAPI backend, Supabase"
```

Push to GitHub, then Vercel → **Add New → Project** → import the repo. Framework preset: **Next.js**. Root directory: `./`. Add the environment variables **before** the first build, then deploy.

Then, in order:

1. `https://<project>.vercel.app/api/health` → `{"ok":true,"db":true}`
   Failure here is almost always `DATABASE_URL` — wrong port (must be 6543) or the `postgresql+psycopg://` prefix missing.
2. `https://<project>.vercel.app/api/products` → the catalogue as JSON
3. The storefront loads and shows products
4. `/admin` → login card, and the password works
5. Place a real test order → both emails arrive
6. Update `ALLOWED_ORIGINS` to the real domain and redeploy

---

## 6. Keeping Supabase awake

Free Supabase projects **pause after 7 days without database activity**. The cron in `vercel.json` hits `/api/health` daily at 06:00 UTC, which runs `select 1` and resets the clock.

Hobby-tier crons run **once per day**, which is exactly enough — the pause threshold is seven days.

For the health endpoint to count, it must genuinely touch the database:

```python
@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("select 1"))
        return {"ok": True, "db": True}
    except Exception:
        return {"ok": True, "db": False}
```

Returning 200 even when the database is down is intentional — Vercel retries failing crons and you do not want a paused project generating retry noise. The `db` field carries the real state.

**Demo-day insurance:** open the Supabase dashboard that morning and load the live site. If the project has paused, Dashboard → **Restore project**, wait a few minutes; all data survives. Paused is not deleted.

---

## 7. Limits you are working inside

| Limit | Hobby tier | Comfortable? |
|---|---|---|
| Function duration | up to 60 s (30 s configured) | Yes — orders take ~2–3 s |
| Function memory | 1–2 GB | Yes |
| Deployment bundle | 250 MB uncompressed | Yes — the Python deps are ~60 MB |
| Bandwidth | 100 GB/month | Yes |
| Cron jobs | 2, daily | Yes — one used |
| Supabase DB | 500 MB | Yes |
| Supabase Storage | 1 GB | Yes — a few hundred product photos |
| Brevo | 300 emails/day | Yes — 150 orders/day |

Nothing here is close to binding for a coursework project.

---

## 8. When it breaks

| Symptom | Cause | Fix |
|---|---|---|
| `ModuleNotFoundError: No module named 'fastapi'` | No root `requirements.txt` | §2 |
| `/api/*` returns the Next.js 404 page | Rewrite missing or misordered | Check `next.config.ts` |
| `remaining connection slots are reserved` | Direct connection instead of the pooler | Port 6543, `NullPool` — [plans/02 §5](02-database.md) |
| `prepared statement "_pg3_0" does not exist` | psycopg preparing statements against a transaction pooler | `connect_args={"prepare_threshold": None}` |
| CORS error in the browser console | `ALLOWED_ORIGINS` still `localhost:3000` | Set it to the Vercel URL and **redeploy** |
| Emails silently never arrive | Brevo sender not verified | [plans/06 §2](06-email.md) |
| Env change had no effect | Vercel does not auto-redeploy on env change | Redeploy |
| First request after idle is very slow | Python cold start | Expected. Catalogue pages are cached and do not hit it. |
| Site fine, admin 401s immediately | Cookie `secure=True` over http, or clock skew on `exp` | Check `APP_ENV` |

**Reading logs:** Vercel Dashboard → Deployments → the deployment → **Functions** → `api/index.py` → Logs. Python stack traces appear there. Nothing useful reaches the browser, by design ([plans/03 §7](03-backend-fastapi.md)).

---

## 9. Pre-submission checklist

- [ ] `git log -p | grep -i "BREVO_API_KEY\|SERVICE_ROLE\|ADMIN_PASSWORD"` returns nothing
- [ ] `.env` is not in the repository, at any commit
- [ ] `ADMIN_PASSWORD` is not one you use anywhere else
- [ ] `/docs` and `/redoc` are disabled in production
- [ ] `ALLOWED_ORIGINS` is the production domain only
- [ ] A card-payment order shows no card digits anywhere in the Network tab
- [ ] `robots.txt` disallows `/admin`
- [ ] The keepalive cron is listed under Project → Settings → Cron Jobs
- [ ] `pg_dump` backup taken and stored outside the repo
- [ ] Full order placed on the **production** URL, both emails received
