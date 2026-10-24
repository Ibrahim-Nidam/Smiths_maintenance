import { getMachineByCode, updateMachine, deleteMachine, listMachineTypes, listTemplatePartAvailability } from '../api/machines.js';
import { addPartToMachine, updateMachinePart, deleteMachinePart, setSlotSerial, updateSlotInstance, replaceSerializedPart, replaceNonSerializedPart, swapParts, setRmaTag } from '../api/parts.js';
import { listAvailableUnits, findStockItemForPart } from '../api/stock.js';
import { listMaintenanceEvents } from '../api/history.js';
import { pageHeader, emptyState, alertText, esc } from '../components/ui.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { mountPartPicker } from '../components/part-picker.js';
import { ROLES } from '../auth.js';
import { copyButton } from '../components/input-enhancements.js';

const STATUS_BADGE_CLASSES = {
  operational: 'badge-success',
  degraded: 'badge-warning',
  down: 'badge-danger',
  decommissioned: 'badge-muted',
};

const STATUS_LABELS = {
  operational: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
  decommissioned: 'Decommissioned',
};

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

export async function render(container, params, ctx) {
  const machineCode = params.code;
  if (!machineCode) {
    container.innerHTML = emptyState('Invalid Machine', 'No machine code provided.');
    return;
  }

  container.innerHTML = `<p class="loading">Loading machine ${esc(machineCode)}...</p>`;

  const expandedParts = new Set();
  let activeTab = 'parts';

  async function loadAndRender() {
    let machine;
    try {
      machine = await getMachineByCode(machineCode);
    } catch (err) {
      container.innerHTML = emptyState(
        'Machine not found',
        `Could not load machine with code "${esc(machineCode)}": ${esc(err.message)}`,
        `<a href="#/machines" class="btn btn-secondary btn-sm">&larr; Back to machines</a>`
      );
      return;
    }

    const canManage = [ROLES.ADMIN, ROLES.MANAGER, ROLES.TEAM_LEAD].includes(ctx.profile.role) ||
                      (ctx.profile.role === ROLES.TECHNICIAN && machine.team_id === ctx.profile.team_id);
    const isGlobal = [ROLES.ADMIN, ROLES.MANAGER].includes(ctx.profile.role);

    const headerActions = `
      <a href="#/machines" class="btn btn-secondary btn-sm">&larr; Back</a>
      ${canManage ? `<button id="btn-add-part" class="btn btn-primary btn-sm">Add part</button>` : ''}
      ${canManage ? `<button id="btn-edit-machine" class="btn btn-secondary btn-sm">Edit</button>` : ''}
      ${isGlobal ? `<button id="btn-delete-machine" class="btn btn-danger btn-sm">Delete</button>` : ''}
    `;

    const subText = `${machine.type_name} &middot; ${machine.team_name} ${machine.location ? `&middot; ${esc(machine.location)}` : ''}`;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <div class="row">
            <h1 class="page-title mono">${esc(machine.code)}</h1>
            <span class="badge ${STATUS_BADGE_CLASSES[machine.status] || ''}">
              <span class="dot"></span>${esc(STATUS_LABELS[machine.status] || machine.status)}
            </span>
          </div>
          <p class="page-sub">${subText}</p>
        </div>
        <div class="page-actions">${headerActions}</div>
      </div>

      <div class="tabs" role="tablist">
        <button class="tab-btn view-tab-btn" type="button" role="tab" data-tab="parts" aria-selected="${activeTab === 'parts'}">Modules &amp; installed parts</button>
        <button class="tab-btn view-tab-btn" type="button" role="tab" data-tab="history" aria-selected="${activeTab === 'history'}">Machine history log</button>
      </div>

      <div id="tab-content"></div>
    `;

    const tabContentEl = container.querySelector('#tab-content');

    if (activeTab === 'parts') {
      renderPartsTab(tabContentEl, machine, canManage, loadAndRender);
    } else {
      await renderHistoryTab(tabContentEl, machine);
    }

    container.querySelectorAll('.view-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        loadAndRender();
      });
    });

    const deleteBtn = container.querySelector('#btn-delete-machine');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        openModal({
          title: `Delete Machine ${machine.code}`,
          danger: true,
          submitText: 'Delete Machine',
          contentHtml: `
            <p>Are you sure you want to delete machine <strong>${esc(machine.code)}</strong>?</p>
            <p class="small muted mt-2">The installed parts structure for this machine will be removed. Historical event logs remain preserved.</p>
            <p class="error-text"></p>
          `,
          onSubmit: async (form, close) => {
            await deleteMachine(machine.id);
            toast(`Machine ${machine.code} deleted.`);
            close();
            window.location.hash = '#/machines';
          }
        });
      });
    }

    const editMachineBtn = container.querySelector('#btn-edit-machine');
    if (editMachineBtn) {
      editMachineBtn.addEventListener('click', () => {
        openModal({
          title: `Edit machine details (${machine.code})`,
          contentHtml: `
            <div class="field">
              <label class="label" for="em-status">Status *</label>
              <select class="select" id="em-status" name="status" required>
                <option value="operational" ${machine.status === 'operational' ? 'selected' : ''}>Operational</option>
                <option value="degraded" ${machine.status === 'degraded' ? 'selected' : ''}>Degraded</option>
                <option value="down" ${machine.status === 'down' ? 'selected' : ''}>Down</option>
                <option value="decommissioned" ${machine.status === 'decommissioned' ? 'selected' : ''}>Decommissioned</option>
              </select>
            </div>
            <div class="field">
              <label class="label" for="em-loc">Location</label>
              <input class="input" id="em-loc" name="location" value="${esc(machine.location || '')}">
            </div>
            <p class="error-text"></p>
          `,
          submitText: 'Save machine',
          onSubmit: async (form, close) => {
            const status = form.status.value;
            const location = form.location.value;
            await updateMachine(machine.id, { status, location });
            toast(`Machine ${machine.code} updated.`);
            close();
            await loadAndRender();
          }
        });
      });
    }

    const addPartBtn = container.querySelector('#btn-add-part');
    if (addPartBtn) {
      addPartBtn.addEventListener('click', async () => {
        const isGlobal = [ROLES.ADMIN, ROLES.MANAGER].includes(ctx.profile.role);
        let machineTypes = [];
        if (isGlobal) {
          try {
            machineTypes = await listMachineTypes();
          } catch (err) {
            toast(`Could not load machine types: ${err.message}`, 'error');
            return;
          }
        }

        openModal({
          title: `Add part to machine ${machine.code}`,
          contentHtml: `
            <div class="field">
              <label class="label" for="ap-module">Module *</label>
              <select class="select" id="ap-module" name="module" required>
                <option value="input">Input module</option>
                <option value="scanner">Scanner module</option>
                <option value="output">Output module</option>
              </select>
            </div>
            <div class="field">
              <label class="label" for="ap-name">Part name *</label>
              <input class="input" id="ap-name" name="name" required placeholder="e.g. Motor Drive">
            </div>
            <div class="field">
              <label class="label" for="ap-pn">Part number *</label>
              <input class="input mono" id="ap-pn" name="partNumber" required placeholder="e.g. MOT-001" style="text-transform:uppercase">
            </div>
            <div class="field">
              <label class="checkbox-row" for="ap-serialized">
                <input type="checkbox" id="ap-serialized" name="serialized" checked>
                <span class="label">Serialized</span>
              </label>
            </div>
            <div class="field">
              <label class="label" for="ap-qty">Quantity per machine *</label>
              <input class="input" id="ap-qty" name="quantity" type="number" min="1" value="1" required>
            </div>
            <div class="field">
              <label class="label" for="ap-placement">Placement mode *</label>
              <select class="select" id="ap-placement" name="placementMode">
                <option value="flexible">Flexible</option>
                <option value="fixed">Fixed</option>
              </select>
            </div>
            <div class="field">
              <label class="checkbox-row" for="ap-rma">
                <input type="checkbox" id="ap-rma" name="rmaApplicable" checked>
                <span class="label">RMA applicable</span>
              </label>
            </div>
            ${isGlobal ? `
              <div class="field-box">
                <label class="checkbox-row" for="ap-sync-templates">
                  <input type="checkbox" id="ap-sync-templates" name="syncTemplates">
                  <span class="label">This part is also present in other machine types</span>
                </label>
                <div id="ap-template-types" class="hidden mt-3 stack-sm">
                  <p class="tiny muted">Select the other templates that should include this part. Existing definitions are shown automatically and will not be duplicated.</p>
                  <div id="ap-template-type-list" class="stack-sm"></div>
                </div>
              </div>
            ` : ''}
            <p class="error-text"></p>
          `,
          submitText: 'Add Part to Machine',
          onOpen: async (modal) => {
            mountPartPicker(modal.querySelector('#ap-pn'), { target: modal.querySelector('#ap-name') });
            if (!isGlobal) return;
            const syncCheckbox = modal.querySelector('#ap-sync-templates');
            const typeContainer = modal.querySelector('#ap-template-types');
            const typeList = modal.querySelector('#ap-template-type-list');
            const loadTemplateTypes = async () => {
              const selectedModule = modal.querySelector('#ap-module').value;
              const partNumber = modal.querySelector('#ap-pn').value.trim();
              typeContainer.classList.toggle('hidden', !syncCheckbox.checked);
              if (!syncCheckbox.checked || !partNumber) {
                typeList.innerHTML = '';
                return;
              }
              const otherTypes = machineTypes.filter(t => t.id !== machine.machine_type_id);
              const existing = await listTemplatePartAvailability({
                machineTypeIds: otherTypes.map(t => t.id),
                module: selectedModule,
                partNumber,
              });
              const existingIds = new Set(existing.map(row => row.machine_type_id));
              typeList.innerHTML = otherTypes.length
                ? otherTypes.map(type => {
                    const alreadyPresent = existingIds.has(type.id);
                    return `
                      <label class="checkbox-row small ${alreadyPresent ? 'muted' : ''}">
                        <input type="checkbox" name="templateTypeIds" value="${type.id}" ${alreadyPresent ? 'checked disabled' : ''}>
                        <span>${esc(type.name)}${alreadyPresent ? ' (already contains this part)' : ''}</span>
                      </label>
                    `;
                  }).join('')
                : '<p class="tiny muted">No other machine types are available.</p>';
            };
            syncCheckbox.addEventListener('change', loadTemplateTypes);
            modal.querySelector('#ap-module').addEventListener('change', loadTemplateTypes);
            modal.querySelector('#ap-pn').addEventListener('input', loadTemplateTypes);
            await loadTemplateTypes();
          },
          onSubmit: async (form, close) => {
            const name = form.name.value;
            const partNumber = form.partNumber.value;
            const templateTypeIds = [...form.querySelectorAll('input[name="templateTypeIds"]:checked:not(:disabled)')]
              .map(input => input.value);
            const { templateExisted } = await addPartToMachine({
              machineId: machine.id,
              machineTypeId: machine.machine_type_id,
              module: form.module.value,
              name,
              partNumber,
              serialized: form.serialized.checked,
              quantity: form.quantity.value,
              placementMode: form.placementMode.value,
              rmaApplicable: form.rmaApplicable.checked,
              templateTypeIds,
            });

            if (templateExisted) {
              toast(`Part "${name}" added to machine. (Part number ${partNumber} is already in the type template)`);
            } else {
              toast(`Part "${name}" added to machine and saved to type template (${machine.type_name}).`);
            }

            close();
            await loadAndRender();
          }
        });
      });
    }
  }

  function renderPartsTab(tabContentEl, machine, canManage, reload) {
    const MODULE_KEYS = ['input', 'scanner', 'output'];
    const MODULE_TITLES = { input: 'Input Module', scanner: 'Scanner Module', output: 'Output Module' };

    const partsByModule = { input: [], scanner: [], output: [] };
    (machine.machine_parts || []).forEach(p => {
      if (partsByModule[p.module]) partsByModule[p.module].push(p);
    });

    tabContentEl.innerHTML = `
      <div class="stack-lg">
        ${MODULE_KEYS.map(modKey => {
          const parts = partsByModule[modKey];
          return `
            <div class="panel">
              <div class="module-head">
                <h2 class="module-title">
                  <span class="module-dot ${parts.length ? 'is-active' : ''}"></span>
                  ${MODULE_TITLES[modKey]}
                </h2>
                <span class="small muted">${parts.length} part type${parts.length === 1 ? '' : 's'}</span>
              </div>

              ${!parts.length
                ? `<p class="panel-empty">No parts added to the ${modKey} module yet.</p>`
                : `
                  <div class="stack">
                    ${parts.map(p => {
                      const slots = p.machine_slots || [];
                      const installedCount = slots.filter(s => s.instance_id).length;
                      const isExpanded = expandedParts.has(p.id);

                      return `
                        <div class="part-card">
                          <div class="part-head">
                            <div class="part-identity">
                              <span class="part-name">${esc(p.name)}</span>
                              <span class="badge badge-solid mono">${esc(p.part_number)}</span>${copyButton(p.part_number, 'Copy part number')}
                              ${p.serialized
                                ? `<span class="badge badge-accent">Serialized (${installedCount}/${p.quantity} installed, ${p.placement_mode})</span>`
                                : `<span class="badge badge-muted">Non-serialized (${p.quantity} pcs)</span>`
                              }
                            </div>

                            <div class="row">
                              ${canManage ? `
                                <button class="btn btn-ghost btn-sm edit-machine-part-btn" data-part-id="${p.id}">Edit part</button>
                                <button class="btn btn-danger btn-sm delete-machine-part-btn" data-part-id="${p.id}">Remove</button>
                              ` : ''}
                              ${p.serialized
                                ? `<button class="btn btn-secondary btn-sm toggle-expand-btn" data-part-id="${p.id}">
                                    ${isExpanded ? 'Collapse positions' : `Expand positions (${installedCount}/${p.quantity})`}
                                  </button>`
                                : (canManage
                                    ? `<button class="btn btn-secondary btn-sm replace-non-ser-btn" data-part-id="${p.id}" data-name="${esc(p.name)}">Replace part</button>`
                                    : '')
                              }
                            </div>
                          </div>

                          ${p.serialized
                            ? (isExpanded
                                ? renderSlotGrid(p, canManage)
                                : `<button type="button" class="part-summary toggle-expand-btn" data-part-id="${p.id}">
                                    <span>${installedCount} of ${p.quantity} positions occupied. Expand to view, edit serials and markings.</span>
                                    <span class="link-arrow">Expand &rarr;</span>
                                   </button>`
                              )
                            : `<div class="part-note">Standard non-serialized part.</div>`
                          }
                        </div>
                      `;
                    }).join('')}
                  </div>
                `
              }
            </div>
          `;
        }).join('')}
      </div>
    `;

    attachActionHandlers(tabContentEl, machine, canManage, reload);
  }

  function renderSlotGrid(p, canManage) {
    const slots = p.machine_slots || [];
    return `
      <div class="slot-grid">
        ${slots.map(s => {
          const inst = s.part_instances;
          const isEmpty = !inst;
          const isRma = inst && inst.rma_tagged;

          return `
            <div class="slot ${isEmpty ? 'slot-empty' : ''} ${isRma ? 'slot-rma' : ''}">
              <div>
                <div class="row row-between">
                  <span class="slot-pos">Pos ${s.position}</span>
                  ${isRma ? '<span class="badge badge-danger">RMA</span>' : ''}
                </div>
                ${isEmpty
                  ? `<span class="slot-serial">Empty</span>`
                  : `
                    <span class="slot-serial mono">${esc(inst.serial_number)}${copyButton(inst.serial_number, 'Copy serial number')}</span>
                    ${inst.notes ? `<div class="note mt-1">${esc(inst.notes)}</div>` : ''}
                  `
                }
              </div>

              ${canManage ? `
                <div class="slot-actions">
                  ${isEmpty
                    ? `<button class="slot-action is-accent slot-fill-btn" data-slot-id="${s.id}" data-pos="${s.position}" data-part-name="${esc(p.name)}" data-pn="${esc(p.part_number)}">Add serial</button>`
                    : `
                      <button class="slot-action slot-edit-btn" data-inst-id="${inst.id}" data-serial="${esc(inst.serial_number)}" data-notes="${esc(inst.notes || '')}" data-pos="${s.position}" data-part-name="${esc(p.name)}">Edit markings</button>
                      <button class="slot-action slot-replace-btn" data-slot-id="${s.id}" data-pos="${s.position}" data-serial="${esc(inst.serial_number)}" data-part-name="${esc(p.name)}" data-pn="${esc(p.part_number)}">Replace</button>
                      <button class="slot-action ${isRma ? 'is-success' : 'is-danger'} slot-rma-btn" data-inst-id="${inst.id}" data-tagged="${isRma}">${isRma ? 'Untag RMA' : 'Tag RMA'}</button>
                      ${p.placement_mode === 'flexible' && p.quantity > 1
                        ? `<button class="slot-action slot-swap-btn" data-slot-id="${s.id}" data-part-id="${p.id}" data-pos="${s.position}" data-serial="${esc(inst.serial_number)}">Swap</button>`
                        : ''
                      }
                    `
                  }
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  async function renderHistoryTab(container, machine) {
    container.innerHTML = `<p class="loading">Loading event history for ${esc(machine.code)}...</p>`;
    try {
      const events = await listMaintenanceEvents({ machineId: machine.id, limit: 100 });
      if (!events.length) {
        container.innerHTML = emptyState(`No history recorded for ${machine.code}`, 'Maintenance actions taken on this machine will log here.');
        return;
      }

      container.innerHTML = `
        <div class="panel">
          <div class="panel-head">
            <h2 class="panel-title">Machine ${esc(machine.code)} maintenance log</h2>
            <a href="#/history?code=${encodeURIComponent(machine.code)}" class="small strong">Open in global history search &rarr;</a>
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Event type</th>
                  <th>Part &amp; position</th>
                  <th>Serial(s) involved</th>
                  <th>Technician</th>
                  <th>Reason / notes</th>
                </tr>
              </thead>
              <tbody>
                ${events.map(ev => {
                  const userName = ev.profiles ? ev.profiles.full_name : 'System';
                  const dateStr = new Date(ev.occurred_at).toLocaleString();
                  const oldSn = ev.old_instance ? ev.old_instance.serial_number : null;
                  const newSn = ev.new_instance ? ev.new_instance.serial_number : null;
                  const partName = ev.machine_parts ? ev.machine_parts.name : (ev.part_number || '—');

                  return `
                    <tr>
                      <td class="tiny mono muted nowrap">${dateStr}</td>
                      <td><span class="badge badge-muted">${esc(EVENT_LABELS[ev.event_type] || ev.event_type)}</span></td>
                      <td>
                        <span class="strong">${esc(partName)}</span>${ev.part_number ? copyButton(ev.part_number, 'Copy part number') : ''}
                        ${ev.position ? `<div class="tiny muted">Pos ${ev.position}</div>` : ''}
                      </td>
                      <td class="mono tiny break-all">
                        ${oldSn ? `<div class="text-danger mono">- ${esc(oldSn)}${copyButton(oldSn, 'Copy serial number')}</div>` : ''}
                        ${newSn ? `<div class="text-success mono">+ ${esc(newSn)}${copyButton(newSn, 'Copy serial number')}</div>` : ''}
                        ${!oldSn && !newSn ? '<span class="muted">&mdash;</span>' : ''}
                      </td>
                      <td class="small secondary">${esc(userName)}</td>
                      <td class="tiny secondary">
                        ${ev.reason ? `<div class="strong">${esc(ev.reason)}</div>` : ''}
                        ${ev.notes ? `<div class="muted italic">${esc(ev.notes)}</div>` : ''}
                        ${!ev.reason && !ev.notes ? '<span class="muted">&mdash;</span>' : ''}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = alertText(`Error loading machine history: ${esc(err.message)}`);
    }
  }

  // Offers the units of this part number that are already in stock, so a position
  // can be filled by picking a unit instead of retyping a serial number.
  async function mountUnitPicker(box, { partNumber, targetInput, rmaCheckbox = null }) {
    if (!box) return;

    box.innerHTML = '<p class="tiny muted">Checking stock for this part number...</p>';

    let units = [];
    let stockItem = null;
    try {
      [units, stockItem] = await Promise.all([
        listAvailableUnits(partNumber),
        findStockItemForPart(partNumber),
      ]);
    } catch {
      box.innerHTML = '<p class="tiny muted">Stock availability could not be loaded. You can still type a serial manually.</p>';
      return;
    }

    const stockLine = stockItem
      ? `From stock: <strong>${esc(stockItem.name)}</strong>${stockItem.location ? ` &middot; ${esc(stockItem.location)}` : ''}`
      : 'No stock item is registered for this part number yet.';

    if (!units.length) {
      box.innerHTML = `
        <div class="unit-picker-empty">
          <p class="small secondary">No units of ${esc(partNumber)} are in stock right now.</p>
          <p class="tiny muted mt-1">Type a serial below &mdash; a new unit will be created and tracked in stock.</p>
          <p class="tiny muted mt-1">${stockLine}</p>
        </div>
      `;
      return;
    }

    box.innerHTML = `
      <div class="unit-picker-head">
        <span class="small strong">${units.length} unit${units.length === 1 ? '' : 's'} in stock</span>
        <span class="tiny muted">${stockLine}</span>
      </div>
      <div class="unit-picker-list">
        ${units.map((unit, index) => `
          <label class="unit-option ${unit.doa ? 'is-disabled' : ''}" title="${unit.doa ? 'Marked DOA, it cannot be installed' : ''}">
            <input type="radio" name="unit-pick" value="${index}" ${unit.doa ? 'disabled' : ''}>
            <span class="unit-option-main">
              <span class="row">
                <span class="mono">${esc(unit.serial_number)}</span>
                ${unit.rma_tagged ? '<span class="badge badge-danger">RMA</span>' : ''}
                ${unit.doa ? '<span class="badge badge-danger">DOA</span>' : ''}
              </span>
              ${unit.notes ? `<span class="tiny muted">${esc(unit.notes)}</span>` : ''}
            </span>
            <span class="tiny muted nowrap">${esc(unit.storage_location || (stockItem ? stockItem.location : '') || 'Stock')}</span>
          </label>
        `).join('')}
      </div>
      <p class="tiny muted mt-2">Pick a unit to fill in the serial number below, or type a serial that is not in stock yet.</p>
    `;

    let autoTagged = false;

    box.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const unit = units[Number(radio.value)];
        if (!unit) return;
        targetInput.value = unit.serial_number;
        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        if (rmaCheckbox) {
          rmaCheckbox.checked = !!unit.rma_tagged;
          autoTagged = !!unit.rma_tagged;
        }
      });
    });

    targetInput.addEventListener('input', () => {
      const typed = targetInput.value.trim().toUpperCase();
      const stillSelected = units.some(u => u.serial_number.toUpperCase() === typed);
      if (stillSelected) return;
      box.querySelectorAll('input[type="radio"]:checked').forEach(radio => { radio.checked = false; });
      if (autoTagged && rmaCheckbox) {
        rmaCheckbox.checked = false;
        autoTagged = false;
      }
    });
  }

  function attachActionHandlers(container, machine, canManage, reload) {
    container.querySelectorAll('.edit-machine-part-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const part = machine.machine_parts.find(item => item.id === btn.dataset.partId);
        if (part) await openMachinePartEditor(part, machine, reload);
      });
    });

    container.querySelectorAll('.delete-machine-part-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const part = machine.machine_parts.find(item => item.id === btn.dataset.partId);
        if (part) await openMachinePartRemoval(part, machine, reload);
      });
    });

    container.querySelectorAll('.toggle-expand-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const partId = btn.dataset.partId;
        if (expandedParts.has(partId)) {
          expandedParts.delete(partId);
        } else {
          expandedParts.add(partId);
        }
        reload();
      });
    });

    container.querySelectorAll('.slot-fill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const slotId = btn.dataset.slotId;
        const pos = btn.dataset.pos;
        const partName = btn.dataset.partName;
        const partNumber = btn.dataset.pn;

        openModal({
          title: `Install serial &mdash; ${partName} (Pos ${pos})`,
          contentHtml: `
            <div class="field">
              <span class="label">Available units in stock</span>
              <div class="unit-picker" id="unit-picker"></div>
            </div>
            <div class="field">
              <label class="label" for="s-serial">Serial number *</label>
              <input class="input mono" id="s-serial" name="serial" required placeholder="e.g. SN-98124" style="text-transform:uppercase">
            </div>
            <div class="field">
              <label class="checkbox-row" for="s-rma">
                <input type="checkbox" id="s-rma" name="rma">
                <span class="label">Already damaged &mdash; tag RMA on install</span>
              </label>
            </div>
            <div class="field">
              <label class="label" for="s-notes">Technician markings / comments</label>
              <textarea class="textarea" id="s-notes" name="notes" placeholder="e.g. Marked with red tape by previous technician, pin slightly worn"></textarea>
            </div>
            <p class="error-text"></p>
          `,
          submitText: 'Install serial',
          onOpen: async (modal) => {
            const serialInput = modal.querySelector('#s-serial');
            serialInput.focus();
            await mountUnitPicker(modal.querySelector('#unit-picker'), {
              partNumber,
              targetInput: serialInput,
              rmaCheckbox: modal.querySelector('#s-rma'),
            });
          },
          onSubmit: async (form, close) => {
            const serial = form.serial.value;
            const rma = form.rma.checked;
            const notes = form.notes.value;
            await setSlotSerial({ slotId, serial, rma, notes });
            toast(`Serial ${serial} installed in position ${pos}.`);
            close();
            await reload();
          }
        });
      });
    });

    container.querySelectorAll('.slot-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const instanceId = btn.dataset.instId;
        const serial = btn.dataset.serial;
        const currentNotes = btn.dataset.notes;
        const pos = btn.dataset.pos;
        const partName = btn.dataset.partName;

        openModal({
          title: `Edit installed unit details &mdash; ${partName} (Pos ${pos})`,
          contentHtml: `
            <div class="field">
              <label class="label" for="eu-serial">Serial number *</label>
              <input class="input mono" id="eu-serial" name="serialNumber" required value="${esc(serial)}" style="text-transform:uppercase">
            </div>
            <div class="field">
              <label class="label" for="eu-notes">Technician markings / observations / comments</label>
              <textarea class="textarea" id="eu-notes" name="notes" placeholder="e.g. Pin 2 scratched, marked with green dot by technician B">${esc(currentNotes)}</textarea>
            </div>
            <p class="error-text"></p>
          `,
          submitText: 'Save markings',
          onSubmit: async (form, close) => {
            const serialNumber = form.serialNumber.value;
            const notes = form.notes.value;
            await updateSlotInstance({ instanceId, serialNumber, notes });
            toast(`Unit markings updated.`);
            close();
            await reload();
          }
        });
      });
    });

    container.querySelectorAll('.slot-replace-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const slotId = btn.dataset.slotId;
        const pos = btn.dataset.pos;
        const currentSerial = btn.dataset.serial;
        const partName = btn.dataset.partName;
        const partNumber = btn.dataset.pn;

        openModal({
          title: `Replace ${partName} (Pos ${pos} - ${currentSerial})`,
          contentHtml: `
            <div class="field">
              <span class="label">Outcome for the removed unit (${currentSerial}) *</span>
              <div class="stack-sm mt-1">
                <label class="checkbox-row">
                  <input type="radio" name="outcome" value="rma" checked>
                  <span><strong>Damaged &rarr; tag RMA</strong> <span class="muted">(returns to stock, flagged defective)</span></span>
                </label>
                <label class="checkbox-row">
                  <input type="radio" name="outcome" value="stock">
                  <span><strong>Working</strong> <span class="muted">(returns to stock as available)</span></span>
                </label>
                <label class="checkbox-row text-danger">
                  <input type="radio" name="outcome" value="scrapped">
                  <span><strong>Scrapped</strong> <span class="muted">(permanently decommissioned)</span></span>
                </label>
              </div>
            </div>

            <div class="field">
              <span class="label">Available units in stock</span>
              <div class="unit-picker" id="unit-picker"></div>
            </div>

            <div class="field">
              <label class="label" for="s-new-serial">Replacement serial number</label>
              <input class="input mono" id="s-new-serial" name="newSerial" placeholder="Leave empty if the position stays vacant" style="text-transform:uppercase">
            </div>

            <div class="field">
              <label class="label" for="s-reason">Reason for replacement</label>
              <input class="input" id="s-reason" name="reason" placeholder="e.g. Malfunction during check, worn contact">
            </div>

            <div class="field">
              <label class="label" for="s-notes">Technician markings / notes</label>
              <textarea class="textarea" id="s-notes" name="notes"></textarea>
            </div>
            <p class="error-text"></p>
          `,
          submitText: 'Confirm replacement',
          onOpen: async (modal) => {
            await mountUnitPicker(modal.querySelector('#unit-picker'), {
              partNumber,
              targetInput: modal.querySelector('#s-new-serial'),
            });
          },
          onSubmit: async (form, close) => {
            const outcome = form.querySelector('input[name="outcome"]:checked').value;
            const newSerial = form.newSerial.value;
            const reason = form.reason.value;
            const notes = form.notes.value;

            await replaceSerializedPart({ slotId, outcome, newSerial, reason, notes });
            toast(`Replacement recorded for position ${pos}.`);
            close();
            await reload();
          }
        });
      });
    });

    container.querySelectorAll('.slot-rma-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const instanceId = btn.dataset.instId;
        const currentlyTagged = btn.dataset.tagged === 'true';
        const actionLabel = currentlyTagged ? 'Untag RMA' : 'Tag RMA';

        openModal({
          title: `${actionLabel} unit`,
          contentHtml: `
            <p>Are you sure you want to ${actionLabel.toLowerCase()} this unit?</p>
            <div class="field mt-4">
              <label class="label" for="rma-note">Reason / note</label>
              <input class="input" id="rma-note" name="note" placeholder="e.g. Reported defective to client vendor">
            </div>
            <p class="error-text"></p>
          `,
          submitText: actionLabel,
          danger: !currentlyTagged,
          onSubmit: async (form, close) => {
            const note = form.note.value;
            await setRmaTag({ instanceId, tagged: !currentlyTagged, note });
            toast(`Unit RMA tag updated.`);
            close();
            await reload();
          }
        });
      });
    });

    container.querySelectorAll('.slot-swap-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const slotA = btn.dataset.slotId;
        const partId = btn.dataset.partId;
        const posA = btn.dataset.pos;
        const serialA = btn.dataset.serial;

        const part = machine.machine_parts.find(p => p.id === partId);
        const otherSlots = (part ? part.machine_slots : []).filter(s => s.id !== slotA && s.instance_id);

        if (!otherSlots.length) {
          toast('No other occupied position available to swap with.', 'error');
          return;
        }

        openModal({
          title: `Swap positions &mdash; Pos ${posA} (${serialA})`,
          contentHtml: `
            <div class="field">
              <label class="label" for="swap-target">Select target position *</label>
              <select class="select" id="swap-target" name="slotB" required>
                ${otherSlots.map(s => `
                  <option value="${s.id}">Pos ${s.position} (${esc(s.part_instances.serial_number)})</option>
                `).join('')}
              </select>
            </div>
            <div class="field">
              <label class="label" for="swap-notes">Swap notes</label>
              <input class="input" id="swap-notes" name="notes" placeholder="e.g. Swapped for diagnostic testing">
            </div>
            <p class="error-text"></p>
          `,
          submitText: 'Swap serials',
          onSubmit: async (form, close) => {
            const slotB = form.slotB.value;
            const notes = form.notes.value;
            await swapParts({ slotA, slotB, notes });
            toast(`Swapped serials successfully.`);
            close();
            await reload();
          }
        });
      });
    });

    container.querySelectorAll('.replace-non-ser-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const machinePartId = btn.dataset.partId;
        const name = btn.dataset.name;

        openModal({
          title: `Replace non-serialized part: ${name}`,
          contentHtml: `
            <p class="small secondary mb-4">Replacing this part decrements stock by 1 piece and logs a replacement event.</p>
            <div class="field">
              <label class="label" for="ns-reason">Reason</label>
              <input class="input" id="ns-reason" name="reason" placeholder="e.g. Scheduled maintenance replacement">
            </div>
            <div class="field">
              <label class="label" for="ns-notes">Notes</label>
              <textarea class="textarea" id="ns-notes" name="notes"></textarea>
            </div>
            <p class="error-text"></p>
          `,
          submitText: 'Record replacement',
          onSubmit: async (form, close) => {
            const reason = form.reason.value;
            const notes = form.notes.value;
            await replaceNonSerializedPart({ machinePartId, reason, notes });
            toast(`Replaced ${name}.`);
            close();
            await reload();
          }
        });
      });
    });
  }

  async function getMatchingTemplateTypes(machine, part) {
    if (![ROLES.ADMIN, ROLES.MANAGER].includes(ctx.profile.role)) return [];
    const types = await listMachineTypes();
    const otherTypes = types.filter(type => type.id !== machine.machine_type_id);
    const existing = await listTemplatePartAvailability({
      machineTypeIds: otherTypes.map(type => type.id),
      module: part.module,
      partNumber: part.part_number,
    });
    const existingIds = new Set(existing.map(row => row.machine_type_id));
    return otherTypes.filter(type => existingIds.has(type.id));
  }

  function renderTemplateChoices(types) {
    return types.map(type => `
      <label class="checkbox-row small">
        <input type="checkbox" name="templateTypeIds" value="${type.id}">
        <span>${esc(type.name)}</span>
      </label>
    `).join('');
  }

  async function openMachinePartEditor(part, machine, reload) {
    const templateTypes = await getMatchingTemplateTypes(machine, part);
    openModal({
      title: `Edit part &mdash; ${part.name}`,
      contentHtml: `
        <div class="field">
          <label class="label" for="mp-name">Part name *</label>
          <input class="input" id="mp-name" name="name" required value="${esc(part.name)}">
        </div>
        <div class="field">
          <label class="label" for="mp-pn">Part number *</label>
          <input class="input mono" id="mp-pn" name="partNumber" required value="${esc(part.part_number)}" style="text-transform:uppercase">
        </div>
        <div class="field">
          <label class="label" for="mp-qty">Quantity per machine *</label>
          <input class="input" id="mp-qty" name="quantity" type="number" min="1" required value="${part.quantity}">
        </div>
        <div class="field">
          <label class="label" for="mp-placement">Placement mode *</label>
          <select class="select" id="mp-placement" name="placementMode">
            <option value="flexible" ${part.placement_mode === 'flexible' ? 'selected' : ''}>Flexible</option>
            <option value="fixed" ${part.placement_mode === 'fixed' ? 'selected' : ''}>Fixed</option>
          </select>
        </div>
        <div class="field">
          <label class="checkbox-row" for="mp-rma">
            <input type="checkbox" id="mp-rma" name="rmaApplicable" ${part.rma_applicable ? 'checked' : ''}>
            <span class="label">RMA applicable</span>
          </label>
        </div>
        ${templateTypes.length ? `
          <div class="field-box">
            <label class="checkbox-row" for="mp-sync">
              <input type="checkbox" id="mp-sync" name="syncTemplates">
              <span class="label">Apply these edits to other templates containing this part</span>
            </label>
            <div id="mp-template-list" class="hidden stack-sm">${renderTemplateChoices(templateTypes)}</div>
          </div>
        ` : ''}
        <p class="error-text"></p>
      `,
      submitText: 'Save part',
      onOpen: modal => {
        mountPartPicker(modal.querySelector('#mp-pn'), { target: modal.querySelector('#mp-name') });
        const sync = modal.querySelector('#mp-sync');
        const list = modal.querySelector('#mp-template-list');
        if (sync) sync.addEventListener('change', () => list.classList.toggle('hidden', !sync.checked));
      },
      onSubmit: async (form, close) => {
        const templateTypeIds = [...form.querySelectorAll('input[name="templateTypeIds"]:checked')].map(input => input.value);
        await updateMachinePart({
          machinePartId: part.id,
          name: form.name.value,
          partNumber: form.partNumber.value,
          quantity: form.quantity.value,
          placementMode: form.placementMode.value,
          rmaApplicable: form.rmaApplicable.checked,
          templateTypeIds,
        });
        toast(`Part "${form.name.value}" updated.`);
        close();
        await reload();
      }
    });
  }

  async function openMachinePartRemoval(part, machine, reload) {
    const occupied = (part.machine_slots || []).some(slot => slot.instance_id);
    if (occupied) {
      toast(`Remove installed serials from "${part.name}" before removing the part.`, 'error');
      return;
    }
    const templateTypes = await getMatchingTemplateTypes(machine, part);
    openModal({
      title: `Remove part &mdash; ${part.name}`,
      danger: true,
      submitText: 'Remove part',
      contentHtml: `
        <p>Remove <strong>${esc(part.name)}</strong> (${esc(part.part_number)}) from this machine?</p>
        ${templateTypes.length ? `
          <div class="field-box mt-4">
            <label class="checkbox-row" for="mp-delete-sync">
              <input type="checkbox" id="mp-delete-sync" name="syncTemplates">
              <span class="label">Also remove it from other templates containing this part</span>
            </label>
            <div id="mp-delete-template-list" class="hidden stack-sm">${renderTemplateChoices(templateTypes)}</div>
          </div>
        ` : ''}
        <p class="small muted mt-3">Installed serials must be removed before the part definition can be deleted.</p>
        <p class="error-text"></p>
      `,
      submitText: 'Remove Part',
      onOpen: modal => {
        const sync = modal.querySelector('#mp-delete-sync');
        const list = modal.querySelector('#mp-delete-template-list');
        if (sync) sync.addEventListener('change', () => list.classList.toggle('hidden', !sync.checked));
      },
      onSubmit: async (form, close) => {
        const templateTypeIds = [...form.querySelectorAll('input[name="templateTypeIds"]:checked')].map(input => input.value);
        await deleteMachinePart({ machinePartId: part.id, templateTypeIds });
        toast(`Part "${part.name}" removed.`);
        close();
        await reload();
      }
    });
  }

  await loadAndRender();
}
