# Fresu Content Engine

Self-owned social publishing system. Plan → adapt → auto-publish to
YouTube, Instagram, Facebook, LinkedIn, TikTok and X — for €0/month.

## How it works

```
you (or Claude) add a post ──► queue/queue.json + queue/media/
                                      │
GitHub Actions (every 15 min) ──► engine/publish.py
                                      │  finds posts whose publish_at is due
                                      ▼
                        posts to each platform's API
                                      │
                                      ▼
                        marks post "published" + commits result URLs
```

- **Planner website** (GitHub Pages): `index.html` — calendar + queue view.
- **Queue**: `queue/queue.json` — one entry per post, per-platform text variants.
- **Engine**: `engine/` — Python, one module per platform.
- **Scheduler**: `.github/workflows/publish.yml` — cron, runs with repo secrets.

## Status lifecycle

`draft` → `scheduled` (has publish_at) → `published` / `failed` (per platform)

## Setup

One-time platform authorization is required (free developer apps + tokens
stored as GitHub Actions secrets). Follow **docs/SETUP.md**.

## Notes

- This repo is public (required for free GitHub Pages): scheduled content
  and media are visible before they publish. Keep surprises out of the queue.
- Large videos: GitHub caps files at 100 MB. Keep queue media under that;
  bigger YouTube uploads can be done directly from the PC with the same engine.
