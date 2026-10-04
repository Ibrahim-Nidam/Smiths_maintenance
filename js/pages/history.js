import { listMaintenanceEvents } from '../api/history.js';
import { pageHeader, emptyState, esc } from '../components/ui.js';

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
  parts_swapped: 'badge bg-purple-100 text-purple-800 border-purple-300',
  rma_tagged: 'badge-alert font-bold',
  rma_untagged: 'badge bg-green-100 text-green-800 border-green-300',
  machine_created: 'badge bg-blue-100 text-blue-800 border-blue-300',
};

export async function render(container, params, ctx) {
  // Extract initial search filter from URL query parameters (e.g. #/history?code=K289 or #/history?sn=SN-001)
  const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const initialQuery = urlParams.get('code') || urlParams.get('sn') || urlParams.get('q') || '';

  container.innerHTML = pageHeader('Maintenance History', 'Complete append-only audit trail and part lifecycle tracking across all machines and positions.') + `
    <div class="flex flex-wrap gap-4 mb-6 items-center justify-between">
      <div class="flex flex-wrap gap-3 items-center flex-1 max-w-xl">
        <input type="search" id="search-history" class="input flex-1" placeholder="Search by Machine, Part #, Serial #, Position, Tech, or Reason..." value="${esc(initialQuery)}">
      </div>
      <span id="event-count" class="text-xs text-gray-500 font-medium"></span>
    </div>

    <div id="history-container"><p class="text-gray-400 text-sm">Loading history events...</p></div>
  `;

  let allEvents = [];

  try {
    allEvents = await listMaintenanceEvents({ limit: 500 });
  } catch (err) {
    container.querySelector('#history-container').innerHTML =
      `<div class="p-4 bg-red-50 text-red-700 rounded-md border border-red-200">Failed to load history: ${esc(err.message)}</div>`;
    return;
  }

  function filterAndRender() {
    const query = container.querySelector('#search-history').value.trim().toLowerCase();

    const filtered = allEvents.filter(ev => {
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

    const countEl = container.querySelector('#event-count');
    if (countEl) countEl.textContent = `Showing ${filtered.length} of ${allEvents.length} events`;

    const listEl = container.querySelector('#history-container');

    if (!filtered.length) {
      listEl.innerHTML = emptyState(
        'No matching events found',
        allEvents.length ? 'Try broadening your search term.' : 'Maintenance events will appear here automatically.'
      );
      return;
    }

    listEl.innerHTML = `
      <div class="table-wrap">
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

              return `
                <tr>
                  <td class="text-xs text-gray-500 whitespace-nowrap">${dateStr}</td>
                  <td>
                    <span class="badge ${EVENT_BADGE_CLASSES[ev.event_type] || ''}">
                      ${esc(EVENT_LABELS[ev.event_type] || ev.event_type)}
                    </span>
                  </td>
                  <td>
                    ${machineCode !== '—'
                      ? `<a href="#/machines/${encodeURIComponent(machineCode)}" class="font-mono font-semibold text-accent hover:underline">${esc(machineCode)}</a>`
                      : '<span class="text-gray-400">—</span>'
                    }
                  </td>
                  <td>
                    <span class="font-semibold text-gray-900">${esc(partName)}</span>
                    ${module ? `<span class="text-xs text-gray-400 capitalize block">${module}</span>` : ''}
                  </td>
                  <td>
                    ${ev.position ? `<span class="mono font-medium text-gray-700">Pos ${ev.position}</span>` : '<span class="text-gray-400">—</span>'}
                  </td>
                  <td class="mono text-xs">
                    ${oldSn ? `<div class="text-red-700 font-semibold">- ${esc(oldSn)}</div>` : ''}
                    ${newSn ? `<div class="text-green-700 font-semibold">+ ${esc(newSn)}</div>` : ''}
                    ${!oldSn && !newSn ? '<span class="text-gray-400">—</span>' : ''}
                  </td>
                  <td class="text-sm font-medium">${esc(userName)}</td>
                  <td class="text-xs text-gray-600 max-w-xs">
                    ${ev.reason ? `<div class="font-medium text-gray-800">${esc(ev.reason)}</div>` : ''}
                    ${ev.notes ? `<div class="text-gray-500 italic mt-0.5">${esc(ev.notes)}</div>` : ''}
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

  const searchInput = container.querySelector('#search-history');
  if (searchInput) searchInput.addEventListener('input', filterAndRender);

  filterAndRender();
}
