# Read this first — public Word Builder repo

This repository is **PUBLIC and LIVE**. It is a deployment repo, not a context library.

Read `STYLE_GUIDE.md` first — the portable build principles for every teaching
resource across these repos.

Before changing teaching content, read the private `liaminhawai-cmd/ELC` repository's `AGENTS.md`, `ROADMAP.md`, and Word Builder boundary note.

## Hard rules

- No student or staff names, emails, IDs, assessment records or other personal information.
- Every ELC translation set must include reviewed Taiwan Traditional Chinese (`zh-Hant`, locale `zh-TW`) as its own value. Use Taiwan vocabulary and terminology, not character conversion alone. Simplified Chinese (`zh-Hans`, locale `zh-CN`) must use Mainland China terminology and is not a fallback for Taiwan Traditional Chinese.
- No accounts, analytics, trackers or cloud progress sync in the public build.
- Student progress stays in browser `localStorage` only.
- No raw Word/Excel/PDF source packs, study designs, textbook material, planning documents or build-context archives.
- Publish only runtime files and reviewed/generated student-facing data.
- Do not put build pipelines, source-document copies or translation working archives here; keep those in private `ELC`.
- Check privacy and copyright before every public push.

## Runtime shape

Expected public contents are the app shell (`index.html`, CSS/JS, service worker/manifest/icons), generated `data/vocab.json`, and short public maintenance/privacy documentation.

If a new feature needs identifiable students, a teacher dashboard or a backend, stop and get an explicit governance decision before implementing it.
