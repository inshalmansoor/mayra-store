# 02 — Database (Supabase Postgres)

---

## 1. Why Supabase

You need three things for free: a relational database, somewhere to put product photos, and something that survives serverless connection churn. Supabase is the only free option that has all three in one account.

- **Postgres 500 MB** — the catalogue is a few hundred kilobytes; orders would take years to fill it.
- **Storage 1 GB, CDN-backed** — where product images actually live. This is the reason Supabase beat Neon here; Neon has no file storage, so image upload would have meant a second service.
- **Supavisor pooler** — the transaction-mode pooler on port 6543, which is what makes Postgres usable from functions that open a connection, run one query, and die.

**The one real catch:** free projects **pause after 7 days without activity**. Restoring takes a couple of minutes from the dashboard, but if that happens the morning of your demo you will not enjoy it. §7 handles it.

---

## 2. Setup, once

1. [supabase.com](https://supabase.com) → **New project**.
   - Name `mayra-store`, region **Singapore** or **Mumbai** (closest to Pakistan).
   - Set a database password and **save it** — it goes in `DATABASE_URL` and is not shown again.
2. **Project Settings → Database → Connection string → Transaction pooler.**
   Copy it. Change the scheme from `postgresql://` to `postgresql+psycopg://`. Paste into `DATABASE_URL` in `.env`.
   It should look like:
   `postgresql+psycopg://postgres.abcdefgh:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`
   Confirm the port is **6543**, not 5432. Port 5432 is the direct connection and will fail under serverless.
3. **Project Settings → API** → copy the Project URL into `SUPABASE_URL` and the `service_role` key into `SUPABASE_SERVICE_ROLE_KEY`.
   The `service_role` key bypasses every access rule. It belongs in the backend only. If it ever appears in a `NEXT_PUBLIC_*` variable or in browser-shipped code, rotate it.
4. **Storage → New bucket** → name `product-images`, toggle **Public bucket ON**.
   Public is correct here: product photos are meant to be seen, and public URLs mean no signing round-trip on every page render. Uploads still require the service key, so only your backend can write.
5. **SQL Editor** → paste §3 → Run.
6. Seed: `python -m backend.app.seed` (§6).

---

## 3. Schema

Money is stored as `INTEGER` rupees. PKR has no practical minor unit and floats have no business anywhere near a price.

```sql
-- =====================================================================
--  Mayra Store — schema v1
-- =====================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ---------------------------------------------------------------- catalogue
create table categories (
  slug        text primary key,              -- 'necklaces'
  label       text not null,                 -- 'Necklaces'
  sort_order  int  not null default 0
);

create table products (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,          -- 'p-heart-charm' — keeps prototype ids
  name         text not null,
  category     text not null references categories(slug),
  collection   text,                          -- 'golden-essence' | null
  base_price   int  not null check (base_price >= 0),
  material     text not null default '18k gold-plated stainless steel',
  blurb        text not null default '',
  care         jsonb not null default '[]'::jsonb,   -- ["Remove before showering", …]
  is_active    boolean not null default true, -- admin's hide switch; hidden ≠ deleted
  is_featured  boolean not null default false,-- the four pieces on the landing page
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on products (category);
create index on products (is_active);

-- One axis of choice: 'colour', 'length', 'size'.
create table product_options (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  key         text not null,                  -- 'colour'
  label       text not null,                  -- 'Colour'
  type        text not null check (type in ('swatch','segment')),
  position    int  not null default 0,         -- ORDER MATTERS — see §4
  unique (product_id, key)
);

create table product_option_values (
  id          uuid primary key default gen_random_uuid(),
  option_id   uuid not null references product_options(id) on delete cascade,
  value_id    text not null,                  -- 'gold'  — the token used in variant_key
  label       text not null,                  -- 'Gold'
  hex         text,                            -- swatch fill; null for segments
  price_delta int  not null default 0,
  position    int  not null default 0,
  unique (option_id, value_id)
);

-- A variant row exists ONLY for combinations that are actually made.
-- Absent row  = "never made"     → hatched, "Not made in this combination."
-- stock = 0   = "sold out"       → struck through, "Sold out."
-- Conflating these two is the bug this table shape exists to prevent.
create table product_variants (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products(id) on delete cascade,
  variant_key  text not null,                 -- 'gold|18', or 'default' when no options
  sku          text not null,
  stock        int  not null default 0 check (stock >= 0),
  unique (product_id, variant_key),
  unique (sku)
);
create index on product_variants (product_id);

create table product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  colour_key  text not null default 'default',-- matches a colour value_id, or 'default'
  url         text not null,                  -- Supabase Storage public URL, or an Unsplash URL for seed data
  storage_path text,                          -- bucket path; null for external URLs. Needed to delete the file.
  alt         text not null default '',
  position    int  not null default 0
);
create index on product_images (product_id);

-- ------------------------------------------------------------------- orders
create sequence order_number_seq start 1001;

create table orders (
  id              uuid primary key default gen_random_uuid(),
  order_number    text unique not null,       -- 'MYR-1042'
  customer_name   text not null,
  customer_email  text not null,
  customer_phone  text not null,
  address         text not null,
  city            text not null,
  postal_code     text,
  note            text,

  payment_method  text not null check (payment_method in ('cod','bank','card')),
  payment_status  text not null check (payment_status in ('pending','awaiting_transfer','simulated','paid','refunded')),
  status          text not null default 'new'
                  check (status in ('new','confirmed','packed','shipped','delivered','cancelled')),

  -- all server-computed; the browser's numbers are never written here
  subtotal        int not null,
  discount_code   text,
  discount_amount int not null default 0,
  delivery_fee    int not null default 0,
  total           int not null,

  email_status    text not null default 'pending'
                  check (email_status in ('pending','sent','partial','failed')),
  email_error     text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on orders (created_at desc);
create index on orders (status);

-- Denormalised on purpose: an order is a historical record. If the admin
-- later renames a product or changes its price, past orders must not change.
create table order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  product_id      uuid references products(id) on delete set null,
  variant_id      uuid references product_variants(id) on delete set null,
  product_name    text not null,              -- snapshot
  selection_label text not null default '',   -- 'Gold · 18"'
  sku             text not null,              -- snapshot
  image_url       text,                       -- snapshot, for the email
  unit_price      int  not null,              -- snapshot
  qty             int  not null check (qty > 0),
  line_total      int  not null
);
create index on order_items (order_id);

-- ------------------------------------------------------------------ extras
-- The "Notify me when it's back" field on sold-out products.
create table notify_requests (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  email       text not null,
  notified    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (product_id, email)
);

-- Store settings the admin can edit without a redeploy.
-- Secrets stay in .env; only display/business values live here.
create table settings (
  key    text primary key,
  value  text not null
);

insert into categories (slug, label, sort_order) values
  ('necklaces','Necklaces',1),
  ('bracelets','Bracelets',2),
  ('rings','Rings',3),
  ('earrings','Earrings',4);

insert into settings (key, value) values
  ('announcement_text', 'Launch offer — 20% off everything with code MAYRA20'),
  ('announcement_enabled', 'true'),
  ('promo_popup_enabled', 'true'),
  ('about_intro', '')
on conflict (key) do nothing;

-- updated_at maintenance
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger products_touch before update on products
  for each row execute function touch_updated_at();
create trigger orders_touch before update on orders
  for each row execute function touch_updated_at();
```

### 3.1 Row Level Security

Everything reaches this database through your FastAPI backend using the `service_role` key or the pooled connection string — never from a browser. So RLS is not load-bearing here. Enable it anyway with no permissive policies, so that if a key ever leaks into the frontend the blast radius is nothing:

```sql
alter table products               enable row level security;
alter table product_options        enable row level security;
alter table product_option_values  enable row level security;
alter table product_variants       enable row level security;
alter table product_images         enable row level security;
alter table orders                 enable row level security;
alter table order_items            enable row level security;
alter table notify_requests        enable row level security;
alter table settings               enable row level security;
alter table categories             enable row level security;
-- No policies created. The service_role key bypasses RLS by design;
-- the anon key now sees nothing at all.
```

---

## 4. `variant_key` — the contract between three layers

The prototype builds a variant key by joining the selected value of each option, **in the order the options are declared**:

```js
variantKey(p, sel) { return p.options.length ? p.options.map(o => sel[o.key]).join('|') : 'default'; }
```

Keeping that exact convention means the ported frontend, the API responses, and the `product_variants` table all speak the same language, and no translation layer is needed anywhere.

Two rules that must hold or keys silently stop matching:

1. **`product_options.position` is the join order.** Always sort by it — in the API serialiser, in the admin editor, everywhere. Never rely on insertion order.
2. **Products with no options use the literal key `'default'`.** The prototype already does this (`p-layered-set` has `variants: { 'default': … }`).

If an admin adds a *new option* to an existing product, every existing `variant_key` becomes wrong. The admin panel handles this explicitly — see [plans/05 §5.3](05-admin-panel.md).

---

## 5. Connecting from FastAPI

`backend/app/db.py`:

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from .config import settings

engine = create_engine(
    settings.DATABASE_URL,
    poolclass=NullPool,                       # (1)
    connect_args={"prepare_threshold": None}, # (2)
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

Both non-obvious arguments matter:

1. **`NullPool`** — SQLAlchemy's default pool keeps connections open between requests. In a serverless function that is worse than useless: the container may be frozen or destroyed with connections still checked out, and Supabase's connection slots leak away. `NullPool` opens one connection per request and closes it. Supavisor already does the real pooling upstream.
2. **`prepare_threshold=None`** — psycopg 3 automatically converts repeated statements to server-side prepared statements. Supavisor's *transaction* mode multiplexes different clients onto the same backend connection between statements, so a prepared statement can vanish underneath you. The symptom is an intermittent `prepared statement "_pg3_0" does not exist` that only appears under load, which is a miserable thing to debug at 2 a.m. Disabling preparation avoids it entirely.

---

## 6. Seeding

`backend/app/seed.py` loads the 12 products already written in the prototype (`reference/Mayra Store.dc.html`, lines 645–740) — names, prices, blurbs, options, variant stock levels, and Unsplash image ids all carry over verbatim. That gives you a populated, browsable store the moment the backend runs, so frontend work is never blocked on data entry.

Expansion rules:

- `U.heart1` → `https://images.unsplash.com/photo-1623321673989-830eff0fd59f?auto=format&fit=crop&w=900&q=80`, inserted with `storage_path = null` (nothing to delete from Storage later).
- `images.default` → rows with `colour_key = 'default'`; `images.rose` → `colour_key = 'rose'`.
- Options get `position` from array order; values likewise.
- `care: CARE_DEFAULT` → the three-item JSON array.
- Featured: mark four pieces `is_featured = true` (the landing page needs exactly four).

Make it idempotent — `on conflict (slug) do nothing` — and give it a `--reset` flag that truncates the catalogue tables first, so you can re-run it while iterating without accumulating duplicates. `--reset` must never touch `orders`.

---

## 7. Keeping the project awake

Free Supabase projects pause after 7 days with no database activity. The daily Vercel cron in [plans/07 §6](07-deployment-vercel.md) hits `/api/health`, which runs `select 1`. That single query counts as activity and resets the clock.

Belt and braces for demo day: open the Supabase dashboard the morning of, and load the live site once. If it *has* paused, Dashboard → **Restore project**; it comes back in a few minutes with all data intact. Paused is not deleted.

---

## 8. Backups

The free tier has no automated backups. Before you submit, run once:

```bash
pg_dump "postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres" \
  --no-owner --no-privileges > backup.sql
```

Keep `backup.sql` outside the repo — it contains customer names, addresses and phone numbers from any test orders. Restoring is `psql < backup.sql` into a fresh project.
