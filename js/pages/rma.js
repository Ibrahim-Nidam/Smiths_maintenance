import { listRmaUnits } from '../api/rma.js';
import { setRmaTag } from '../api/parts.js';
import { pageHeader, emptyState, loadingState, alertText, esc } from '../components/ui.js';
import { openModal } from '../components/modal.js';
import { copyButton } from '../components/input-enhancements.js';
import { toast } from '../components/toast.js';

export async function render(container, params, ctx) {
  container.innerHTML = pageHeader('RMA Defective Units', 'Units flagged as defective or declared for vendor return.') + `
    <div class="filter-row">
      <div class="search-field">
        <input type="search" id="search-rma" class="input" placeholder="Filter by part number or serial number">
      </div>
    </div>
    <div id="rma-container">${loadingState('Loading RMA tagged units...')}</div>
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
                <th>Tagged at</th>
                <th>Part number</th>
                <th>Serial number</th>
                <th>Location / machine</th>
                <th>Status</th>
                <th>Notes</th>
                <th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${units.map(u => `
                <tr>
                  <td class="small muted nowrap">${u.rma_tagged_at ? new Date(u.rma_tagged_at).toLocaleString() : '&mdash;'}</td>
                  <td class="mono strong">${esc(u.part_number)}${copyButton(u.part_number, 'Copy part number')}</td>
                  <td class="mono strong text-danger">${esc(u.serial_number)}${copyButton(u.serial_number, 'Copy serial number')}</td>
                  <td>
                    ${u.location === 'machine' && u.machine_code
                      ? `<a href="#/machines/${encodeURIComponent(u.machine_code)}" class="mono">${esc(u.machine_code)}</a> <span class="muted small">(Pos ${u.position})</span>`
                      : `<span class="capitalize small secondary">${esc(u.location)}</span>`
                    }
                  </td>
                  <td><span class="badge badge-danger"><span class="dot"></span>RMA tagged</span></td>
                  <td class="small muted">${u.notes ? esc(u.notes) : '&mdash;'}</td>
                  <td class="text-right">
                    <button class="btn btn-ghost btn-sm untag-btn" data-id="${u.id}" data-serial="${esc(u.serial_number)}">Untag RMA</button>
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
      listEl.innerHTML = alertText(`Failed to load RMA list: ${esc(err.message)}`);
    }
  }

  function handleUntag(instanceId, serial) {
    openModal({
      title: `Untag RMA &mdash; Unit ${serial}`,
      contentHtml: `
        <p>Are you sure you want to remove the RMA tag from unit <strong>${esc(serial)}</strong>?</p>
        <div class="field mt-4">
          <label class="label" for="untag-note">Reason / note</label>
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
