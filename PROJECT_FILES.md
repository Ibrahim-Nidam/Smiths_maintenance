# Tracked files

Version: v1.1. Updated files are sent individually with their full path; replace them in place.

| Path | Purpose | Status |
|---|---|---|
| `.gitignore` | Git ignore rules | ready |
| `README.md` | Setup and run instructions | ready |
| `app.html` | App shell (sidebar + view) | ready |
| `css/app.css` | Custom styles & design system | ready |
| `docs/DECISIONS.md` | Agreed decisions | ready |
| `index.html` | Login page | ready |
| `js/api/history.js` | History API module | ready |
| `js/api/machines.js` | Machines & Templates API module | ready |
| `js/api/parts.js` | Parts & Slots RPC API module | ready |
| `js/api/rma.js` | RMA API module | ready |
| `js/api/stock.js` | Stock & Inventory API module | ready |
| `js/api/teams.js` | Teams API module | ready |
| `js/api/users.js` | Users & Profiles API module | ready |
| `js/app.js` | App bootstrap, role-based nav | ready |
| `js/auth.js` | Sign in/out, profile, role guard | ready |
| `js/components/modal.js` | Reusable modal component | ready |
| `js/components/toast.js` | Toast message component | ready |
| `js/components/ui.js` | UI component helpers | ready |
| `js/config.js` | Supabase URL and anon key | ready |
| `js/pages/dashboard.js` | Dashboard page | ready |
| `js/pages/history.js` | Global & Part Lifecycle History page | ready |
| `js/pages/machine-detail.js` | Machine Detail & Slot Grid page | ready |
| `js/pages/machines.js` | Machines List page | ready |
| `js/pages/rma.js` | RMA Defective Units page | ready |
| `js/pages/settings.js` | Settings & Templates page | ready |
| `js/pages/stock.js` | Stock Inventory page | ready |
| `js/pages/teams.js` | Teams Management page | ready |
| `js/pages/users.js` | Users & Profiles page | ready |
| `js/router.js` | Hash router | ready |
| `js/supabase.js` | Supabase client | ready |
| `js/tailwind-config.js` | Tailwind CSS configuration | ready |
| `sql/001_schema.sql` | Enums, tables, constraints, triggers | ready |
| `sql/002_rls.sql` | RLS policies | ready |
| `sql/003_functions.sql` | RPC functions | ready |
| `sql/004_seed.sql` | Machine types and teams seed | ready |
| `sql/005_auth_trigger.sql` | Profile auto-creation trigger on signup | ready |
| `sql/006_updates.sql` | Installed unit details RPC function | ready |
