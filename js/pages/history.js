import { listMaintenanceEvents } from '../api/history.js';
import { pageHeader, emptyState, esc } from '../components/ui.js';
import { copyButton } from '../components/input-enhancements.js';

const EVENT_LABELS = {
  part_installed: 'Part Installed',
  part_removed: 'Part Removed',
  part_replaced: 'Part Replaced',
  parts_swapped: 'Parts Swapped',
  part_added_to_machine: 'Part Added',
  rma_tagged: 'RMA Tagged',
  rma_untagged: 'RMA Untagged',
  machine_created: 'Machine Created',
  machine_updated: 'Machine Updated',
  stock_adjusted: 'Stock Adjusted',
  correction: 'Correction',
};

const EVENT_BADGE_CLASSES = {
  part_installed: 'badge-accent',
  part_removed: 'badge-alert',
  part_replaced: 'badge-solid',
  parts_swapped: 'badge border-purple-600/30 bg-purple-100 text-purple-900 dark:bg-purple-950/60 dark:text-purple-300',
  rma_tagged: 'badge-alert font-bold',
  rma_untagged: 'badge border-emerald-600/30 bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300',
  machine_created: 'badge border-blue-600/30 bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-300',
  machine_updated: 'badge border-amber-600/30 bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300',
};

export async function render(container, params, ctx) {
  const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const initialQuery = urlParams.get('code') || urlParams.get('sn') || urlParams.get('q') || '';
  let activeCategory = 'all';

  container.innerHTML = pageHeader('Maintenance History', 'Complete append-only audit trail and part lifecycle tracking across all machines and positions.') + `
    <div class="space-y-4 mb-6 history-filters">
      <div class="flex flex-wrap gap-4 items-center justify-between">
        <div class="flex flex-wrap gap-3 items-center flex-1 max-w-xl">
          <input type="search" id="search-history" class="input flex-1 font-medium" placeholder="Search by Machine, Part #, Serial #, Position, Tech, or Reason..." value="${esc(initialQuery)}">
        </div>
        <span id="event-count" class="text-xs text-gray-600 dark:text-gray-400 font-bold"></span>
      </div>

      <!-- Pre-defined Quick Filter Pills -->
      <div id="history-filter-pills" class="flex flex-wrap gap-2 items-center pt-1 border-t border-gray-200 dark:border-gray-800">
        <span class="text-xs font-bold text-gray-500 uppercase tracking-wider mr-1">Filter:</span>
        <button class="filter-pill btn btn-sm btn-primary" data-category="all">All Events</button>
        <button class="filter-pill btn btn-sm btn-secondary" data-category="installed">Installed</button>
        <button class="filter-pill btn btn-sm btn-secondary" data-category="replaced">Replaced</button>
        <button class="filter-pill btn btn-sm btn-secondary" data-category="swapped">Swapped</button>
        <button class="filter-pill btn btn-sm btn-secondary" data-category="removed">Removed</button>
        <button class="filter-pill btn btn-sm btn-secondary" data-category="rma">RMA Tags</button>
        <button class="filter-pill btn btn-sm btn-secondary" data-category="system">Machine/Stock</button>
      </div>
    </div>

    <div id="history-container"><p class="text-gray-500 dark:text-gray-400 text-sm font-medium">Loading history events...</p></div>
  `;

  let allEvents = [];

  try {
    allEvents = await listMaintenanceEvents({ limit: 500 });
  } catch (err) {
    container.querySelector('#history-container').innerHTML =
      `<div class="p-4 bg-red-50 text-red-900 rounded-md border border-red-200 font-semibold">Failed to load history: ${esc(err.message)}</div>`;
    return;
  }

  function filterAndRender() {
    const query = container.querySelector('#search-history').value.trim().toLowerCase();

    const filtered = allEvents.filter(ev => {
      // 1. Apply category filter
      if (activeCategory === 'installed' && !['part_installed', 'part_added_to_machine'].includes(ev.event_type)) return false;
      if (activeCategory === 'replaced' && ev.event_type !== 'part_replaced') return false;
      if (activeCategory === 'swapped' && ev.event_type !== 'parts_swapped') return false;
      if (activeCategory === 'removed' && ev.event_type !== 'part_removed') return false;
      if (activeCategory === 'rma' && !['rma_tagged', 'rma_untagged'].includes(ev.event_type)) return false;
      if (activeCategory === 'system' && !['stock_adjusted', 'machine_created', 'machine_updated', 'correction'].includes(ev.event_type)) return false;

      // 2. Apply search text query filter
      if (!query) return true;
      const machineCode = ev.machines ? ev.machines.code.toLowerCase() : '';
      const userName = ev.profiles ? ev.profiles.full_name.toLowerCase() : '';
      const partName = ev.machine_parts ? ev.machine_parts.name.toLowerCase() : '';
      const partNumber = (ev.part_number || '').toLowerCase();
      const posStr = ev.position ? `pos ${ev.position}` : '';
      const oldSn = ev.old_instance ? ev.old_instance.serial_number.toLowerCase() : '';
      const newSn = ev.new_instance ? ev.new_instance.serial_number.toLowerCase() : '';
      const reason = (ev.reason || '').toLowerCase();
      const notes = (ev.notes || '').toLowerCase();
      const eventType = (EVENT_LABELS[ev.event_type] || ev.event_type).toLowerCase();

      return machineCode.includes(query) ||
             userName.includes(query) ||
             partName.includes(query) ||
             partNumber.includes(query) ||
             posStr.includes(query) ||
             oldSn.includes(query) ||
             newSn.includes(query) ||
             reason.includes(query) ||
             notes.includes(query) ||
             eventType.includes(query);
    });

    // Update Category Pills UI
    container.querySelectorAll('.filter-pill').forEach(btn => {
      const cat = btn.dataset.category;
      if (cat === activeCategory) {
        btn.className = 'filter-pill btn btn-sm btn-primary font-bold';
      } else {
        btn.className = 'filter-pill btn btn-sm btn-secondary font-medium';
      }
    });

    const countEl = container.querySelector('#event-count');
    if (countEl) countEl.textContent = `Showing ${filtered.length} of ${allEvents.length} events`;

    const listEl = container.querySelector('#history-container');

    if (!filtered.length) {
      listEl.innerHTML = emptyState(
        'No matching events found',
        allEvents.length ? 'Try changing your category filter or search term.' : 'Maintenance events will appear here automatically.'
      );
      return;
    }

    listEl.innerHTML = `
      <div class="table-wrap border border-gray-200 dark:border-gray-800">
        <table class="table">
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Event Type</th>
              <th>Machine</th>
              <th>Module & Part</th>
              <th>Position</th>
              <th>Serial(s) Involved</th>
              <th>Technician</th>
              <th>Reason / Notes</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(ev => {
              const machineCode = ev.machines ? ev.machines.code : '—';
              const userName = ev.profiles ? ev.profiles.full_name : 'System';
              const dateStr = new Date(ev.occurred_at).toLocaleString();
              const oldSn = ev.old_instance ? ev.old_instance.serial_number : null;
              const newSn = ev.new_instance ? ev.new_instance.serial_number : null;
              const partName = ev.machine_parts ? ev.machine_parts.name : (ev.part_number || '—');
              const module = ev.machine_parts ? ev.machine_parts.module : '';
              const badgeClass = EVENT_BADGE_CLASSES[ev.event_type] || 'badge-solid';

              return `
                <tr>
                  <td class="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap font-mono font-medium">${dateStr}</td>
                  <td>
                    <span class="badge ${badgeClass} text-xs font-semibold">
                      ${esc(EVENT_LABELS[ev.event_type] || ev.event_type)}
                    </span>
                  </td>
                  <td>
                    ${machineCode !== '—'
                      ? `<a href="#/machines/${encodeURIComponent(machineCode)}" class="font-mono font-extrabold text-accent hover:underline">${esc(machineCode)}</a>`
                      : '<span class="text-gray-400">—</span>'
                    }
                  </td>
                  <td>
                    <span class="font-bold text-gray-900 dark:text-gray-100">${esc(partName)}</span>
                    ${ev.part_number ? copyButton(ev.part_number, 'Copy part number') : ''}
                    ${module ? `<span class="text-xs text-gray-500 dark:text-gray-400 capitalize block font-medium">${module}</span>` : ''}
                  </td>
                  <td>
                    ${ev.position ? `<span class="mono font-semibold text-gray-800 dark:text-gray-200">Pos ${ev.position}</span>` : '<span class="text-gray-400">—</span>'}
                  </td>
                  <td class="mono text-xs">
                    ${oldSn ? `<div class="text-red-700 dark:text-red-400 font-bold">- ${esc(oldSn)}${copyButton(oldSn, 'Copy serial number')}</div>` : ''}
                    ${newSn ? `<div class="text-emerald-700 dark:text-emerald-400 font-bold">+ ${esc(newSn)}${copyButton(newSn, 'Copy serial number')}</div>` : ''}
                    ${!oldSn && !newSn ? '<span class="text-gray-400">—</span>' : ''}
                  </td>
                  <td class="text-sm font-bold text-gray-900 dark:text-gray-100">${esc(userName)}</td>
                  <td class="text-xs text-gray-700 dark:text-gray-300 max-w-xs font-medium">
                    ${ev.reason ? `<div class="font-bold text-gray-900 dark:text-gray-100">${esc(ev.reason)}</div>` : ''}
                    ${ev.notes ? `<div class="text-gray-600 dark:text-gray-400 italic mt-0.5">"${esc(ev.notes)}"</div>` : ''}
                    ${!ev.reason && !ev.notes ? '<span class="text-gray-400">—</span>' : ''}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Filter Pill Button Click Handler
  container.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.category;
      filterAndRender();
    });
  });

  const searchInput = container.querySelector('#search-history');
  if (searchInput) searchInput.addEventListener('input', filterAndRender);

  filterAndRender();
}
