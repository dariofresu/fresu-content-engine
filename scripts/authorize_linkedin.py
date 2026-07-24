"""One-time LinkedIn authorization (repeat every ~60 days when token expires).

    python scripts/authorize_linkedin.py CLIENT_ID CLIENT_SECRET

Prints LINKEDIN_ACCESS_TOKEN and LINKEDIN_AUTHOR_URN for GitHub Secrets.
"""
import http.server
import sys
import threading
import urllib.parse
import webbrowser

import requests

CLIENT_ID, CLIENT_SECRET = sys.argv[1], sys.argv[2]
REDIRECT = "http://localhost:8765/callback"
SCOPE = "openid profile w_member_social"
code_holder = {}


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        code_holder["code"] = q.get("code", [""])[0]
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Done - close this tab.")

    def log_message(self, *a):
        pass


srv = http.server.HTTPServer(("localhost", 8765), H)
threading.Thread(target=srv.handle_request, daemon=True).start()

url = ("https://www.linkedin.com/oauth/v2/authorization?" + urllib.parse.urlencode({
    "response_type": "code", "client_id": CLIENT_ID,
    "redirect_uri": REDIRECT, "scope": SCOPE}))
print("Opening browser for LinkedIn consent...")
webbrowser.open(url)

while "code" not in code_holder:
    pass

r = requests.post("https://www.linkedin.com/oauth/v2/accessToken", data={
    "grant_type": "authorization_code", "code": code_holder["code"],
    "redirect_uri": REDIRECT, "client_id": CLIENT_ID,
    "client_secret": CLIENT_SECRET}, timeout=30)
r.raise_for_status()
token = r.json()["access_token"]

me = requests.get("https://api.linkedin.com/v2/userinfo",
                  headers={"Authorization": f"Bearer {token}"}, timeout=30).json()

print("\n=== Paste these into GitHub Secrets ===")
print("LINKEDIN_ACCESS_TOKEN =", token)
print("LINKEDIN_AUTHOR_URN = urn:li:person:" + me["sub"])
