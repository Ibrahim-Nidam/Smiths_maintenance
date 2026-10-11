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
import { pageHeader, emptyState, esc } from '../components/ui.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { ROLES } from '../auth.js';

export async function render(container, params, ctx) {
  const isGlobal = [ROLES.ADMIN, ROLES.MANAGER].includes(ctx.profile.role);

  const actions = isGlobal
    ? `<button id="btn-add-stock" class="btn btn-primary btn-sm">+ Add item / unit</button>`
    : '';

  container.innerHTML = pageHeader('Stock & Inventory', 'Track company-wide serialized units, parts stock, and consumables.', actions) + `
    <div class="border-b border-gray-200 mb-6 flex gap-6">
      <button class="tab-btn py-3 border-b-2 font-medium text-sm text-accent border-accent" data-tab="serialized">Serialized Units</button>
      <button class="tab-btn py-3 border-b-2 font-medium text-sm text-gray-500 border-transparent hover:text-gray-900" data-tab="non_serialized">Non-Serialized Parts</button>
      <button class="tab-btn py-3 border-b-2 font-medium text-sm text-gray-500 border-transparent hover:text-gray-900" data-tab="consumable">Consumables</button>
      <button class="tab-btn py-3 border-b-2 font-medium text-sm text-gray-500 border-transparent hover:text-gray-900" data-tab="movements">Stock Movements</button>
    </div>

    <div id="tab-content"><p class="text-gray-400 text-sm">Loading stock data...</p></div>
  `;

  let activeTab = 'serialized';

  async function renderTab() {
    const contentEl = container.querySelector('#tab-content');

    container.querySelectorAll('.tab-btn').forEach(btn => {
      const active = btn.dataset.tab === activeTab;
      btn.className = `tab-btn py-3 border-b-2 font-medium text-sm transition ${
        active ? 'text-accent border-accent font-semibold' : 'text-gray-500 border-transparent hover:text-gray-900'
      }`;
    });

    contentEl.innerHTML = `<p class="text-gray-400 text-sm">Loading...</p>`;

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
          <div class="mb-4">
            <input type="search" id="search-unit" class="input w-64" placeholder="Filter by part or serial #...">
          </div>
          <div class="table-wrap">
            <table class="table" id="units-table">
              <thead>
                <tr>
                  <th>Part Number</th>
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
                      <td class="mono">${esc(partNumber)}</td>
                      <td>${group.length}</td>
                      <td>${installed}</td>
                      <td>${doa ? `<span class="badge badge-alert">${doa} DOA</span>` : '<span class="text-muted">—</span>'}</td>
                      <td class="text-right"><button class="btn btn-secondary btn-sm toggle-group" data-group="${index}" aria-expanded="false">Show units</button></td>
                    </tr>
                    <tr class="stock-group-details" data-group-details="${index}" hidden>
                      <td colspan="5">
                        <div class="stock-unit-list">
                          ${group.map(u => `
                            <div class="stock-unit-row">
                              <div>
                                <span class="mono">${esc(u.serial_number)}</span>
                                ${u.doa ? '<span class="badge badge-alert ml-2">DOA</span>' : ''}
                              </div>
                              <span class="text-sm text-secondary">
                                ${u.location === 'machine' && u.machine_code
                                  ? `<a href="#/machines/${encodeURIComponent(u.machine_code)}" class="text-accent">${esc(u.machine_code)} (Pos ${u.position})</a>`
                                  : esc(u.display_location || u.location || '—')}
                              </span>
                              <span class="text-sm text-secondary">${esc(u.notes || 'No notes')}</span>
                              ${isGlobal ? `<div class="flex gap-2 justify-end">
                                <button class="btn btn-ghost btn-sm edit-unit-btn" data-id="${u.id}" data-serial="${esc(u.serial_number)}" data-notes="${esc(u.notes || '')}" data-doa="${u.doa ? 'true' : 'false'}">Edit</button>
                                <button class="btn btn-ghost btn-sm doa-unit-btn" data-id="${u.id}" data-serial="${esc(u.serial_number)}" data-doa="${u.doa ? 'false' : 'true'}">${u.doa ? 'Clear DOA' : 'Mark DOA'}</button>
                                <button class="btn btn-ghost btn-sm btn-danger delete-unit-btn" data-id="${u.id}" data-serial="${esc(u.serial_number)}">Delete</button>
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
                  <th>Item Name</th>
                  <th>Part Number</th>
                  <th>Current Quantity</th>
                  <th>Min Alert Qty</th>
                  <th>Location</th>
                  ${isGlobal ? '<th class="text-right">Actions</th>' : ''}
                </tr>
              </thead>
              <tbody>
                ${items.map(it => {
                  const isLow = parseFloat(it.quantity) <= parseFloat(it.min_quantity);
                  return `
                    <tr class="${isLow ? 'bg-amber-50/50' : ''}">
                      <td>
                        ${esc(it.name)}
                        ${isLow ? ' <span class="badge badge-alert text-[11px] ml-2">Low Stock</span>' : ''}
                      </td>
                      <td class="mono">${esc(it.part_number || '—')}</td>
                      <td class="mono text-base ${isLow ? 'text-amber-700' : ''}">${it.quantity} ${esc(it.unit)}</td>
                      <td class="mono text-secondary">${it.min_quantity} ${esc(it.unit)}</td>
                      <td class="text-sm text-secondary">${esc(it.location || '—')}</td>
                      ${isGlobal ? `
                        <td class="text-right">
                          <button class="btn btn-ghost btn-sm adjust-btn" data-id="${it.id}" data-name="${esc(it.name)}" data-unit="${esc(it.unit)}" data-qty="${it.quantity}">Adjust Qty</button>
                          <button class="btn btn-ghost btn-sm edit-stock-btn" data-id="${it.id}" data-name="${esc(it.name)}" data-pn="${esc(it.part_number || '')}" data-unit="${esc(it.unit)}" data-min="${it.min_quantity}" data-location="${esc(it.location || '')}">Edit</button>
                          <button class="btn btn-ghost btn-sm btn-danger delete-stock-btn" data-id="${it.id}" data-name="${esc(it.name)}">Delete</button>
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
            contentEl.querySelectorAll('.edit-stock-btn').forEach(btn => {
              btn.addEventListener('click', () => handleEditStockItem(btn.dataset));
            });
            contentEl.querySelectorAll('.delete-stock-btn').forEach(btn => {
              btn.addEventListener('click', () => handleDeleteStockItem(btn.dataset.id, btn.dataset.name));
            });
          });
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
                  <th>Item / Unit</th>
                  <th>Change (Delta)</th>
                  <th>From &rarr; To</th>
                  <th>Performed By</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                ${movements.map(m => {
                  const itemName = m.stock_items ? m.stock_items.name : (m.part_instances ? `${m.part_instances.part_number} (${m.part_instances.serial_number})` : '—');
                  const isPositive = parseFloat(m.delta) > 0;
                  return `
                    <tr>
                      <td class="text-xs text-gray-500">${new Date(m.created_at).toLocaleString()}</td>
                      <td class="font-semibold text-sm">${esc(itemName)}</td>
                      <td class="mono font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}">
                        ${isPositive ? '+' : ''}${m.delta}
                      </td>
                      <td class="text-xs text-gray-600">${esc(m.from_location || '—')} &rarr; ${esc(m.to_location || '—')}</td>
                      <td class="text-sm">${esc(m.profiles ? m.profiles.full_name : 'System')}</td>
                      <td class="text-sm text-gray-500">${esc(m.reason || '—')}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }
    } catch (err) {
      contentEl.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded-md border border-red-200">Error loading stock tab: ${esc(err.message)}</div>`;
    }
  }

  function handleEditUnit(unit) {
    openModal({
      title: `Edit Unit ${unit.serial}`,
      contentHtml: `
        <div class="field">
          <label class="label" for="unit-serial">Serial Number *</label>
          <input class="input font-mono" id="unit-serial" name="serial" value="${unit.serial}" required>
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
      title: `Delete Unit ${serial}?`,
      danger: true,
      submitText: 'Delete Unit',
      contentHtml: `
        <p>This removes the unit from active stock. Its historical movements will remain preserved.</p>
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
          <label class="label" for="edit-stock-name">Item Name *</label>
          <input class="input" id="edit-stock-name" name="name" value="${item.name}" required>
        </div>
        <div class="field">
          <label class="label" for="edit-stock-pn">Part Number</label>
          <input class="input font-mono" id="edit-stock-pn" name="partNumber" value="${item.pn}">
        </div>
        <div class="field">
          <label class="label" for="edit-stock-unit">Unit</label>
          <input class="input" id="edit-stock-unit" name="unit" value="${item.unit || 'pcs'}">
        </div>
        <div class="field">
          <label class="label" for="edit-stock-min">Minimum Warning Threshold</label>
          <input class="input" id="edit-stock-min" name="minQuantity" type="number" min="0" step="any" value="${item.min || 0}">
        </div>
        <div class="field">
          <label class="label" for="edit-stock-location">Storage Location</label>
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
      submitText: 'Delete Part',
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
      title: 'Add to Stock / Inventory',
      contentHtml: `
        <div class="field">
          <label class="label" for="st-machine-type">Machine Type *</label>
          <select class="select" id="st-machine-type" name="machineTypeId" required>
            <option value="">-- Select Machine Type --</option>
            ${types.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}
            <option value="__manual__">+ Manual / Consumable Item</option>
          </select>
        </div>

        <div class="field" id="st-reg-part-field" style="display:none">
          <label class="label" for="st-reg-part">Registered Part Definition</label>
          <select class="select" id="st-reg-part" name="regPart">
            <option value="">-- Select Registered Part --</option>
          </select>
        </div>

        <div class="field">
          <label class="label" for="st-kind">Stock Category *</label>
          <select class="select" id="st-kind" name="itemType" required>
            <option value="serialized">Serialized Unit (Physical unit with serial #)</option>
            <option value="non_serialized">Non-Serialized Part (Bulk quantity by part #)</option>
            <option value="consumable">Consumable (Screws, cables, grease...)</option>
          </select>
        </div>

        <div id="st-fields-serialized">
          <div class="field">
            <label class="label" for="st-ser-pn">Part Number *</label>
            <input class="input font-mono" id="st-ser-pn" name="serPartNumber" placeholder="e.g. DMA-001" style="text-transform:uppercase" required>
          </div>
          <div class="field">
            <label class="label" for="st-ser-sn">Serial Number *</label>
            <input class="input font-mono" id="st-ser-sn" name="serSerialNumber" placeholder="e.g. SN-88123" style="text-transform:uppercase" required>
          </div>
          <div class="field">
            <label class="label" for="st-ser-loc">Storage Location</label>
            <input class="input" id="st-ser-loc" name="serLocation" placeholder="e.g. Shelf B2, Warehouse Main">
          </div>
          <div class="field">
            <label class="label" for="st-ser-notes">Notes</label>
            <input class="input" id="st-ser-notes" name="serNotes" placeholder="Optional notes...">
          </div>
        </div>

        <div id="st-fields-bulk" style="display:none">
          <div class="field">
            <label class="label" for="st-name">Item Name *</label>
            <input class="input" id="st-name" name="name" placeholder="e.g. Encoder, M4 Screws">
          </div>
          <div class="field">
            <label class="label" for="st-pn">Part Number</label>
            <input class="input font-mono" id="st-pn" name="partNumber" placeholder="Optional part #" style="text-transform:uppercase">
          </div>
          <div class="field">
            <label class="label" for="st-init">Initial Quantity</label>
            <input class="input" id="st-init" name="initialQuantity" type="number" step="any" min="0" value="0">
          </div>
          <div class="field">
            <label class="label" for="st-unit">Unit</label>
            <input class="input" id="st-unit" name="unit" value="pcs" placeholder="pcs, meters, boxes">
          </div>
          <div class="field">
            <label class="label" for="st-min">Minimum Warning Threshold</label>
            <input class="input" id="st-min" name="minQuantity" type="number" step="any" min="0" value="5">
          </div>
          <div class="field">
            <label class="label" for="st-loc">Storage Location</label>
            <input class="input" id="st-loc" name="location" placeholder="e.g. Shelf B3">
          </div>
        </div>
        <p class="error-text"></p>
      `,
      submitText: 'Add to Stock',
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
              <option value="">-- Select Registered Part --</option>
              ${currentTemplates.map(p => `
                <option value="${p.id}">${esc(p.part_number)} — ${esc(p.name)} (${p.serialized ? 'Serialized' : 'Non-serialized'})</option>
              `).join('')}
              <option value="__custom__">+ Enter Custom Part Number</option>
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
      title: `Adjust Stock: ${item.name}`,
      contentHtml: `
        <p class="text-sm text-gray-600 mb-3">Current Quantity: <strong>${item.currentQty} ${item.unit}</strong></p>
        <div class="field">
          <label class="label" for="adj-delta">Quantity Change (Delta) *</label>
          <input class="input" id="adj-delta" name="delta" type="number" step="any" required placeholder="e.g. +10 or -2">
          <p class="hint">Use positive number to add stock, negative to consume stock.</p>
        </div>
        <div class="field">
          <label class="label" for="adj-reason">Reason *</label>
          <input class="input" id="adj-reason" name="reason" required placeholder="e.g. Inventory count adjustment, supplier arrival">
        </div>
        <p class="error-text"></p>
      `,
      submitText: 'Adjust Stock',
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
