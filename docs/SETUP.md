# One-time setup — platform credentials

Everything here is free. Each platform gives you keys that go into
**GitHub → your repo → Settings → Secrets and variables → Actions → New repository secret**.
You paste secrets yourself; run the `scripts/authorize_*.py` helpers locally —
they print exactly the names and values to paste. You never share these values
with anyone (including Claude).

Prerequisite once: `pip install requests` (for the helper scripts).

---

## 1. X (Twitter) — easiest, no scripts needed (~10 min)

1. https://developer.x.com → sign in with the brand account → create Free project + app.
2. App settings → **User authentication settings** → set up: Read and Write,
   Web App type, any callback URL (unused for this flow).
3. App → **Keys and tokens** tab:
   - API Key and Secret → secrets `X_API_KEY`, `X_API_SECRET`
   - "Access Token and Secret" → **Generate** (must say "Read and Write")
     → secrets `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`

## 2. LinkedIn (~15 min, re-run helper every ~60 days)

1. https://developer.linkedin.com → Create app (attach your company Page).
2. Products tab → add **"Share on LinkedIn"** + **"Sign In with LinkedIn using OpenID Connect"** (instant).
3. Auth tab → add redirect URL `http://localhost:8765/callback`.
4. Run `python scripts/authorize_linkedin.py CLIENT_ID CLIENT_SECRET`
   → paste `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_AUTHOR_URN`.
   (To post as the company page instead of yourself, ask Claude — needs the
   Community Management API product and an organization URN.)

## 3. Facebook + Instagram (~30 min)

Prereq: Instagram is a Business/Creator account linked to your Facebook Page.

1. https://developers.facebook.com → Create App → type **Business**.
2. Keep the app in **Development mode** (fine forever for your own pages);
   you must be listed as app Administrator.
3. Follow the steps in the docstring of `scripts/authorize_meta.py`
   (Graph API Explorer → short-lived token → run the script)
   → paste `META_PAGE_ID`, `META_PAGE_TOKEN`, `IG_USER_ID`.

## 4. YouTube (~20 min)

1. https://console.cloud.google.com → new project → enable **YouTube Data API v3**.
2. OAuth consent screen: External → fill the 3 required fields →
   **PUBLISH the app to "In production"** (do NOT leave it in Testing —
   testing-mode tokens die after 7 days; unverified production shows a
   warning screen once, which is fine, it's your own app).
3. Credentials → Create OAuth client ID → Web application →
   redirect URI `http://localhost:8765/callback`.
4. Run `python scripts/authorize_youtube.py CLIENT_ID CLIENT_SECRET`
   → paste `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`.

Quota note: ~6 uploads/day max on default quota.

## 5. TikTok (~30 min + audit wait)

1. https://developers.tiktok.com → create app → add **Login Kit** +
   **Content Posting API**; scopes `video.upload`, `video.publish`.
2. Register an HTTPS redirect URI (your GitHub Pages URL works).
3. Run `python scripts/authorize_tiktok.py CLIENT_KEY CLIENT_SECRET REDIRECT_URI`
   → paste `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REFRESH_TOKEN`.
4. Submit the app for **audit**. Until approved, posts arrive as
   **private (self-only)** — you tap "make public" in the TikTok app.
   After audit, they publish public automatically.

---

## Secrets checklist

| Secret | Platform |
|---|---|
| X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET | X |
| LINKEDIN_ACCESS_TOKEN, LINKEDIN_AUTHOR_URN | LinkedIn |
| META_PAGE_ID, META_PAGE_TOKEN, IG_USER_ID | Facebook + Instagram |
| YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN | YouTube |
| TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN | TikTok |

Platforms activate independently — a post only goes to platforms whose
secrets exist AND whose `enabled` flag is true in the queue entry.
Start with X + LinkedIn, add the rest as you finish each setup.
