"""Dispatcher: find due posts in queue/queue.json and publish them.

Run by GitHub Actions on a cron, or manually:  python engine/publish.py
Platform credentials come from environment variables (GitHub Secrets).
"""
import json
import os
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QUEUE = ROOT / "queue" / "queue.json"
sys.path.insert(0, str(Path(__file__).resolve().parent))

from platforms import x, linkedin, meta, youtube, tiktok

PUBLISHERS = {
    "x": x.publish,
    "linkedin": linkedin.publish,
    "facebook": meta.publish_facebook,
    "instagram": meta.publish_instagram,
    "youtube": youtube.publish,
    "tiktok": tiktok.publish,
}


MAX_ATTEMPTS = 3


def due(post):
    if post.get("status") not in ("scheduled", "failed") or not post.get("publish_at"):
        return False
    if post.get("attempts", 0) >= MAX_ATTEMPTS:
        return False
    when = datetime.fromisoformat(post["publish_at"].replace("Z", "+00:00"))
    return when <= datetime.now(timezone.utc)


def load_worker_tokens():
    """If a token-broker Worker is configured, fetch fresh access tokens and
    map them onto the env vars the platform modules read. Falls back to
    plain GitHub Secrets when WORKER_URL is unset."""
    worker = os.environ.get("WORKER_URL")
    if not worker:
        return
    import requests
    r = requests.get(worker.rstrip("/") + "/api/tokens", headers={
        "Authorization": "Bearer " + os.environ["ENGINE_KEY"]}, timeout=30)
    r.raise_for_status()
    toks = r.json()
    m = {}
    if "linkedin" in toks and "error" not in toks["linkedin"]:
        m["LINKEDIN_ACCESS_TOKEN"] = toks["linkedin"]["access"]
        m["LINKEDIN_AUTHOR_URN"] = toks["linkedin"]["author_urn"]
    if "meta" in toks and "error" not in toks["meta"]:
        m["META_PAGE_TOKEN"] = toks["meta"]["access"]
        m["META_PAGE_ID"] = toks["meta"]["page_id"]
        if toks["meta"].get("ig_user_id"):
            m["IG_USER_ID"] = toks["meta"]["ig_user_id"]
    if "youtube" in toks and "error" not in toks["youtube"]:
        m["YT_ACCESS_TOKEN"] = toks["youtube"]["access"]
    if "tiktok" in toks and "error" not in toks["tiktok"]:
        m["TIKTOK_ACCESS_TOKEN"] = toks["tiktok"]["access"]
    if "x" in toks and "error" not in toks["x"]:
        m["X_OAUTH2_TOKEN"] = toks["x"]["access"]
    os.environ.update(m)
    for p, t in toks.items():
        print(f"[tokens] {p}: {'ERROR ' + t['error'] if 'error' in t else 'ok'}")


def main():
    load_worker_tokens()
    data = json.loads(QUEUE.read_text(encoding="utf-8"))
    changed = False
    for post in data["posts"]:
        if not due(post):
            continue
        media = ROOT / "queue" / post["media"] if post.get("media") else None
        results = post.setdefault("results", {})
        all_ok = True
        for name, cfg in post["platforms"].items():
            if not cfg.get("enabled") or results.get(name, {}).get("ok"):
                continue
            try:
                url = PUBLISHERS[name](cfg, media, post)
                results[name] = {"ok": True, "url": url,
                                 "at": datetime.now(timezone.utc).isoformat()}
                print(f"[ok] {post['id']} -> {name}: {url}")
            except Exception as e:
                traceback.print_exc()
                results[name] = {"ok": False, "error": str(e)[:500],
                                 "at": datetime.now(timezone.utc).isoformat()}
                all_ok = False
                print(f"[FAIL] {post['id']} -> {name}: {e}", file=sys.stderr)
        if all_ok:
            post["status"] = "published"
        else:
            post["attempts"] = post.get("attempts", 0) + 1
            post["status"] = "failed"
            if post["attempts"] < MAX_ATTEMPTS:
                print(f"[retry] {post['id']} attempt {post['attempts']}/{MAX_ATTEMPTS}, "
                      "will retry next run")
        changed = True

    if changed:
        QUEUE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n",
                         encoding="utf-8")
        print("queue updated")
    else:
        print("nothing due")


if __name__ == "__main__":
    main()
