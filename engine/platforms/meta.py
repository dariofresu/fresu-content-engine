"""Facebook Page + Instagram Business via Meta Graph API.

Secrets: META_PAGE_ID, META_PAGE_TOKEN (long-lived page token),
         IG_USER_ID, MEDIA_BASE_URL (public raw URL prefix for queue/media,
         e.g. https://raw.githubusercontent.com/<user>/<repo>/main/queue)

Instagram requires media to be fetchable by URL — the public repo provides
that via raw.githubusercontent.com.
"""
import os
import time
import requests

GRAPH = "https://graph.facebook.com/v21.0"


def _media_url(media):
    base = os.environ["MEDIA_BASE_URL"].rstrip("/")
    return f"{base}/media/{media.name}"


def publish_facebook(cfg, media, post):
    page = os.environ["META_PAGE_ID"]
    token = os.environ["META_PAGE_TOKEN"]
    if media is None:
        r = requests.post(f"{GRAPH}/{page}/feed",
                          data={"message": cfg["text"], "access_token": token}, timeout=60)
    elif media.suffix.lower() in (".mp4", ".mov"):
        r = requests.post(f"{GRAPH}/{page}/videos",
                          data={"description": cfg["text"],
                                "file_url": _media_url(media),
                                "access_token": token}, timeout=600)
    else:
        r = requests.post(f"{GRAPH}/{page}/photos",
                          data={"message": cfg["text"], "url": _media_url(media),
                                "access_token": token}, timeout=120)
    r.raise_for_status()
    j = r.json()
    post_id = j.get("post_id") or j.get("id")
    return f"https://www.facebook.com/{post_id}"


def publish_instagram(cfg, media, post):
    if media is None:
        raise ValueError("Instagram requires an image or video")
    ig = os.environ["IG_USER_ID"]
    token = os.environ["META_PAGE_TOKEN"]
    is_video = media.suffix.lower() in (".mp4", ".mov")

    params = {"caption": cfg["text"], "access_token": token}
    if is_video:
        params.update({"media_type": "REELS", "video_url": _media_url(media)})
    else:
        params["image_url"] = _media_url(media)

    r = requests.post(f"{GRAPH}/{ig}/media", data=params, timeout=60)
    r.raise_for_status()
    container = r.json()["id"]

    for _ in range(60):  # videos can take a while to process
        s = requests.get(f"{GRAPH}/{container}",
                         params={"fields": "status_code", "access_token": token},
                         timeout=30).json()
        if s.get("status_code") == "FINISHED":
            break
        if s.get("status_code") == "ERROR":
            raise RuntimeError(f"IG container error: {s}")
        time.sleep(10)

    r = requests.post(f"{GRAPH}/{ig}/media_publish",
                      data={"creation_id": container, "access_token": token}, timeout=60)
    r.raise_for_status()
    media_id = r.json()["id"]
    perm = requests.get(f"{GRAPH}/{media_id}",
                        params={"fields": "permalink", "access_token": token},
                        timeout=30).json()
    return perm.get("permalink", f"instagram media {media_id}")
