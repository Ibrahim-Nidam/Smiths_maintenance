# Maintenance Management App

HTML + JavaScript (ES modules), native CSS design system (`css/app.css`), Supabase, GitHub Pages.
See `PROJECT_FILES.md` for the tracked file list and `docs/DECISIONS.md` for agreed decisions.

## Run locally
ES modules need a web server (opening the file directly will not work):

    python -m http.server 8000

Then open http://localhost:8000

## Setup order
1. Create the Supabase project (guided walkthrough, Phase 1).
2. Run the base schema files `sql/001_schema.sql`, `sql/002_rls.sql`, `sql/003_functions.sql`, and `sql/004_seed.sql` in the Supabase SQL editor, in order.
3. Run the follow-up migrations `sql/005_auth_trigger.sql`, `sql/005_rma_as_tag.sql`, `sql/006_updates.sql`, `sql/007_stock_management.sql`, and `sql/008_multi_template_parts.sql`, in that order. Do not run these follow-up migrations by themselves; they expect the base schema and authorization functions from the earlier files.
4. Put your project URL and anon key in `js/config.js`.
5. Push to GitHub and enable GitHub Pages.
