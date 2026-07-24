"""YouTube — resumable video upload via YouTube Data API v3.

Secrets: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN
The Google Cloud app must be set to "In production" (not "Testing"),
otherwise the refresh token dies after 7 days.
"""
import json
import os
import requests

TOKEN_URL = "https://oauth2.googleapis.com/token"
UPLOAD_URL = ("https://www.googleapis.com/upload/youtube/v3/videos"
              "?uploadType=resumable&part=snippet,status")


def _access_token():
    if os.environ.get("YT_ACCESS_TOKEN"):        # provided by the token broker
        return os.environ["YT_ACCESS_TOKEN"]
    r = requests.post(TOKEN_URL, data={
        "client_id": os.environ["YT_CLIENT_ID"],
        "client_secret": os.environ["YT_CLIENT_SECRET"],
        "refresh_token": os.environ["YT_REFRESH_TOKEN"],
        "grant_type": "refresh_token",
    }, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def publish(cfg, media, post):
    if media is None or media.suffix.lower() not in (".mp4", ".mov", ".webm"):
        raise ValueError("YouTube requires a video file")
    token = _access_token()
    meta = {
        "snippet": {
            "title": cfg.get("video_title") or post.get("title", "Untitled"),
            "description": cfg["text"],
            "tags": cfg.get("tags", []),
            "categoryId": "28",  # Science & Technology
        },
        "status": {"privacyStatus": "public", "selfDeclaredMadeForKids": False},
    }
    init = requests.post(UPLOAD_URL, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/*",
        "X-Upload-Content-Length": str(media.stat().st_size),
    }, data=json.dumps(meta), timeout=60)
    init.raise_for_status()
    session_url = init.headers["Location"]

    up = requests.put(session_url, data=media.open("rb"),
                      headers={"Authorization": f"Bearer {token}",
                               "Content-Type": "video/*"}, timeout=3600)
    up.raise_for_status()
    vid = up.json()["id"]
    return f"https://www.youtube.com/watch?v={vid}"
