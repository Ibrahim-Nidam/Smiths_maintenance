import {
  listStockItems,
  listSerializedUnits,
  createStockItem,
  updateStockItem,
  deleteStockItem,
  adjustStock,
  addSerializedUnitToStock,
  setPartDoa,
  deleteSerializedUnit,
  listStockMovements,
} from '../api/stock.js';
import { updateSlotInstance } from '../api/parts.js';
import { listMachineTypes, listTypeTemplates } from '../api/machines.js';
import { pageHeader, emptyState, loadingState, alertText, esc } from '../components/ui.js';
import { openModal } from '../components/modal.js';
import { copyButton } from '../components/input-enhancements.js';
import { toast } from '../components/toast.js';
import { ROLES } from '../auth.js';

export async function render(container, params, ctx) {
  const isGlobal = [ROLES.ADMIN, ROLES.MANAGER].includes(ctx.profile.role);

  const actions = isGlobal
    ? `<button id="btn-add-stock" class="btn btn-primary btn-sm">Add item / unit</button>`
    : '';

  const TABS = [
    { key: 'serialized', label: 'Serialized units' },
    { key: 'non_serialized', label: 'Non-serialized parts' },
    { key: 'consumable', label: 'Consumables' },
    { key: 'movements', label: 'Stock movements' },
  ];

  container.innerHTML = pageHeader('Stock & inventory', 'Track company-wide serialized units, parts stock and consumables.', actions) + `
    <div class="tabs" role="tablist">
      ${TABS.map((t, i) => `
        <button class="tab-btn" type="button" role="tab" data-tab="${t.key}" aria-selected="${i === 0}">${t.label}</button>
      `).join('')}
    </div>

    <div id="tab-content">${loadingState('Loading stock data...')}</div>
  `;

  let activeTab = 'serialized';

  async function renderTab() {
    const contentEl = container.querySelector('#tab-content');

    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.setAttribute('aria-selected', String(btn.dataset.tab === activeTab));
    });

    contentEl.innerHTML = loadingState('Loading...');

    try {
      if (activeTab === 'serialized') {
        const units = await listSerializedUnits();
        if (!units.length) {
          contentEl.innerHTML = emptyState('No serialized units in system', 'Add serialized units to stock or install them in machines.');
          return;
        }

        const groupedUnits = Object.values(units.reduce((groups, unit) => {
          const key = unit.part_number || 'Uncategorized';
          if (!groups[key]) groups[key] = [];
          groups[key].push(unit);
          return groups;
        }, {}));

        contentEl.innerHTML = `
          <div class="filter-row">
            <div class="search-field">
              <input type="search" id="search-unit" class="input" placeholder="Filter by part number or serial number">
            </div>
          </div>
          <div class="table-wrap">
            <table class="table" id="units-table">
              <thead>
                <tr>
                  <th>Part number</th>
                  <th>Part name</th>
                  <th>Units</th>
                  <th>Installed</th>
                  <th>DOA</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${groupedUnits.map((group, index) => {
                  const partNumber = group[0].part_number || 'Uncategorized';
                  const installed = group.filter(u => u.status === 'installed').length;
                  const doa = group.filter(u => u.doa).length;
                  return `
                    <tr class="stock-group-row" data-group="${index}">
                      <td class="mono">${esc(partNumber)}${partNumber !== 'Uncategorized' ? copyButton(partNumber, 'Copy part number') : ''}</td>
                      <td class="secondary">${esc(group[0].part_name || '—')}</td>
                      <td>${group.length}</td>
                      <td>${installed}</td>
                      <td>${doa ? `<span class="badge badge-danger">${doa} DOA</span>` : '<span class="muted">&mdash;</span>'}</td>
                      <td class="text-right"><button class="btn btn-secondary btn-sm toggle-group" data-group="${index}" aria-expanded="false">Show units</button></td>
                    </tr>
                    <tr class="stock-group-details" data-group-details="${index}" hidden>
                      <td colspan="6">
                        <div class="stock-unit-list">
                          ${group.map(u => `
                            <div class="stock-unit-row">
                              <div class="row">
                                <span class="mono strong">${esc(u.serial_number)}${copyButton(u.serial_number, 'Copy serial number')}</span>
                                ${u.doa ? '<span class="badge badge-danger">DOA</span>' : ''}
                              </div>
                              <span class="small secondary">
                                ${u.location === 'machine' && u.machine_code
                                  ? `<a href="#/machines/${encodeURIComponent(u.machine_code)}" class="mono">${esc(u.machine_code)}</a> <span class="muted">(Pos ${u.position})</span>`
                                  : esc(u.display_location || u.location || '—')}
                              </span>
                              <span class="small muted">${esc(u.notes || 'No notes')}</span>
                              ${isGlobal ? `<div class="row row-end">
                                <button class="btn btn-ghost btn-sm edit-unit-btn" data-id="${u.id}" data-serial="${esc(u.serial_number)}" data-notes="${esc(u.notes || '')}" data-doa="${u.doa ? 'true' : 'false'}">Edit</button>
                                <button class="btn btn-ghost btn-sm doa-unit-btn" data-id="${u.id}" data-serial="${esc(u.serial_number)}" data-doa="${u.doa ? 'false' : 'true'}">${u.doa ? 'Clear DOA' : 'Mark DOA'}</button>
                                <button class="btn btn-danger btn-sm delete-unit-btn" data-id="${u.id}" data-serial="${esc(u.serial_number)}">Delete</button>
                              </div>` : ''}
                            </div>
                          `).join('')}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;

        const searchInput = contentEl.querySelector('#search-unit');
        searchInput.addEventListener('input', () => {
          const q = searchInput.value.toLowerCase();
          contentEl.querySelectorAll('.stock-group-row').forEach(row => {
            const details = contentEl.querySelector(`[data-group-details="${row.dataset.group}"]`);
            const matches = row.textContent.toLowerCase().includes(q) ||
              (details && details.textContent.toLowerCase().includes(q));
            row.style.display = matches ? '' : 'none';
            if (!q) details.hidden = true;
            else details.hidden = !matches;
          });
        });
        contentEl.querySelectorAll('.toggle-group').forEach(button => {
          button.addEventListener('click', () => {
            const details = contentEl.querySelector(`[data-group-details="${button.dataset.group}"]`);
            details.hidden = !details.hidden;
            button.textContent = details.hidden ? 'Show units' : 'Hide units';
            button.setAttribute('aria-expanded', String(!details.hidden));
          });
        });
        contentEl.querySelectorAll('.edit-unit-btn').forEach(button => {
          button.addEventListener('click', () => handleEditUnit(button.dataset));
        });
        contentEl.querySelectorAll('.doa-unit-btn').forEach(button => {
          button.addEventListener('click', async () => {
            try {
              await setPartDoa({ instanceId: button.dataset.id, doa: button.dataset.doa === 'true' });
              toast(button.dataset.doa === 'true' ? `Unit ${button.dataset.serial} marked DOA.` : `DOA cleared for ${button.dataset.serial}.`);
              await renderTab();
            } catch (err) {
              toast(err.message, 'error');
            }
          });
        });
        contentEl.querySelectorAll('.delete-unit-btn').forEach(button => {
          button.addEventListener('click', () => handleDeleteUnit(button.dataset.id, button.dataset.serial));
        });

      } else if (activeTab === 'non_serialized' || activeTab === 'consumable') {
        const items = await listStockItems(activeTab);
        if (!items.length) {
          contentEl.innerHTML = emptyState(`No ${activeTab === 'consumable' ? 'consumables' : 'non-serialized parts'} recorded`, 'Add stock items to track inventory.');
          return;
        }

        contentEl.innerHTML = `
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Item name</th>
                  <th>Part number</th>
                  <th>Current quantity</th>
                  <th>Min alert qty</th>
                  <th>Location</th>
                  ${isGlobal ? '<th class="text-right">Actions</th>' : ''}
                </tr>
              </thead>
              <tbody>
                ${items.map(it => {
                  const isLow = parseFloat(it.quantity) <= parseFloat(it.min_quantity);
                  return `
                    <tr class="${isLow ? 'is-warning' : ''}">
                      <td class="strong">
                        ${esc(it.name)}
                        ${isLow ? ' <span class="badge badge-danger">Low stock</span>' : ''}
                      </td>
                      <td class="mono">${esc(it.part_number || '—')}${it.part_number ? copyButton(it.part_number, 'Copy part number') : ''}</td>
                      <td class="mono ${isLow ? 'text-warning strong' : ''}">${it.quantity} ${esc(it.unit)}</td>
                      <td class="mono secondary">${it.min_quantity} ${esc(it.unit)}</td>
                      <td class="small secondary">${esc(it.location || '—')}</td>
                      ${isGlobal ? `
                        <td class="text-right">
                          <div class="cell-actions">
                            <button class="btn btn-ghost btn-sm adjust-btn" data-id="${it.id}" data-name="${esc(it.name)}" data-unit="${esc(it.unit)}" data-qty="${it.quantity}">Adjust qty</button>
                            <button class="btn btn-ghost btn-sm edit-stock-btn" data-id="${it.id}" data-name="${esc(it.name)}" data-pn="${esc(it.part_number || '')}" data-unit="${esc(it.unit)}" data-min="${it.min_quantity}" data-location="${esc(it.location || '')}">Edit</button>
                            <button class="btn btn-danger btn-sm delete-stock-btn" data-id="${it.id}" data-name="${esc(it.name)}">Delete</button>
                          </div>
                        </td>
                      ` : ''}
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;

        contentEl.querySelectorAll('.adjust-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            handleAdjustStock({
              id: btn.dataset.id,
              name: btn.dataset.name,
              unit: btn.dataset.unit,
              currentQty: btn.dataset.qty,
            });
          });
        });

        contentEl.querySelectorAll('.edit-stock-btn').forEach(btn => {
          btn.addEventListener('click', () => handleEditStockItem(btn.dataset));
        });

        contentEl.querySelectorAll('.delete-stock-btn').forEach(btn => {
          btn.addEventListener('click', () => handleDeleteStockItem(btn.dataset.id, btn.dataset.name));
        });

      } else if (activeTab === 'movements') {
        const movements = await listStockMovements();
        if (!movements.length) {
          contentEl.innerHTML = emptyState('No stock movements logged', 'Stock adjustments and machine usage will show here.');
          return;
        }

        contentEl.innerHTML = `
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Item / unit</th>
                  <th>Change (delta)</th>
                  <th>From &rarr; to</th>
                  <th>Performed by</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                ${movements.map(m => {
                  const itemName = m.stock_items ? m.stock_items.name : (m.part_instances ? `${m.part_instances.part_number} (${m.part_instances.serial_number})` : '—');
                  const isPositive = parseFloat(m.delta) > 0;
                  return `
                    <tr>
                      <td class="tiny mono muted nowrap">${new Date(m.created_at).toLocaleString()}</td>
                      <td class="small strong">${esc(itemName)}</td>
                      <td class="mono strong ${isPositive ? 'text-success' : 'text-danger'}">
                        ${isPositive ? '+' : ''}${m.delta}
                      </td>
                      <td class="tiny secondary">${esc(m.from_location || '—')} &rarr; ${esc(m.to_location || '—')}</td>
                      <td class="small">${esc(m.profiles ? m.profiles.full_name : 'System')}</td>
                      <td class="small muted">${esc(m.reason || '—')}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }
    } catch (err) {
      contentEl.innerHTML = alertText(`Error loading stock tab: ${esc(err.message)}`);
    }
  }

  function handleEditUnit(unit) {
    openModal({
      title: `Edit unit ${unit.serial}`,
      contentHtml: `
        <div class="field">
          <label class="label" for="unit-serial">Serial number *</label>
          <input class="input mono" id="unit-serial" name="serial" value="${unit.serial}" required>
        </div>
        <div class="field">
          <label class="label" for="unit-notes">Notes</label>
          <textarea class="textarea" id="unit-notes" name="notes">${unit.notes || ''}</textarea>
        </div>
        <p class="error-text"></p>
      `,
      onSubmit: async (form, close) => {
        await updateSlotInstance({
          instanceId: unit.id,
          serialNumber: form.serial.value,
          notes: form.notes.value,
        });
        close();
        toast(`Unit ${form.serial.value} updated.`);
        await renderTab();
      },
    });
  }

  function handleDeleteUnit(instanceId, serial) {
    openModal({
      title: `Delete unit ${serial}?`,
      danger: true,
      submitText: 'Delete unit',
      contentHtml: `
        <p>This removes the unit from active stock. Its historical movements remain preserved.</p>
        <p class="error-text"></p>
      `,
      onSubmit: async (form, close) => {
        await deleteSerializedUnit(instanceId);
        close();
        toast(`Unit ${serial} removed from active stock.`);
        await renderTab();
      },
    });
  }

  function handleEditStockItem(item) {
    openModal({
      title: `Edit ${item.name}`,
      contentHtml: `
        <div class="field">
          <label class="label" for="edit-stock-name">Item name *</label>
          <input class="input" id="edit-stock-name" name="name" value="${item.name}" required>
        </div>
        <div class="field">
          <label class="label" for="edit-stock-pn">Part number</label>
          <input class="input mono" id="edit-stock-pn" name="partNumber" value="${item.pn}">
        </div>
        <div class="field">
          <label class="label" for="edit-stock-unit">Unit</label>
          <input class="input" id="edit-stock-unit" name="unit" value="${item.unit || 'pcs'}">
        </div>
        <div class="field">
          <label class="label" for="edit-stock-min">Minimum warning threshold</label>
          <input class="input" id="edit-stock-min" name="minQuantity" type="number" min="0" step="any" value="${item.min || 0}">
        </div>
        <div class="field">
          <label class="label" for="edit-stock-location">Storage location</label>
          <input class="input" id="edit-stock-location" name="location" value="${item.location || ''}">
        </div>
        <p class="error-text"></p>
      `,
      onSubmit: async (form, close) => {
        await updateStockItem({
          itemId: item.id,
          name: form.name.value,
          partNumber: form.partNumber.value,
          unit: form.unit.value,
          minQuantity: form.minQuantity.value,
          location: form.location.value,
        });
        close();
        toast(`"${form.name.value}" updated.`);
        await renderTab();
      },
    });
  }

  function handleDeleteStockItem(itemId, name) {
    openModal({
      title: `Delete ${name}?`,
      danger: true,
      submitText: 'Delete part',
      contentHtml: `
        <p>This removes the part from the active stock list. Existing stock movements remain preserved for audit history.</p>
        <p class="error-text"></p>
      `,
      onSubmit: async (form, close) => {
        await deleteStockItem(itemId);
        close();
        toast(`"${name}" removed from active stock.`);
        await renderTab();
      },
    });
  }

  async function handleAddStock() {
    const types = await listMachineTypes().catch(() => []);

    openModal({
      title: 'Add to stock / inventory',
      contentHtml: `
        <div class="field">
          <label class="label" for="st-machine-type">Machine type *</label>
          <select class="select" id="st-machine-type" name="machineTypeId" required>
            <option value="">Select machine type</option>
            ${types.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}
            <option value="__manual__">Manual / consumable item</option>
          </select>
        </div>

        <div class="field" id="st-reg-part-field" style="display:none">
          <label class="label" for="st-reg-part">Registered part definition</label>
          <select class="select" id="st-reg-part" name="regPart">
            <option value="">Select registered part</option>
          </select>
        </div>

        <div class="field">
          <label class="label" for="st-kind">Stock category *</label>
          <select class="select" id="st-kind" name="itemType" required>
            <option value="serialized">Serialized unit (physical unit with serial number)</option>
            <option value="non_serialized">Non-serialized part (bulk quantity by part number)</option>
            <option value="consumable">Consumable (screws, cables, grease...)</option>
          </select>
        </div>

        <div id="st-fields-serialized">
          <div class="field">
            <label class="label" for="st-ser-pn">Part number *</label>
            <input class="input mono" id="st-ser-pn" name="serPartNumber" placeholder="e.g. DMA-001" style="text-transform:uppercase" required>
          </div>
          <div class="field">
            <label class="label" for="st-ser-sn">Serial number *</label>
            <input class="input mono" id="st-ser-sn" name="serSerialNumber" placeholder="e.g. SN-88123" style="text-transform:uppercase" required>
          </div>
          <div class="field">
            <label class="label" for="st-ser-loc">Storage location</label>
            <input class="input" id="st-ser-loc" name="serLocation" placeholder="e.g. Shelf B2, Warehouse Main">
          </div>
          <div class="field">
            <label class="label" for="st-ser-notes">Notes</label>
            <input class="input" id="st-ser-notes" name="serNotes" placeholder="Optional notes">
          </div>
        </div>

        <div id="st-fields-bulk" style="display:none">
          <div class="field">
            <label class="label" for="st-name">Item name *</label>
            <input class="input" id="st-name" name="name" placeholder="e.g. Encoder, M4 Screws">
          </div>
          <div class="field">
            <label class="label" for="st-pn">Part number</label>
            <input class="input mono" id="st-pn" name="partNumber" placeholder="Optional part number" style="text-transform:uppercase">
          </div>
          <div class="field">
            <label class="label" for="st-init">Initial quantity</label>
            <input class="input" id="st-init" name="initialQuantity" type="number" step="any" min="0" value="0">
          </div>
          <div class="field">
            <label class="label" for="st-unit">Unit</label>
            <input class="input" id="st-unit" name="unit" value="pcs" placeholder="pcs, meters, boxes">
          </div>
          <div class="field">
            <label class="label" for="st-min">Minimum warning threshold</label>
            <input class="input" id="st-min" name="minQuantity" type="number" step="any" min="0" value="5">
          </div>
          <div class="field">
            <label class="label" for="st-loc">Storage location</label>
            <input class="input" id="st-loc" name="location" placeholder="e.g. Shelf B3">
          </div>
        </div>
        <p class="error-text"></p>
      `,
      submitText: 'Add to stock',
      onSubmit: async (form, close) => {
        const itemType = form.itemType.value;
        if (itemType === 'serialized') {
          const pn = form.serPartNumber.value;
          const sn = form.serSerialNumber.value;
          const location = form.serLocation.value;
          const notes = form.serNotes.value;
          await addSerializedUnitToStock({ partNumber: pn, serialNumber: sn, notes, location });
          toast(`Serialized unit ${sn} added to stock.`);
        } else {
          const name = form.name.value;
          const partNumber = form.partNumber.value;
          const initialQuantity = form.initialQuantity.value;
          const unit = form.unit.value;
          const minQuantity = form.minQuantity.value;
          const location = form.location.value;

          await createStockItem({
            kind: itemType,
            name,
            partNumber,
            unit,
            minQuantity,
            location,
            initialQuantity,
          });
          toast(`Item "${name}" created in stock.`);
        }
        close();
        await renderTab();
      }
    });

    // Dynamic dropdown interaction handlers inside modal
    const modalEl = document.querySelector('.modal');
    if (modalEl) {
      const typeSelect = modalEl.querySelector('#st-machine-type');
      const regPartField = modalEl.querySelector('#st-reg-part-field');
      const regPartSelect = modalEl.querySelector('#st-reg-part');
      const kindSelect = modalEl.querySelector('#st-kind');

      const serDiv = modalEl.querySelector('#st-fields-serialized');
      const bulkDiv = modalEl.querySelector('#st-fields-bulk');

      const serPnInput = modalEl.querySelector('#st-ser-pn');
      const bulkPnInput = modalEl.querySelector('#st-pn');
      const bulkNameInput = modalEl.querySelector('#st-name');

      let currentTemplates = [];

      typeSelect.addEventListener('change', async () => {
        const typeId = typeSelect.value;
        if (typeId && typeId !== '__manual__') {
          regPartField.style.display = '';
          regPartSelect.innerHTML = `<option value="">Loading registered parts...</option>`;
          try {
            currentTemplates = await listTypeTemplates(typeId);
            regPartSelect.innerHTML = `
              <option value="">Select registered part</option>
              ${currentTemplates.map(p => `
                <option value="${p.id}">${esc(p.part_number)} &mdash; ${esc(p.name)} (${p.serialized ? 'Serialized' : 'Non-serialized'})</option>
              `).join('')}
              <option value="__custom__">Enter custom part number</option>
            `;
          } catch (err) {
            regPartSelect.innerHTML = `<option value="">Error loading parts</option>`;
          }
        } else {
          regPartField.style.display = 'none';
        }
      });

      regPartSelect.addEventListener('change', () => {
        const partId = regPartSelect.value;
        const part = currentTemplates.find(p => p.id === partId);
        if (part) {
          kindSelect.value = part.serialized ? 'serialized' : 'non_serialized';
          kindSelect.dispatchEvent(new Event('change'));

          serPnInput.value = part.part_number;
          bulkPnInput.value = part.part_number;
          bulkNameInput.value = part.name;
        }
      });

      kindSelect.addEventListener('change', () => {
        const val = kindSelect.value;
        if (val === 'serialized') {
          serDiv.style.display = '';
          bulkDiv.style.display = 'none';
          serPnInput.required = true;
        } else {
          serDiv.style.display = 'none';
          bulkDiv.style.display = '';
          serPnInput.required = false;
        }
      });
    }
  }

  function handleAdjustStock(item) {
    openModal({
      title: `Adjust stock: ${item.name}`,
      contentHtml: `
        <p class="small secondary mb-3">Current quantity: <strong>${item.currentQty} ${item.unit}</strong></p>
        <div class="field">
          <label class="label" for="adj-delta">Quantity change (delta) *</label>
          <input class="input" id="adj-delta" name="delta" type="number" step="any" required placeholder="e.g. 10 or -2">
          <p class="hint">Use a positive number to add stock, a negative number to consume stock.</p>
        </div>
        <div class="field">
          <label class="label" for="adj-reason">Reason *</label>
          <input class="input" id="adj-reason" name="reason" required placeholder="e.g. Inventory count adjustment, supplier arrival">
        </div>
        <p class="error-text"></p>
      `,
      submitText: 'Adjust stock',
      onSubmit: async (form, close) => {
        const delta = form.delta.value;
        const reason = form.reason.value;
        await adjustStock({ itemId: item.id, delta, reason });
        toast(`Stock adjusted for ${item.name}.`);
        close();
        await renderTab();
      }
    });
  }

  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      renderTab();
    });
  });

  const addStockBtn = container.querySelector('#btn-add-stock');
  if (addStockBtn) addStockBtn.addEventListener('click', handleAddStock);

  await renderTab();
}
