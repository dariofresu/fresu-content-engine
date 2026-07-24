"""One-time TikTok authorization.

TikTok requires an HTTPS redirect URI, so this uses manual code copy:

    python scripts/authorize_tiktok.py CLIENT_KEY CLIENT_SECRET REDIRECT_URI

Use the same REDIRECT_URI you registered in the TikTok developer app
(any https page you control works — e.g. your GitHub Pages URL).
After approving, TikTok redirects there with ?code=... in the address bar;
copy that code and paste it when prompted.

Prints TIKTOK_REFRESH_TOKEN for GitHub Secrets.
"""
import sys
import urllib.parse
import webbrowser

import requests

KEY, SECRET, REDIRECT = sys.argv[1], sys.argv[2], sys.argv[3]

url = ("https://www.tiktok.com/v2/auth/authorize/?" + urllib.parse.urlencode({
    "client_key": KEY, "response_type": "code",
    "scope": "user.info.basic,video.publish,video.upload",
    "redirect_uri": REDIRECT}))
print("Opening browser for TikTok consent...")
webbrowser.open(url)
code = input("\nPaste the ?code= value from the redirected URL: ").strip()
code = urllib.parse.unquote(code)

r = requests.post("https://open.tiktokapis.com/v2/oauth/token/", data={
    "client_key": KEY, "client_secret": SECRET, "code": code,
    "grant_type": "authorization_code", "redirect_uri": REDIRECT},
    headers={"Content-Type": "application/x-www-form-urlencoded"}, timeout=30)
r.raise_for_status()
j = r.json()
if "refresh_token" not in j:
    sys.exit(f"TikTok error: {j}")
print("\n=== Paste this into GitHub Secrets ===")
print("TIKTOK_REFRESH_TOKEN =", j["refresh_token"])
