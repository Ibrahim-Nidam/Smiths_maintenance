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
import { updateSlotInstance, setRmaTag } from '../api/parts.js';
import { listMachineTypes } from '../api/machines.js';
import { fetchCatalog } from '../api/catalog.js';
import { pageHeader, emptyState, loadingState, alertText, esc } from '../components/ui.js';
import { openModal } from '../components/modal.js';
import { mountPartPicker } from '../components/part-picker.js';
import { copyButton } from '../components/input-enhancements.js';
import { toast } from '../components/toast.js';
import { ROLES } from '../auth.js';

const MODULE_LABELS = { input: 'Input', scanner: 'Scanner', output: 'Output' };

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
                  <th>RMA</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${groupedUnits.map((group, index) => {
                  const partNumber = group[0].part_number || 'Uncategorized';
                  const installed = group.filter(u => u.status === 'installed').length;
                  const doa = group.filter(u => u.doa).length;
                  const rma = group.filter(u => u.rma_tagged).length;
                  return `
                    <tr class="stock-group-row" data-group="${index}">
                      <td class="mono">${esc(partNumber)}${partNumber !== 'Uncategorized' ? copyButton(partNumber, 'Copy part number') : ''}</td>
                      <td class="secondary">${esc(group[0].part_name || '—')}</td>
                      <td>${group.length}</td>
                      <td>${installed}</td>
                      <td>${doa ? `<span class="badge badge-danger">${doa} DOA</span>` : '<span class="muted">&mdash;</span>'}</td>
                      <td>${rma ? `<span class="badge badge-danger">${rma} RMA</span>` : '<span class="muted">&mdash;</span>'}</td>
                      <td class="text-right"><button class="btn btn-secondary btn-sm toggle-group" data-group="${index}" aria-expanded="false">Show units</button></td>
                    </tr>
                    <tr class="stock-group-details" data-group-details="${index}" hidden>
                      <td colspan="7">
                        <div class="stock-unit-list">
                          ${group.map(u => `
                            <div class="stock-unit-row">
                              <div class="row">
                                <span class="mono strong">${esc(u.serial_number)}${copyButton(u.serial_number, 'Copy serial number')}</span>
                                ${u.doa ? '<span class="badge badge-danger">DOA</span>' : ''}
                                ${u.rma_tagged ? '<span class="badge badge-danger">RMA tagged</span>' : ''}
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
                                <button class="btn ${u.rma_tagged ? 'btn-ghost' : 'btn-secondary'} btn-sm rma-unit-btn"
                                  data-id="${u.id}" data-serial="${esc(u.serial_number)}" data-tagged="${u.rma_tagged ? 'true' : 'false'}">${u.rma_tagged ? 'Untag RMA' : 'Tag RMA'}</button>
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
        contentEl.querySelectorAll('.rma-unit-btn').forEach(button => {
          button.addEventListener('click', () => handleRmaTag(button.dataset));
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
          <div class="filter-row">
            <div class="search-field">
              <input type="search" id="search-items" class="input" placeholder="Filter by item name or part number" autocomplete="off">
            </div>
            <span class="small muted" id="items-count">${items.length} item${items.length === 1 ? '' : 's'}</span>
          </div>
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
                      <td class="mono secondary">${it.min_quantity > 0 ? `${it.min_quantity} ${esc(it.unit)}` : '<span class="muted">&mdash;</span>'}</td>
                      <td class="small secondary">${esc(it.location || '—')}</td>
                      ${isGlobal ? `
                        <td class="text-right">
                          <div class="cell-actions">
                            <button class="btn btn-ghost btn-sm adjust-btn" data-id="${it.id}" data-name="${esc(it.name)}" data-unit="${esc(it.unit)}" data-qty="${it.quantity}">Adjust qty</button>
                            <button class="btn btn-ghost btn-sm edit-stock-btn" data-id="${it.id}" data-name="${esc(it.name)}" data-pn="${esc(it.part_number || '')}" data-kind="${esc(it.kind)}" data-unit="${esc(it.unit)}" data-min="${it.min_quantity}" data-location="${esc(it.location || '')}">Edit</button>
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

        const itemSearch = contentEl.querySelector('#search-items');
        const itemCount = contentEl.querySelector('#items-count');
        if (itemSearch) {
          itemSearch.addEventListener('input', () => {
            const q = itemSearch.value.trim().toLowerCase();
            let shown = 0;
            contentEl.querySelectorAll('tbody tr').forEach(row => {
              const matches = !q || row.textContent.toLowerCase().includes(q);
              row.style.display = matches ? '' : 'none';
              if (matches) shown += 1;
            });
            if (itemCount) itemCount.textContent = `${shown} item${shown === 1 ? '' : 's'}`;
          });
        }

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

  // Tagging a serialized unit as RMA puts it on the RMA Defective Units page (#/rma).
  function handleRmaTag(unit) {
    const tagging = unit.tagged !== 'true';
    openModal({
      title: tagging ? `Tag ${unit.serial} as RMA?` : `Remove the RMA tag from ${unit.serial}?`,
      danger: tagging,
      submitText: tagging ? 'Tag RMA' : 'Untag RMA',
      contentHtml: `
        <p>${tagging
          ? 'The unit is declared defective and added to <strong>RMA Defective Units</strong>. It stays where it is (stock or machine) and every change is written to the history.'
          : 'The unit is removed from <strong>RMA Defective Units</strong> and goes back to normal tracking. The change is written to the history.'}</p>
        <div class="field">
          <label class="label" for="rma-note">Note</label>
          <input class="input" id="rma-note" name="note" value="${tagging ? 'Tagged from the stock page' : ''}" placeholder="Optional reason">
        </div>
        <p class="error-text"></p>
      `,
      onSubmit: async (form, close) => {
        await setRmaTag({
          instanceId: unit.id,
          tagged: tagging,
          note: form.note.value,
        });
        close();
        toast(tagging
          ? `${unit.serial} tagged RMA and added to RMA Defective Units.`
          : `RMA tag removed from ${unit.serial}.`);
        await renderTab();
      },
    });
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
        ${item.kind === 'consumable' ? `
        <div class="field">
          <label class="label" for="edit-stock-min">Minimum warning threshold</label>
          <input class="input" id="edit-stock-min" name="minQuantity" type="number" min="0" step="any" value="${item.min || 0}">
          <span class="hint">Consumables only: warn in the stock list when the quantity drops to this level.</span>
        </div>` : ''}
        <div class="field">
          <label class="label" for="edit-stock-location">Storage location</label>
          <input class="input" id="edit-stock-location" name="location" value="${item.location || ''}">
        </div>
        <p class="error-text"></p>
      `,
      onOpen: modal => {
        mountPartPicker(modal.querySelector('#edit-stock-pn'), { target: modal.querySelector('#edit-stock-name') });
      },
      onSubmit: async (form, close) => {
        await updateStockItem({
          itemId: item.id,
          name: form.name.value,
          partNumber: form.partNumber.value,
          unit: item.unit || 'pcs',
          minQuantity: form.minQuantity ? form.minQuantity.value : item.min || 0,
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
    let types = [];
    let catalog = [];
    try { types = await listMachineTypes(); } catch { types = []; }
    try { catalog = await fetchCatalog(); } catch { catalog = []; }

    const typeName = id => (types.find(t => t.id === id) || {}).name || 'Unknown type';
    const defaultKind = ['serialized', 'non_serialized', 'consumable'].includes(activeTab)
      ? activeTab
      : 'non_serialized';

    openModal({
      title: 'Add to stock / inventory',
      contentHtml: `
        <div class="field">
          <label class="label" for="st-part-search">Part *</label>
          <input type="search" class="input mb-2" id="st-part-search" placeholder="Filter by part number or designation" autocomplete="off">
          <select class="select" id="st-part" name="catalogPart" aria-label="Part from the catalogue"></select>
          <span class="hint">The list follows the stock category below. Choose "Other part" to enter everything by hand.</span>
        </div>

        <div class="form-info" id="st-part-info" hidden></div>

        <div class="field">
          <label class="label" for="st-kind">Stock category *</label>
          <select class="select" id="st-kind" name="itemType" required>
            <option value="serialized" ${defaultKind === 'serialized' ? 'selected' : ''}>Serialized unit (physical unit with serial number)</option>
            <option value="non_serialized" ${defaultKind === 'non_serialized' ? 'selected' : ''}>Non-serialized part (bulk quantity by part number)</option>
            <option value="consumable" ${defaultKind === 'consumable' ? 'selected' : ''}>Consumable (screws, cables, grease...)</option>
          </select>
        </div>

        <div id="st-fields-serialized">
          <div class="field">
            <label class="label" for="st-ser-pn">Part number *</label>
            <input class="input mono" id="st-ser-pn" name="serPartNumber" placeholder="e.g. DMA-001" style="text-transform:uppercase" required>
          </div>
          <div class="field">
            <label class="label" for="st-ser-qty">Quantity *</label>
            <input class="input" id="st-ser-qty" name="serQuantity" type="number" min="1" step="1" value="1" required>
            <span class="hint">One serial number field is rendered for each unit you say you have.</span>
          </div>
          <div class="field">
            <span class="label" id="st-serials-label">Serial numbers *</span>
            <div class="serial-list" id="st-serial-list" role="group" aria-labelledby="st-serials-label"></div>
            <span class="hint" id="st-serial-cap"></span>
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
            <input class="input" id="st-name" name="name" required placeholder="e.g. Encoder, M4 Screws">
          </div>
          <div class="field">
            <label class="label" for="st-pn">Part number</label>
            <input class="input mono" id="st-pn" name="partNumber" placeholder="Optional part number" style="text-transform:uppercase">
          </div>
          <div class="field">
            <label class="label" for="st-init">Initial quantity</label>
            <input class="input" id="st-init" name="initialQuantity" type="number" step="any" min="0" value="0">
          </div>
          <div class="field" id="st-min-field" hidden>
            <label class="label" for="st-min">Minimum warning threshold</label>
            <input class="input" id="st-min" name="minQuantity" type="number" step="any" min="0" value="5">
            <span class="hint">Consumables only: warn in the stock list when the quantity drops to this level.</span>
          </div>
          <div class="field">
            <label class="label" for="st-loc">Storage location</label>
            <input class="input" id="st-loc" name="location" placeholder="e.g. Shelf B3">
          </div>
        </div>
        <p class="error-text"></p>
      `,
      submitText: 'Add to stock',
      onOpen: modal => {
        wireStockForm(modal);
        mountPartPicker(modal.querySelector('#st-pn'), { target: modal.querySelector('#st-name') });
        mountPartPicker(modal.querySelector('#st-ser-pn'));
      },
      onSubmit: async (form, close) => {
        const itemType = form.itemType.value;
        if (itemType === 'serialized') {
          const pn = form.serPartNumber.value.trim().toUpperCase();
          const location = form.serLocation.value;
          const notes = form.serNotes.value;
          const inputs = [...form.querySelectorAll('#st-serial-list input')];
          const serials = inputs.map(i => i.value.trim().toUpperCase());
          const requested = parseInt(form.serQuantity.value, 10) || inputs.length;

          if (serials.some(sn => !sn)) throw new Error('Every serial number field is required.');
          if (new Set(serials).size !== serials.length) throw new Error('Serial numbers must be unique.');

          const added = [];
          const failed = [];
          for (const sn of serials) {
            try {
              await addSerializedUnitToStock({ partNumber: pn, serialNumber: sn, notes, location });
              added.push(sn);
            } catch (err) {
              failed.push(`${sn} (${err.message})`);
            }
          }

          if (!added.length) {
            throw new Error(`No unit was added: ${failed.join('; ')}`);
          }

          close();
          await renderTab();
          if (failed.length) {
            toast(`${added.length} of ${serials.length} unit(s) added. Not added: ${failed.join('; ')}`, 'error');
          } else if (requested > serials.length) {
            toast(`${added.length} unit(s) added. Add the ${requested - serials.length} remaining unit(s) in a second entry.`, 'error');
          } else {
            toast(`${added.length} serialized unit(s) added to stock.`);
          }
          return;
        }

        const name = form.name.value;
        const partNumber = form.partNumber.value;
        const initialQuantity = form.initialQuantity.value;
        // Consumables are the only kind that carries a warning threshold.
        const minQuantity = itemType === 'consumable' ? (form.minQuantity.value || 0) : 0;

        await createStockItem({
          kind: itemType,
          name,
          partNumber,
          minQuantity,
          location: form.location.value,
          initialQuantity,
        });
        toast(`Item "${name}" created in stock.`);
        close();
        await renderTab();
      }
    });

    // The part select drives everything else: it is filled from the parts catalogue
    // and filters itself on the stock category, then completes the form for you.
    // Function declaration, so it is hoisted and usable from onOpen above.
    function wireStockForm(modal) {
      const partSelect = modal.querySelector('#st-part');
      const partSearch = modal.querySelector('#st-part-search');
      const infoBox = modal.querySelector('#st-part-info');
      const kindSelect = modal.querySelector('#st-kind');

      const serDiv = modal.querySelector('#st-fields-serialized');
      const bulkDiv = modal.querySelector('#st-fields-bulk');

      const serPnInput = modal.querySelector('#st-ser-pn');
      const bulkPnInput = modal.querySelector('#st-pn');
      const bulkNameInput = modal.querySelector('#st-name');

      const qtyInput = modal.querySelector('#st-ser-qty');
      const serialList = modal.querySelector('#st-serial-list');
      const minField = modal.querySelector('#st-min-field');

      let serializedVisible = kindSelect.value === 'serialized';
      let autoPn = '';
      let autoName = '';

      const MAX_SERIALS = 50;
      const optionLabel = p => `${p.part_number} — ${p.designation}`;

      // Renders one serial number input per unit, keeping what was already typed.
      function renderSerialInputs() {
        let wanted = parseInt(qtyInput.value, 10);
        if (!Number.isFinite(wanted) || wanted < 1) wanted = 1;
        const capped = Math.min(wanted, MAX_SERIALS);

        const existing = [...serialList.querySelectorAll('input')];
        if (existing.length !== capped) {
          const values = existing.map(i => i.value);
          const rows = [];
          for (let i = 0; i < capped; i++) {
            rows.push(`
              <label class="serial-row" for="st-serial-${i}">
                <span class="serial-row-index" aria-hidden="true">${i + 1}</span>
                <input class="input mono" id="st-serial-${i}" name="serSerialNumber"
                  placeholder="SN-${88000 + i}" style="text-transform:uppercase"
                  autocomplete="off" ${serializedVisible ? 'required' : ''}>
              </label>
            `);
          }
          serialList.innerHTML = rows.join('');
          [...serialList.querySelectorAll('input')].forEach((input, i) => {
            input.value = values[i] || '';
            input.required = serializedVisible;
          });
        } else {
          existing.forEach(input => { input.required = serializedVisible; });
        }

        const hint = modal.querySelector('#st-serial-cap');
        if (hint) hint.textContent = wanted > MAX_SERIALS
          ? `Only the first ${MAX_SERIALS} serial number fields are shown. Add the rest afterwards.`
          : '';

        qtyInput.required = serializedVisible;
      }

      function renderPartOptions() {
        const wantSerialized = kindSelect.value === 'serialized';
        const term = partSearch.value.trim().toLowerCase();
        const previous = partSelect.value;

        const list = catalog.filter(p => {
          const unclassified = p.serialized === null || p.serialized === undefined;
          if (!unclassified && p.serialized !== wantSerialized) return false;
          if (term && !(p.part_number.toLowerCase().includes(term) || p.designation.toLowerCase().includes(term))) return false;
          return true;
        });
        const flagged = list.filter(p => p.serialized === wantSerialized);
        const unflagged = list.filter(p => p.serialized === null || p.serialized === undefined);
        const option = p => `<option value="${esc(p.part_number)}">${esc(optionLabel(p))}</option>`;

        const firstOption = catalog.length
          ? 'Select a part from the catalogue'
          : 'The parts catalogue is empty (run sql/011_parts_catalog.sql)';

        partSelect.innerHTML = `
          <option value="">${firstOption}</option>
          ${flagged.length ? `<optgroup label="${wantSerialized ? 'Serialized' : 'Non-serialized'}">${flagged.map(option).join('')}</optgroup>` : ''}
          ${unflagged.length ? `<optgroup label="Not yet classified">${unflagged.map(option).join('')}</optgroup>` : ''}
          <option value="__manual__">Other part (not in the catalogue)</option>
        `;

        if (previous && [...partSelect.options].some(o => o.value === previous)) {
          partSelect.value = previous;
        } else if (previous) {
          clearPart();
        }
        if (partSelect.value) showPartInfo();
      }

      function clearPart() {
        infoBox.hidden = true;
        infoBox.innerHTML = '';
        if (autoPn && serPnInput.value.trim().toUpperCase() === autoPn) serPnInput.value = '';
        if (autoPn && bulkPnInput.value.trim().toUpperCase() === autoPn) bulkPnInput.value = '';
        if (autoName && bulkNameInput.value === autoName) bulkNameInput.value = '';
        autoPn = '';
        autoName = '';
      }

      function showPartInfo() {
        const part = catalog.find(p => p.part_number === partSelect.value);
        if (!part) { clearPart(); return; }

        const typeNames = (part.machine_type_ids || []).map(typeName);
        infoBox.hidden = false;
        infoBox.innerHTML = `
          <div class="row">
            <span class="badge badge-accent">Filled from the catalogue</span>
            ${part.serialized === true ? '<span class="badge badge-success">Serialized</span>' : ''}
            ${part.serialized === false ? '<span class="badge badge-muted">Non-serialized</span>' : ''}
            ${part.module ? `<span class="badge badge-muted">${esc(MODULE_LABELS[part.module] || part.module)}</span>` : ''}
          </div>
          <p class="small secondary mt-2 mb-0">
            Machine type: <strong>${typeNames.length ? esc(typeNames.join(', ')) : 'Any machine type'}</strong>
          </p>
        `;

        // The machine and the serialization come from the part, the form follows.
        if (part.serialized === true && kindSelect.value !== 'serialized') {
          kindSelect.value = 'serialized';
          kindSelect.dispatchEvent(new Event('change'));
        } else if (part.serialized === false && kindSelect.value === 'serialized') {
          kindSelect.value = 'non_serialized';
          kindSelect.dispatchEvent(new Event('change'));
        }

        serPnInput.value = part.part_number;
        bulkPnInput.value = part.part_number;
        autoPn = part.part_number;

        if (!bulkNameInput.value || bulkNameInput.value === autoName) {
          bulkNameInput.value = part.designation;
          autoName = part.designation;
        }
      }

      partSelect.addEventListener('change', showPartInfo);
      partSearch.addEventListener('input', renderPartOptions);
      qtyInput.addEventListener('input', renderSerialInputs);

      kindSelect.addEventListener('change', () => {
        const val = kindSelect.value;
        const isSerialized = val === 'serialized';
        serializedVisible = isSerialized;
        serDiv.style.display = isSerialized ? '' : 'none';
        bulkDiv.style.display = isSerialized ? 'none' : '';
        // Only the visible group is required, so submitting never gets stuck.
        serPnInput.required = isSerialized;
        qtyInput.required = isSerialized;
        bulkNameInput.required = !isSerialized;
        // The warning threshold is a consumables-only concept.
        minField.hidden = val !== 'consumable';
        renderSerialInputs();
        renderPartOptions();
      });

      kindSelect.dispatchEvent(new Event('change'));
      renderPartOptions();
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
