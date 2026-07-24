"""One-time YouTube authorization. Run on your PC:

    python scripts/authorize_youtube.py CLIENT_ID CLIENT_SECRET

Opens the browser, you approve, and it prints the YT_REFRESH_TOKEN
to paste into GitHub → repo → Settings → Secrets → Actions.
"""
import http.server
import sys
import threading
import urllib.parse
import webbrowser

import requests

CLIENT_ID, CLIENT_SECRET = sys.argv[1], sys.argv[2]
REDIRECT = "http://localhost:8765/callback"
SCOPE = "https://www.googleapis.com/auth/youtube.upload"
code_holder = {}


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        code_holder["code"] = q.get("code", [""])[0]
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Done - you can close this tab and return to the terminal.")

    def log_message(self, *a):
        pass


srv = http.server.HTTPServer(("localhost", 8765), H)
threading.Thread(target=srv.handle_request, daemon=True).start()

url = ("https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
    "client_id": CLIENT_ID, "redirect_uri": REDIRECT, "response_type": "code",
    "scope": SCOPE, "access_type": "offline", "prompt": "consent"}))
print("Opening browser for Google consent...")
webbrowser.open(url)

while "code" not in code_holder:
    pass

r = requests.post("https://oauth2.googleapis.com/token", data={
    "client_id": CLIENT_ID, "client_secret": CLIENT_SECRET,
    "code": code_holder["code"], "redirect_uri": REDIRECT,
    "grant_type": "authorization_code"}, timeout=30)
r.raise_for_status()
print("\n=== Paste this into GitHub Secrets ===")
print("YT_REFRESH_TOKEN =", r.json()["refresh_token"])
