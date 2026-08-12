# Supabase cloud sync setup

Sync your ledger (transactions, statements, gear flips, budgets) between devices.  
**You keep the DigitalOcean static site** — Supabase is the database + login in the cloud.

---

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. **New project** → pick a name (e.g. `household-ledger`), password, region close to you.
3. Wait until the project is ready.

---

## 2. Run the database schema

1. In Supabase: **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this repo and paste the full file.
3. Click **Run**. You should see “Success”.

---

## 3. Create the storage bucket (for PDFs & screenshots)

1. **Storage** → **New bucket**
2. Name: `statement-files`
3. **Private** bucket (not public)
4. Create bucket.

Then in **SQL Editor**, run the storage policies at the bottom of `supabase/schema.sql` (uncomment the `storage.buckets` insert and the three `create policy` blocks).

---

## 4. Enable email sign-in

1. **Authentication** → **Providers** → **Email**
2. Ensure **Email** is enabled.
3. For magic links: **Authentication** → **URL configuration**
   - **Site URL**: your DigitalOcean app URL (e.g. `https://your-app.ondigitalocean.app`)
   - **Redirect URLs**: add the same URL (and `http://localhost:5173` for local dev)

---

## 5. Copy API keys

1. **Project Settings** → **API**
2. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`

---

## 6. Local dev (optional)

```bash
cp .env.example .env.local
# Edit .env.local with your URL and anon key

npm install
npm run dev
```

Open **Settings → Cloud sync** and sign in with your email.

---

## 7. DigitalOcean deploy

1. [cloud.digitalocean.com/apps](https://cloud.digitalocean.com/apps) → your app
2. **Settings** → **App-Level Environment Variables**
3. Add:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
4. **Save** — App Platform will rebuild and redeploy.

> Vite bakes these into the build at deploy time. After changing env vars you must redeploy.

---

## 8. First sync (important — protects your existing data)

Do this on the **browser that already has your statements and screenshots** (the one showing “Already uploaded”):

1. Open the app → **Settings** → **Cloud sync**
2. Enter your email → **Send magic link**
3. Click the link in your email (returns you to the app, signed in)
4. You should see **“Upload this device to cloud”** — tap it once.

That copies:

- All transactions and import metadata  
- Gear flips, budgets, rules  
- **Original PDF/CSV/screenshot files** (from this browser’s storage)

Nothing is deleted from this browser.

---

## 9. Second device (or Trevor / Kate)

1. Open the app on the other device → **Settings** → **Cloud sync**
2. Sign in with email (each person uses their own email; both share one household ledger)
3. Tap **Download from cloud**

Statement **View** will fetch files from cloud storage if they aren’t cached locally yet.

---

## Troubleshooting

| Issue | Fix |
|--------|-----|
| “Supabase is not configured” | Add env vars on DO and redeploy |
| Magic link doesn’t return signed in | Add your app URL to Supabase **Redirect URLs** |
| View statement missing file | Run **Save to cloud now** on the device that has the files |
| Two separate households | Both users should use **Download from cloud** after the first upload; only the first sign-in creates the household |

---

## What stays local-only

- UI preferences (sidebar expanded, selected month in some cases)
- “Last good” recovery snapshots
- Import review drafts before you commit

Everything else syncs when signed in (auto-save every ~3 seconds).
