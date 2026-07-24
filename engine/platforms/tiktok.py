"""TikTok — Content Posting API (direct post, FILE_UPLOAD).

Secrets: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN
Until the TikTok app passes audit, posts land as private/self-only —
approve them in the TikTok app. After audit they go out public directly.
Refresh token rotates: persisted to queue/.tiktok_refresh_token.
"""
import os
import requests
from pathlib import Path

API = "https://open.tiktokapis.com/v2"
ROTATED = Path(__file__).resolve().parent.parent.parent / "queue" / ".tiktok_refresh_token"


def _access_token():
    refresh = ROTATED.read_text().strip() if ROTATED.exists() else os.environ["TIKTOK_REFRESH_TOKEN"]
    r = requests.post(f"{API}/oauth/token/", data={
        "client_key": os.environ["TIKTOK_CLIENT_KEY"],
        "client_secret": os.environ["TIKTOK_CLIENT_SECRET"],
        "grant_type": "refresh_token",
        "refresh_token": refresh,
    }, headers={"Content-Type": "application/x-www-form-urlencoded"}, timeout=30)
    r.raise_for_status()
    tok = r.json()
    if tok.get("refresh_token"):
        ROTATED.write_text(tok["refresh_token"])
    return tok["access_token"]


def publish(cfg, media, post):
    if media is None or media.suffix.lower() not in (".mp4", ".mov", ".webm"):
        raise ValueError("TikTok requires a video file")
    token = _access_token()
    size = media.stat().st_size
    chunk_size = min(size, 64 * 1024 * 1024)
    init = requests.post(f"{API}/post/publish/video/init/", json={
        "post_info": {
            "title": cfg["text"][:2200],
            "privacy_level": cfg.get("privacy", "SELF_ONLY"),
            "disable_duet": False, "disable_comment": False, "disable_stitch": False,
        },
        "source_info": {
            "source": "FILE_UPLOAD",
            "video_size": size,
            "chunk_size": chunk_size,
            "total_chunk_count": max(1, (size + chunk_size - 1) // chunk_size),
        },
    }, headers={"Authorization": f"Bearer {token}"}, timeout=30)
    init.raise_for_status()
    j = init.json()
    if j.get("error", {}).get("code") not in (None, "ok"):
        raise RuntimeError(f"TikTok init error: {j['error']}")
    upload_url = j["data"]["upload_url"]

    data = media.read_bytes()
    up = requests.put(upload_url, data=data, headers={
        "Content-Type": "video/mp4",
        "Content-Range": f"bytes 0-{size - 1}/{size}",
    }, timeout=1800)
    up.raise_for_status()
    return f"tiktok publish_id {j['data']['publish_id']} (check TikTok app)"
