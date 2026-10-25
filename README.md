# Maintenance Management App

HTML + JavaScript (ES modules), native CSS design system (`css/app.css`), Supabase, GitHub Pages.
See `docs/DECISIONS.md` for agreed decisions and `docs/DESIGN.md` for the design system.

## Run locally
ES modules need a web server (opening the file directly will not work):

    python -m http.server 8000

Then open http://localhost:8000

## Setup order
1. Create the Supabase project (guided walkthrough, Phase 1).
2. Run the base schema files `sql/001_schema.sql`, `sql/002_rls.sql`, `sql/003_functions.sql`, and `sql/004_seed.sql` in the Supabase SQL editor, in order.
3. Run the follow-up migrations `sql/005_auth_trigger.sql`, `sql/005_rma_as_tag.sql`, `sql/006_updates.sql`, `sql/007_stock_management.sql`, `sql/008_multi_template_parts.sql`, `sql/009_machine_part_editing.sql`, `sql/010_serialized_storage_location.sql`, `sql/011_parts_catalog.sql` and `sql/012_login_and_accounts.sql`, in that order. Do not run these follow-up migrations by themselves; they expect the base schema and authorization functions from the earlier files. `011_parts_catalog.sql` imports the parts list from `docs/Unique_Parts_PN_list.xlsx` into the parts catalogue shown on the Parts page; `012_login_and_accounts.sql` enables signing in with a full name and managing account email addresses.
4. Put your project URL and anon key in `js/config.js`.
5. Push to GitHub and enable GitHub Pages.

## Signing in
The sign-in form accepts **either** the email address **or** the full name of the account
(`index.html` + `js/auth.js`). Full names are resolved by the `resolve_login_email` function,
added by `sql/012_login_and_accounts.sql`; until that file is run, only email addresses work.

## Staff accounts
- New accounts are created from **Staff > Users**. The sign-in email is generated as
  `first.lastname@traser.ma` from the full name and can be edited before the account is created.
- Admins and maintenance managers can change an account's email from the edit dialog; users can
  change their own name, email and password from the profile menu (top right).
- The **Teams** tab has a *Show members* button on every row to list the staff of that team.

## Stock
- **Add item / unit** starts from the part: the select follows the stock tab you are in and
  completes the machine type, serialization, part number and item name from the catalogue.
- There is no unit input (everything is `pcs`) and the minimum warning threshold is only shown
  for consumables.
- Serialized entries ask for a **quantity** and render one serial number field per unit. All of
  them are checked (required and unique) before anything is written; if some serials fail, the
  toast lists what was added and what was not.
- Every serialized unit row has **Tag RMA** / **Untag RMA** next to *Mark DOA*. Tagging puts the
  unit on the **RMA Defective Units** page (`#/rma`) and writes a history entry.
- Every serial number field has a barcode button (`js/components/scanner.js`):
  on mobile phones it opens the phone's native camera directly for sharp autofocus
  barcode capture; on laptops and desktops it opens the live webcam scanner with multi-camera
  switching and photo upload fallback. Works across all modern browsers (Firefox, Chrome,
  Safari, Edge) using native `BarcodeDetector` with self-contained client-side `ZXing` fallback.
- Modals are bottom sheets below 640px: full-height with safe-area padding, scrollable body and
  buttons that stretch across the width.

## Parts catalogue
The Parts page, the part-number autocomplete and the stock form read the `parts_catalog` table.
Besides the part number and the designation, each entry can record the machine types it fits
(several), its module and whether its units are serialized; the stock form uses that to complete
itself. To regenerate the seed after the Excel list changes:

    python tools/build_parts_catalog.py

Then re-run `sql/011_parts_catalog.sql` in the Supabase SQL editor (it only inserts part
numbers that are not in the table yet, and it never overwrites the classification you entered).
