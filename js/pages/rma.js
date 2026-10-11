import { listRmaUnits } from '../api/rma.js';
import { setRmaTag } from '../api/parts.js';
import { pageHeader, emptyState, esc } from '../components/ui.js';
import { openModal } from '../components/modal.js';
import { copyButton } from '../components/input-enhancements.js';
import { toast } from '../components/toast.js';

export async function render(container, params, ctx) {
  container.innerHTML = pageHeader('RMA Defective Units', 'Units flagged as defective / declared for vendor return.') + `
    <div class="mb-4">
      <input type="search" id="search-rma" class="input w-64" placeholder="Filter by part or serial #...">
    </div>
    <div id="rma-container"><p class="text-gray-400 text-sm">Loading RMA tagged units...</p></div>
  `;

  async function loadAndRender() {
    const listEl = container.querySelector('#rma-container');
    try {
      const units = await listRmaUnits();

      if (!units.length) {
        listEl.innerHTML = emptyState('No RMA units tagged', 'Units marked as defective or RMA will appear here.');
        return;
      }

      listEl.innerHTML = `
        <div class="table-wrap">
          <table class="table" id="rma-table">
            <thead>
              <tr>
                <th>Tagged At</th>
                <th>Part Number</th>
                <th>Serial Number</th>
                <th>Location / Machine</th>
                <th>Status</th>
                <th>Notes</th>
                <th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${units.map(u => `
                <tr>
                  <td class="text-xs text-gray-500">${u.rma_tagged_at ? new Date(u.rma_tagged_at).toLocaleString() : '—'}</td>
                  <td class="mono font-semibold">${esc(u.part_number)}${copyButton(u.part_number, 'Copy part number')}</td>
                  <td class="mono font-semibold text-red-700">${esc(u.serial_number)}${copyButton(u.serial_number, 'Copy serial number')}</td>
                  <td>
                    ${u.location === 'machine' && u.machine_code
                      ? `<a href="#/machines/${encodeURIComponent(u.machine_code)}" class="font-mono text-accent hover:underline">${esc(u.machine_code)} (Pos ${u.position})</a>`
                      : `<span class="capitalize text-sm font-medium text-gray-700">${esc(u.location)}</span>`
                    }
                  </td>
                  <td><span class="badge badge-alert font-bold">RMA Tagged</span></td>
                  <td class="text-sm text-gray-500">${esc(u.notes || '—')}</td>
                  <td class="text-right">
                    <button class="btn btn-ghost btn-sm text-green-700 untag-btn" data-id="${u.id}" data-serial="${esc(u.serial_number)}">Untag RMA</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      listEl.querySelectorAll('.untag-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          handleUntag(btn.dataset.id, btn.dataset.serial);
        });
      });

      const searchInput = container.querySelector('#search-rma');
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase();
        listEl.querySelectorAll('#rma-table tbody tr').forEach(tr => {
          const text = tr.textContent.toLowerCase();
          tr.style.display = text.includes(q) ? '' : 'none';
        });
      });

    } catch (err) {
      listEl.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded-md border border-red-200">Failed to load RMA list: ${esc(err.message)}</div>`;
    }
  }

  function handleUntag(instanceId, serial) {
    openModal({
      title: `Untag RMA — Unit ${serial}`,
      contentHtml: `
        <p>Are you sure you want to remove the RMA tag from unit <strong>${esc(serial)}</strong>?</p>
        <div class="field mt-4">
          <label class="label" for="untag-note">Reason / Note</label>
          <input class="input" id="untag-note" name="note" placeholder="e.g. Unit repaired or false alarm">
        </div>
        <p class="error-text"></p>
      `,
      submitText: 'Remove RMA Tag',
      onSubmit: async (form, close) => {
        const note = form.note.value;
        await setRmaTag({ instanceId, tagged: false, note });
        toast(`RMA tag removed from unit ${serial}.`);
        close();
        await loadAndRender();
      }
    });
  }

  await loadAndRender();
}
