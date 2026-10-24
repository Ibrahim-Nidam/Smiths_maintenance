import { listMaintenanceEvents } from '../api/history.js';
import { pageHeader, emptyState, loadingState, alertText, esc } from '../components/ui.js';
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
  part_installed: 'badge-success',
  part_removed: 'badge-muted',
  part_replaced: 'badge-accent',
  parts_swapped: 'badge-warning',
  part_added_to_machine: 'badge-success',
  rma_tagged: 'badge-danger',
  rma_untagged: 'badge-success',
  machine_created: 'badge-accent',
  machine_updated: 'badge-muted',
  stock_adjusted: 'badge-muted',
  correction: 'badge-warning',
};

const CATEGORIES = [
  { key: 'all', label: 'All events' },
  { key: 'installed', label: 'Installed' },
  { key: 'replaced', label: 'Replaced' },
  { key: 'swapped', label: 'Swapped' },
  { key: 'removed', label: 'Removed' },
  { key: 'rma', label: 'RMA tags' },
  { key: 'system', label: 'Machine / stock' },
];

export async function render(container, params, ctx) {
  const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const initialQuery = urlParams.get('code') || urlParams.get('sn') || urlParams.get('q') || '';
  let activeCategory = 'all';

  container.innerHTML = pageHeader('Maintenance history', 'Complete append-only audit trail and part lifecycle tracking across all machines and positions.') + `
    <div>
      <div class="filter-bar-inline">
        <div class="search-field">
          <input type="search" id="search-history" class="input" placeholder="Search by machine, part number, serial, position, technician or reason" value="${esc(initialQuery)}">
        </div>
        <span id="event-count" class="small muted"></span>
      </div>

      <div id="history-filter-pills" class="filter-row">
        <span class="filter-label">Filter</span>
        ${CATEGORIES.map(c => `
          <button class="chip filter-pill" data-category="${c.key}" type="button">${c.label}</button>
        `).join('')}
      </div>
    </div>

    <div id="history-container">${loadingState('Loading history events...')}</div>
  `;

  let allEvents = [];

  try {
    allEvents = await listMaintenanceEvents({ limit: 500 });
  } catch (err) {
    container.querySelector('#history-container').innerHTML = alertText(`Failed to load history: ${esc(err.message)}`);
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

    // Update category pills UI
    container.querySelectorAll('.filter-pill').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.category === activeCategory);
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
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Date &amp; time</th>
              <th>Event type</th>
              <th>Machine</th>
              <th>Module &amp; part</th>
              <th>Position</th>
              <th>Serial(s) involved</th>
              <th>Technician</th>
              <th>Reason / notes</th>
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
              const badgeClass = EVENT_BADGE_CLASSES[ev.event_type] || 'badge';

              return `
                <tr>
                  <td class="tiny mono muted nowrap">${dateStr}</td>
                  <td><span class="badge ${badgeClass}">${esc(EVENT_LABELS[ev.event_type] || ev.event_type)}</span></td>
                  <td>
                    ${machineCode !== '—'
                      ? `<a href="#/machines/${encodeURIComponent(machineCode)}" class="mono strong">${esc(machineCode)}</a>`
                      : '<span class="muted">&mdash;</span>'
                    }
                  </td>
                  <td>
                    <span class="strong">${esc(partName)}</span>${ev.part_number ? copyButton(ev.part_number, 'Copy part number') : ''}
                    ${module ? `<div class="tiny muted capitalize">${module}</div>` : ''}
                  </td>
                  <td>${ev.position ? `<span class="mono secondary">Pos ${ev.position}</span>` : '<span class="muted">&mdash;</span>'}</td>
                  <td class="mono tiny break-all">
                    ${oldSn ? `<div class="text-danger strong">- ${esc(oldSn)}${copyButton(oldSn, 'Copy serial number')}</div>` : ''}
                    ${newSn ? `<div class="text-success strong">+ ${esc(newSn)}${copyButton(newSn, 'Copy serial number')}</div>` : ''}
                    ${!oldSn && !newSn ? '<span class="muted">&mdash;</span>' : ''}
                  </td>
                  <td class="small strong">${esc(userName)}</td>
                  <td class="tiny secondary">
                    ${ev.reason ? `<div class="strong">${esc(ev.reason)}</div>` : ''}
                    ${ev.notes ? `<div class="muted italic">"${esc(ev.notes)}"</div>` : ''}
                    ${!ev.reason && !ev.notes ? '<span class="muted">&mdash;</span>' : ''}
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
