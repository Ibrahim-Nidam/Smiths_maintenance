# Decisions

- Language: English everywhere, including role names.
- Roles: `admin`, `maintenance_manager`, `team_lead`, `technician`.
- Stock is shared company-wide (no team_id on stock tables).
- Part number identifies what a part is and never changes. Serial number identifies the physical unit. Serial is unique per part number: unique (part_number, serial_number).
- RMA is a simple tag on a physical unit (declared defective to the client), not a status workflow. Anyone who can access the unit can tag or untag it. Every change is written to history (`rma_tagged` / `rma_untagged`) with who and when. A tagged unit can still be repaired, returned to stock and reinstalled. Stored as `part_instances.rma_tagged`; there is no RMA status and no `rma_records` table. Reference numbers, dates or client steps can be added later if the client requires them.
- Unit status is only `available`, `installed` or `scrapped`. RMA is separate from status.
- Removing a unit during a replacement asks for its outcome: damaged (tagged RMA, returned to stock), working (returned to stock) or scrapped.
- An empty or RMA-tagged position only warns; it does not change the machine status.
- Events carry the machine's team (so team leads see everything on their machines); events without a machine (stock actions) carry the actor's team.
- Users never write data tables directly. Changes go through RPC functions that re-check role and team; reads are limited by RLS.
- No migration of data from the old CTX 9800 tracker.
- History and stock movements are append-only; corrections use a `correction` event.
