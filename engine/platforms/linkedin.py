"""LinkedIn — post to personal profile or organization page.

Secrets: LINKEDIN_ACCESS_TOKEN (60-day, re-authorize when expired),
         LINKEDIN_AUTHOR_URN (e.g. urn:li:person:xxxx or urn:li:organization:xxxx)
"""
import os
import requests

API = "https://api.linkedin.com"


def _headers():
    return {
        "Authorization": f"Bearer {os.environ['LINKEDIN_ACCESS_TOKEN']}",
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": "202506",
        "Content-Type": "application/json",
    }


def _upload_image(author, media):
    r = requests.post(f"{API}/rest/images?action=initializeUpload",
                      headers=_headers(),
                      json={"initializeUploadRequest": {"owner": author}}, timeout=30)
    r.raise_for_status()
    v = r.json()["value"]
    up = requests.put(v["uploadUrl"], data=media.read_bytes(),
                      headers={"Authorization": _headers()["Authorization"]}, timeout=300)
    up.raise_for_status()
    return v["image"]


def _upload_video(author, media):
    size = media.stat().st_size
    r = requests.post(f"{API}/rest/videos?action=initializeUpload",
                      headers=_headers(),
                      json={"initializeUploadRequest": {
                          "owner": author, "fileSizeBytes": size,
                          "uploadCaptions": False, "uploadThumbnail": False}}, timeout=30)
    r.raise_for_status()
    v = r.json()["value"]
    etags = []
    with media.open("rb") as f:
        for part in v["uploadInstructions"]:
            first, last = part["firstByte"], part["lastByte"]
            chunk = f.read(last - first + 1)
            up = requests.put(part["uploadUrl"], data=chunk, timeout=600)
            up.raise_for_status()
            etags.append(up.headers["ETag"])
    fin = requests.post(f"{API}/rest/videos?action=finalizeUpload",
                        headers=_headers(),
                        json={"finalizeUploadRequest": {
                            "video": v["video"], "uploadToken": "",
                            "uploadedPartIds": etags}}, timeout=30)
    fin.raise_for_status()
    return v["video"]


def publish(cfg, media, post):
    author = os.environ["LINKEDIN_AUTHOR_URN"]
    body = {
        "author": author,
        "commentary": cfg["text"],
        "visibility": "PUBLIC",
        "distribution": {"feedDistribution": "MAIN_FEED",
                         "targetEntities": [], "thirdPartyDistributionChannels": []},
        "lifecycleState": "PUBLISHED",
        "isReshareDisabledByAuthor": False,
    }
    if media:
        is_video = media.suffix.lower() in (".mp4", ".mov")
        urn = _upload_video(author, media) if is_video else _upload_image(author, media)
        body["content"] = {"media": {"id": urn,
                                     "title": post.get("title", "")[:100]}}
    r = requests.post(f"{API}/rest/posts", headers=_headers(), json=body, timeout=60)
    r.raise_for_status()
    post_urn = r.headers.get("x-restli-id", "")
    return f"https://www.linkedin.com/feed/update/{post_urn}/"
