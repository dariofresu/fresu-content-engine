"""X (Twitter) — OAuth 1.0a user context (static keys, no token rotation).

Secrets: X_API_KEY, X_API_SECRET (consumer key/secret from the developer app)
         X_ACCESS_TOKEN, X_ACCESS_SECRET (user access token/secret)
Free tier: ~500 posts/month.
"""
import os
import requests
from requests_oauthlib import OAuth1

TWEET_URL = "https://api.x.com/2/tweets"
MEDIA_URL = "https://upload.twitter.com/1.1/media/upload.json"
MEDIA_URL_V2 = "https://api.x.com/2/media/upload"


def _auth():
    """OAuth2 user token from the broker if present, else static OAuth1 keys."""
    if os.environ.get("X_OAUTH2_TOKEN"):
        return {"Authorization": "Bearer " + os.environ["X_OAUTH2_TOKEN"]}
    return OAuth1(
        os.environ["X_API_KEY"], os.environ["X_API_SECRET"],
        os.environ["X_ACCESS_TOKEN"], os.environ["X_ACCESS_SECRET"],
    )


def _call(auth, method, url, **kw):
    if isinstance(auth, dict):                       # OAuth2 bearer headers
        kw.setdefault("headers", {}).update(auth)
    else:                                            # OAuth1 signer
        kw["auth"] = auth
    r = requests.request(method, url, **kw)
    r.raise_for_status()
    return r


def _media_id(j):
    return j.get("media_id_string") or j.get("data", {}).get("id")


def _upload_media(auth, media):
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
            "gif": "image/gif", "mp4": "video/mp4", "mov": "video/quicktime"}[
        media.suffix.lower().lstrip(".")]
    category = "tweet_video" if mime.startswith("video") else "tweet_image"
    size = media.stat().st_size
    # v1.1 upload only accepts OAuth1; the v2 endpoint accepts both
    url = MEDIA_URL_V2 if isinstance(auth, dict) else MEDIA_URL

    r = _call(auth, "POST", url, data={
        "command": "INIT", "total_bytes": size,
        "media_type": mime, "media_category": category}, timeout=30)
    media_id = _media_id(r.json())

    with media.open("rb") as f:
        seg = 0
        while chunk := f.read(4 * 1024 * 1024):
            _call(auth, "POST", url,
                  data={"command": "APPEND", "media_id": media_id, "segment_index": seg},
                  files={"media": chunk}, timeout=120)
            seg += 1

    r = _call(auth, "POST", url, data={"command": "FINALIZE", "media_id": media_id}, timeout=30)

    # wait for async video processing
    info = r.json().get("processing_info") or r.json().get("data", {}).get("processing_info")
    import time
    while info and info.get("state") in ("pending", "in_progress"):
        time.sleep(info.get("check_after_secs", 5))
        r = _call(auth, "GET", url,
                  params={"command": "STATUS", "media_id": media_id}, timeout=30)
        info = r.json().get("processing_info") or r.json().get("data", {}).get("processing_info")
    if info and info.get("state") == "failed":
        raise RuntimeError(f"X media processing failed: {info}")
    return media_id


def publish(cfg, media, post):
    auth = _auth()
    body = {"text": cfg["text"]}
    if media:
        body["media"] = {"media_ids": [_upload_media(auth, media)]}
    r = _call(auth, "POST", TWEET_URL, json=body, timeout=30)
    tweet_id = r.json()["data"]["id"]
    return f"https://x.com/i/status/{tweet_id}"
