# Maintenance Management App

HTML + JavaScript (ES modules), Tailwind (CDN for now), Supabase, GitHub Pages.
See `PROJECT_FILES.md` for the tracked file list and `docs/DECISIONS.md` for agreed decisions.

## Run locally
ES modules need a web server (opening the file directly will not work):

    python -m http.server 8000

Then open http://localhost:8000

## Setup order
1. Create the Supabase project (guided walkthrough, Phase 1).
2. Run `sql/001_schema.sql` to `sql/004_seed.sql` in the Supabase SQL editor, in order.
3. Put your project URL and anon key in `js/config.js`.
4. Push to GitHub and enable GitHub Pages.
