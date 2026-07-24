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


def _auth():
    return OAuth1(
        os.environ["X_API_KEY"], os.environ["X_API_SECRET"],
        os.environ["X_ACCESS_TOKEN"], os.environ["X_ACCESS_SECRET"],
    )


def _upload_media(auth, media):
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
            "gif": "image/gif", "mp4": "video/mp4", "mov": "video/quicktime"}[
        media.suffix.lower().lstrip(".")]
    category = "tweet_video" if mime.startswith("video") else "tweet_image"
    size = media.stat().st_size

    r = requests.post(MEDIA_URL, auth=auth, data={
        "command": "INIT", "total_bytes": size,
        "media_type": mime, "media_category": category}, timeout=30)
    r.raise_for_status()
    media_id = r.json()["media_id_string"]

    with media.open("rb") as f:
        seg = 0
        while chunk := f.read(4 * 1024 * 1024):
            r = requests.post(MEDIA_URL, auth=auth,
                              data={"command": "APPEND", "media_id": media_id,
                                    "segment_index": seg},
                              files={"media": chunk}, timeout=120)
            r.raise_for_status()
            seg += 1

    r = requests.post(MEDIA_URL, auth=auth,
                      data={"command": "FINALIZE", "media_id": media_id}, timeout=30)
    r.raise_for_status()

    # wait for async video processing
    info = r.json().get("processing_info")
    import time
    while info and info.get("state") in ("pending", "in_progress"):
        time.sleep(info.get("check_after_secs", 5))
        r = requests.get(MEDIA_URL, auth=auth,
                         params={"command": "STATUS", "media_id": media_id}, timeout=30)
        r.raise_for_status()
        info = r.json().get("processing_info")
    if info and info.get("state") == "failed":
        raise RuntimeError(f"X media processing failed: {info}")
    return media_id


def publish(cfg, media, post):
    auth = _auth()
    body = {"text": cfg["text"]}
    if media:
        body["media"] = {"media_ids": [_upload_media(auth, media)]}
    r = requests.post(TWEET_URL, json=body, auth=auth, timeout=30)
    r.raise_for_status()
    tweet_id = r.json()["data"]["id"]
    return f"https://x.com/i/status/{tweet_id}"
