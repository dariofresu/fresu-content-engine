"""One-time Meta (Facebook + Instagram) token setup.

1. Open https://developers.facebook.com/tools/explorer
2. Select your app, click "Get User Access Token" with permissions:
   pages_manage_posts, pages_read_engagement, pages_show_list,
   instagram_basic, instagram_content_publish, business_management
3. Copy the short-lived token, then run:

    python scripts/authorize_meta.py APP_ID APP_SECRET SHORT_LIVED_TOKEN

Prints META_PAGE_ID, META_PAGE_TOKEN (long-lived) and IG_USER_ID.
"""
import sys

import requests

APP_ID, APP_SECRET, SHORT = sys.argv[1], sys.argv[2], sys.argv[3]
G = "https://graph.facebook.com/v21.0"

# short-lived -> long-lived user token
r = requests.get(f"{G}/oauth/access_token", params={
    "grant_type": "fb_exchange_token", "client_id": APP_ID,
    "client_secret": APP_SECRET, "fb_exchange_token": SHORT}, timeout=30)
r.raise_for_status()
long_user = r.json()["access_token"]

# pages + their (non-expiring) page tokens
pages = requests.get(f"{G}/me/accounts",
                     params={"access_token": long_user}, timeout=30).json()["data"]
if not pages:
    sys.exit("No Facebook Pages found on this account.")

print("\n=== Paste these into GitHub Secrets ===")
for p in pages:
    ig = requests.get(f"{G}/{p['id']}",
                      params={"fields": "instagram_business_account",
                              "access_token": p["access_token"]}, timeout=30).json()
    ig_id = ig.get("instagram_business_account", {}).get("id", "NOT LINKED")
    print(f"\nPage: {p['name']}")
    print("META_PAGE_ID =", p["id"])
    print("META_PAGE_TOKEN =", p["access_token"])
    print("IG_USER_ID =", ig_id)
