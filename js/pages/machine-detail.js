import { getMachineByCode, updateMachine, deleteMachine, listMachineTypes, listTemplatePartAvailability } from '../api/machines.js';
import { addPartToMachine, updateMachinePart, deleteMachinePart, setSlotSerial, updateSlotInstance, replaceSerializedPart, replaceNonSerializedPart, swapParts, setRmaTag } from '../api/parts.js';
import { listMaintenanceEvents } from '../api/history.js';
import { pageHeader, emptyState, esc } from '../components/ui.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { ROLES } from '../auth.js';
import { copyButton } from '../components/input-enhancements.js';

const STATUS_BADGE_CLASSES = {
  operational: 'badge-accent',
  degraded: 'badge-alert',
  down: 'badge-alert font-bold',
  decommissioned: 'badge text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-400',
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

  container.innerHTML = `<div class="p-8 text-center text-gray-500 font-medium">Loading machine ${esc(machineCode)}...</div>`;

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
      ${canManage ? `<button id="btn-add-part" class="btn btn-secondary btn-sm">+ Add part</button>` : ''}
      ${canManage ? `<button id="btn-edit-machine" class="btn btn-ghost btn-sm">Edit</button>` : ''}
      ${isGlobal ? `<button id="btn-delete-machine" class="btn btn-ghost btn-sm text-red-700">Delete</button>` : ''}
    `;

    const subText = `${machine.type_name} &bull; ${machine.team_name} ${machine.location ? `&bull; ${esc(machine.location)}` : ''}`;

    container.innerHTML = `
      <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-3">
            <h1 class="page-title font-mono font-bold">${esc(machine.code)}</h1>
            <span class="badge ${STATUS_BADGE_CLASSES[machine.status] || ''}">
              ${esc(STATUS_LABELS[machine.status] || machine.status)}
            </span>
          </div>
          <p class="page-sub">${subText}</p>
        </div>
        <div class="page-actions">${headerActions}</div>
      </div>

      <div class="border-b border-gray-200 mb-6 flex gap-6">
        <button class="view-tab-btn py-2.5 border-b-2 font-semibold text-sm ${activeTab === 'parts' ? 'text-accent border-accent' : 'text-gray-500 border-transparent hover:text-gray-900'}" data-tab="parts">
          Modules & Installed Parts
        </button>
        <button class="view-tab-btn py-2.5 border-b-2 font-semibold text-sm ${activeTab === 'history' ? 'text-accent border-accent' : 'text-gray-500 border-transparent hover:text-gray-900'}" data-tab="history">
          Machine History Log
        </button>
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
            <p class="text-sm text-gray-500 mt-2">All installed parts structure for this machine will be removed. Historical event logs will remain preserved.</p>
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
          title: `Edit Machine Details (${machine.code})`,
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
          submitText: 'Save Machine',
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
          title: `Add Part to Machine ${machine.code}`,
          contentHtml: `
            <div class="field">
              <label class="label" for="ap-module">Module *</label>
              <select class="select" id="ap-module" name="module" required>
                <option value="input">Input Module</option>
                <option value="scanner">Scanner Module</option>
                <option value="output">Output Module</option>
              </select>
            </div>
            <div class="field">
              <label class="label" for="ap-name">Part Name *</label>
              <input class="input" id="ap-name" name="name" required placeholder="e.g. Motor Drive">
            </div>
            <div class="field">
              <label class="label" for="ap-pn">Part Number *</label>
              <input class="input font-mono" id="ap-pn" name="partNumber" required placeholder="e.g. MOT-001" style="text-transform:uppercase">
            </div>
            <div class="field flex items-center gap-3">
              <input type="checkbox" id="ap-serialized" name="serialized" checked>
              <label class="label mb-0 cursor-pointer" for="ap-serialized">Serialized</label>
            </div>
            <div class="field">
              <label class="label" for="ap-qty">Quantity per machine *</label>
              <input class="input" id="ap-qty" name="quantity" type="number" min="1" value="1" required>
            </div>
            <div class="field">
              <label class="label" for="ap-placement">Placement Mode *</label>
              <select class="select" id="ap-placement" name="placementMode">
                <option value="flexible">Flexible</option>
                <option value="fixed">Fixed</option>
              </select>
            </div>
            <div class="field flex items-center gap-3">
              <input type="checkbox" id="ap-rma" name="rmaApplicable" checked>
              <label class="label mb-0 cursor-pointer" for="ap-rma">RMA applicable</label>
            </div>
            ${isGlobal ? `
              <div class="field border border-gray-200 rounded-md p-3">
                <div class="flex items-center gap-3">
                  <input type="checkbox" id="ap-sync-templates" name="syncTemplates">
                  <label class="label mb-0 cursor-pointer" for="ap-sync-templates">This part is also present in other machine types</label>
                </div>
                <div id="ap-template-types" class="hidden mt-3 space-y-2">
                  <p class="text-xs text-gray-500">Select the other templates that should include this part. Existing definitions are shown automatically and will not be duplicated.</p>
                  <div id="ap-template-type-list" class="space-y-2"></div>
                </div>
              </div>
            ` : ''}
            <p class="error-text"></p>
          `,
          submitText: 'Add Part to Machine',
          onOpen: async (modal) => {
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
                      <label class="flex items-center gap-2 text-sm ${alreadyPresent ? 'text-gray-500' : ''}">
                        <input type="checkbox" name="templateTypeIds" value="${type.id}" ${alreadyPresent ? 'checked disabled' : ''}>
                        <span>${esc(type.name)}${alreadyPresent ? ' (already contains this part)' : ''}</span>
                      </label>
                    `;
                  }).join('')
                : '<p class="text-xs text-gray-500">No other machine types are available.</p>';
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
      <div class="space-y-8">
        ${MODULE_KEYS.map(modKey => {
          const parts = partsByModule[modKey];
          return `
            <div class="panel bg-white shadow-sm border border-gray-200">
              <div class="flex items-center justify-between border-b border-gray-200 pb-3 mb-4">
                <h2 class="text-lg font-semibold m-0 flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full ${parts.length ? 'bg-orange-500' : 'bg-gray-300'}"></span>
                  ${MODULE_TITLES[modKey]}
                </h2>
                <span class="text-xs text-gray-500 font-medium">${parts.length} part type${parts.length === 1 ? '' : 's'}</span>
              </div>

              ${!parts.length
                ? `<div class="p-6 text-center text-gray-400 text-sm italic">No parts added to ${modKey} module yet.</div>`
                : `
                  <div class="space-y-6">
                    ${parts.map(p => {
                      const slots = p.machine_slots || [];
                      const installedCount = slots.filter(s => s.instance_id).length;
                      const isExpanded = expandedParts.has(p.id);

                      return `
                        <div class="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
                          <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
                            <div class="flex items-center gap-2 flex-wrap">
                              <span class="font-semibold text-base text-gray-900">${esc(p.name)}</span>
                              <span class="mono badge badge-solid text-xs">${esc(p.part_number)}</span>${copyButton(p.part_number, 'Copy part number')}
                              ${p.serialized
                                ? `<span class="badge badge-accent text-xs">Serialized (${installedCount}/${p.quantity} installed, ${p.placement_mode})</span>`
                                : `<span class="badge text-xs text-gray-600">Non-serialized (${p.quantity} pcs)</span>`
                              }
                            </div>

                            <div class="flex items-center gap-2">
                              ${canManage ? `
                                <button class="btn btn-ghost btn-sm text-xs edit-machine-part-btn" data-part-id="${p.id}">Edit part</button>
                                <button class="btn btn-ghost btn-sm text-xs text-red-700 delete-machine-part-btn" data-part-id="${p.id}">Remove part</button>
                              ` : ''}
                              ${p.serialized
                                ? `<button class="btn btn-ghost btn-sm text-xs toggle-expand-btn" data-part-id="${p.id}">
                                    ${isExpanded ? '▲ Collapse Positions' : `▼ Expand Positions (${installedCount}/${p.quantity})`}
                                  </button>`
                                : (canManage
                                    ? `<button class="btn btn-secondary btn-sm replace-non-ser-btn" data-part-id="${p.id}" data-name="${esc(p.name)}">Replace Part</button>`
                                    : '')
                              }
                            </div>
                          </div>

                          ${p.serialized
                            ? (isExpanded
                                ? renderSlotGrid(p, canManage)
                                : `<div class="text-xs text-gray-500 bg-white p-2.5 rounded border border-gray-200 flex items-center justify-between cursor-pointer toggle-expand-btn" data-part-id="${p.id}">
                                    <span>${installedCount} of ${p.quantity} positions occupied. Click expand to view/edit serials & markings.</span>
                                    <span class="text-accent font-medium">Expand &rarr;</span>
                                   </div>`
                              )
                            : `<div class="text-sm text-gray-600 bg-white p-3 rounded border border-gray-200">Standard non-serialized part.</div>`
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
      <div class="slot-grid mt-3">
        ${slots.map(s => {
          const inst = s.part_instances;
          const isEmpty = !inst;
          const isRma = inst && inst.rma_tagged;

          return `
            <div class="slot ${isEmpty ? 'slot-empty' : (isRma ? 'slot-rma' : 'bg-white')} flex flex-col justify-between min-h-[120px]">
              <div>
                <div class="flex items-center justify-between text-xs text-gray-500 font-medium">
                  <span>Pos ${s.position}</span>
                  ${isRma ? '<span class="badge badge-alert text-[11px] px-1 py-0 font-bold">RMA</span>' : ''}
                </div>
                ${isEmpty
                  ? `<span class="slot-serial text-gray-400 italic text-xs mt-2">Empty</span>`
                  : `
                    <span class="slot-serial mono font-semibold text-sm mt-1 text-gray-900 break-all">${esc(inst.serial_number)}${copyButton(inst.serial_number, 'Copy serial number')}</span>
                    ${inst.notes ? `<div class="text-[11px] text-amber-900 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-200 p-1 rounded mt-1.5 border border-amber-300 dark:border-amber-900 leading-tight">${esc(inst.notes)}</div>` : ''}
                  `
                }
              </div>

              ${canManage ? `
                <div class="flex flex-wrap gap-1 mt-3 pt-2 border-t border-gray-100">
                  ${isEmpty
                    ? `<button class="btn btn-ghost btn-sm text-accent text-xs p-1 h-auto slot-fill-btn" data-slot-id="${s.id}" data-pos="${s.position}" data-part-name="${esc(p.name)}">+ Serial</button>`
                    : `
                      <button class="btn btn-ghost btn-sm text-xs p-1 h-auto text-blue-700 slot-edit-btn" data-inst-id="${inst.id}" data-serial="${esc(inst.serial_number)}" data-notes="${esc(inst.notes || '')}" data-pos="${s.position}" data-part-name="${esc(p.name)}">Edit/Marking</button>
                      <button class="btn btn-ghost btn-sm text-xs p-1 h-auto slot-replace-btn" data-slot-id="${s.id}" data-pos="${s.position}" data-serial="${esc(inst.serial_number)}" data-part-name="${esc(p.name)}">Replace</button>
                      <button class="btn btn-ghost btn-sm text-xs p-1 h-auto ${isRma ? 'text-green-700' : 'text-red-700'} slot-rma-btn" data-inst-id="${inst.id}" data-tagged="${isRma}">${isRma ? 'Untag RMA' : 'Tag RMA'}</button>
                      ${p.placement_mode === 'flexible' && p.quantity > 1
                        ? `<button class="btn btn-ghost btn-sm text-xs p-1 h-auto text-gray-600 slot-swap-btn" data-slot-id="${s.id}" data-part-id="${p.id}" data-pos="${s.position}" data-serial="${esc(inst.serial_number)}">Swap</button>`
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
    container.innerHTML = `<div class="p-6 text-center text-gray-400 text-sm">Loading event history for ${esc(machine.code)}...</div>`;
    try {
      const events = await listMaintenanceEvents({ machineId: machine.id, limit: 100 });
      if (!events.length) {
        container.innerHTML = emptyState(`No history recorded for ${machine.code}`, 'Maintenance actions taken on this machine will log here.');
        return;
      }

      container.innerHTML = `
        <div class="panel bg-white">
          <div class="flex items-center justify-between mb-4 pb-2 border-b border-gray-200">
            <h2 class="text-base font-semibold m-0">Machine ${esc(machine.code)} Maintenance Log</h2>
            <a href="#/history?code=${encodeURIComponent(machine.code)}" class="text-xs text-accent font-medium hover:underline">Open in Global History Search &rarr;</a>
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Event Type</th>
                  <th>Part & Position</th>
                  <th>Serial(s) Involved</th>
                  <th>Technician</th>
                  <th>Reason / Notes</th>
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
                      <td class="text-xs text-gray-500 whitespace-nowrap">${dateStr}</td>
                      <td><span class="badge badge-solid text-xs">${esc(EVENT_LABELS[ev.event_type] || ev.event_type)}</span></td>
                      <td>
                        <span class="font-semibold text-gray-900">${esc(partName)}${ev.part_number ? copyButton(ev.part_number, 'Copy part number') : ''}</span>
                        ${ev.position ? `<span class="text-xs text-gray-500 block">Pos ${ev.position}</span>` : ''}
                      </td>
                      <td class="mono text-xs">
                        ${oldSn ? `<div class="text-red-700 font-semibold">- ${esc(oldSn)}${copyButton(oldSn, 'Copy serial number')}</div>` : ''}
                        ${newSn ? `<div class="text-green-700 font-semibold">+ ${esc(newSn)}${copyButton(newSn, 'Copy serial number')}</div>` : ''}
                        ${!oldSn && !newSn ? '<span class="text-gray-400">—</span>' : ''}
                      </td>
                      <td class="text-sm font-medium">${esc(userName)}</td>
                      <td class="text-xs text-gray-600">
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
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded border border-red-200">Error loading machine history: ${esc(err.message)}</div>`;
    }
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

        openModal({
          title: `Install Serial — ${partName} (Pos ${pos})`,
          contentHtml: `
            <div class="field">
              <label class="label" for="s-serial">Serial Number *</label>
              <input class="input font-mono" id="s-serial" name="serial" required placeholder="e.g. SN-98124" style="text-transform:uppercase">
            </div>
            <div class="field flex items-center gap-3">
              <input type="checkbox" id="s-rma" name="rma">
              <label class="label mb-0 cursor-pointer text-red-700 font-medium" for="s-rma">Already damaged / Tag RMA on install</label>
            </div>
            <div class="field">
              <label class="label" for="s-notes">Technician Markings / Comments</label>
              <textarea class="textarea" id="s-notes" name="notes" placeholder="e.g. Marked with red tape by previous technician, pin slightly worn..."></textarea>
            </div>
            <p class="error-text"></p>
          `,
          submitText: 'Install Serial',
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
          title: `Edit Installed Unit Details — ${partName} (Pos ${pos})`,
          contentHtml: `
            <div class="field">
              <label class="label" for="eu-serial">Serial Number *</label>
              <input class="input font-mono" id="eu-serial" name="serialNumber" required value="${esc(serial)}" style="text-transform:uppercase">
            </div>
            <div class="field">
              <label class="label" for="eu-notes">Technician Markings / Observations / Comments</label>
              <textarea class="textarea" id="eu-notes" name="notes" placeholder="e.g. Pin #2 scratched, marked with green dot by Tech B...">${esc(currentNotes)}</textarea>
            </div>
            <p class="error-text"></p>
          `,
          submitText: 'Save Markings',
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

        openModal({
          title: `Replace ${partName} (Pos ${pos} - ${currentSerial})`,
          contentHtml: `
            <div class="field">
              <label class="label">Outcome for removed unit (${currentSerial}) *</label>
              <div class="space-y-2 mt-1">
                <label class="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="outcome" value="rma" checked>
                  <span><strong>Damaged &rarr; Tag RMA</strong> (returns to stock, flagged defective)</span>
                </label>
                <label class="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="outcome" value="stock">
                  <span><strong>Working</strong> (returns to stock as available)</span>
                </label>
                <label class="flex items-center gap-2 text-sm cursor-pointer text-red-700">
                  <input type="radio" name="outcome" value="scrapped">
                  <span><strong>Scrapped</strong> (permanently decommissioned)</span>
                </label>
              </div>
            </div>

            <div class="field border-t border-gray-200 pt-4 mt-4">
              <label class="label" for="s-new-serial">Replacement Serial Number</label>
              <input class="input font-mono" id="s-new-serial" name="newSerial" placeholder="Enter new serial (leave empty if position stays vacant)" style="text-transform:uppercase">
            </div>

            <div class="field">
              <label class="label" for="s-reason">Reason for Replacement</label>
              <input class="input" id="s-reason" name="reason" placeholder="e.g. Malfunction during check, worn contact">
            </div>

            <div class="field">
              <label class="label" for="s-notes">Technician Markings / Notes</label>
              <textarea class="textarea" id="s-notes" name="notes"></textarea>
            </div>
            <p class="error-text"></p>
          `,
          submitText: 'Confirm Replacement',
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
          title: `${actionLabel} Unit`,
          contentHtml: `
            <p>Are you sure you want to ${actionLabel.toLowerCase()} this unit?</p>
            <div class="field mt-4">
              <label class="label" for="rma-note">Reason / Note</label>
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
          title: `Swap Positions — Pos ${posA} (${serialA})`,
          contentHtml: `
            <div class="field">
              <label class="label" for="swap-target">Select Target Position *</label>
              <select class="select" id="swap-target" name="slotB" required>
                ${otherSlots.map(s => `
                  <option value="${s.id}">Pos ${s.position} (${esc(s.part_instances.serial_number)})</option>
                `).join('')}
              </select>
            </div>
            <div class="field">
              <label class="label" for="swap-notes">Swap Notes</label>
              <input class="input" id="swap-notes" name="notes" placeholder="e.g. Swapped for diagnostic testing">
            </div>
            <p class="error-text"></p>
          `,
          submitText: 'Swap Serials',
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
          title: `Replace Non-Serialized Part: ${name}`,
          contentHtml: `
            <p class="text-sm text-gray-600 mb-4">Replacing this part will decrement stock by 1 piece and log a replacement event.</p>
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
          submitText: 'Record Replacement',
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
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" name="templateTypeIds" value="${type.id}">
        <span>${esc(type.name)}</span>
      </label>
    `).join('');
  }

  async function openMachinePartEditor(part, machine, reload) {
    const templateTypes = await getMatchingTemplateTypes(machine, part);
    openModal({
      title: `Edit Part — ${part.name}`,
      contentHtml: `
        <div class="field">
          <label class="label" for="mp-name">Part Name *</label>
          <input class="input" id="mp-name" name="name" required value="${esc(part.name)}">
        </div>
        <div class="field">
          <label class="label" for="mp-pn">Part Number *</label>
          <input class="input font-mono" id="mp-pn" name="partNumber" required value="${esc(part.part_number)}" style="text-transform:uppercase">
        </div>
        <div class="field">
          <label class="label" for="mp-qty">Quantity per machine *</label>
          <input class="input" id="mp-qty" name="quantity" type="number" min="1" required value="${part.quantity}">
        </div>
        <div class="field">
          <label class="label" for="mp-placement">Placement Mode *</label>
          <select class="select" name="placementMode">
            <option value="flexible" ${part.placement_mode === 'flexible' ? 'selected' : ''}>Flexible</option>
            <option value="fixed" ${part.placement_mode === 'fixed' ? 'selected' : ''}>Fixed</option>
          </select>
        </div>
        <div class="field flex items-center gap-3">
          <input type="checkbox" name="rmaApplicable" ${part.rma_applicable ? 'checked' : ''}>
          <label class="label mb-0 cursor-pointer">RMA applicable</label>
        </div>
        ${templateTypes.length ? `
          <div class="field border border-gray-200 rounded-md p-3">
            <div class="flex items-center gap-3">
              <input type="checkbox" id="mp-sync" name="syncTemplates">
              <label class="label mb-0 cursor-pointer" for="mp-sync">Apply these edits to other templates containing this part</label>
            </div>
            <div id="mp-template-list" class="hidden mt-3 space-y-2">${renderTemplateChoices(templateTypes)}</div>
          </div>
        ` : ''}
        <p class="error-text"></p>
      `,
      submitText: 'Save Part',
      onOpen: modal => {
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
      title: `Remove Part — ${part.name}`,
      danger: true,
      contentHtml: `
        <p>Remove <strong>${esc(part.name)}</strong> (${esc(part.part_number)}) from this machine?</p>
        ${templateTypes.length ? `
          <div class="field border border-gray-200 rounded-md p-3 mt-4">
            <div class="flex items-center gap-3">
              <input type="checkbox" id="mp-delete-sync" name="syncTemplates">
              <label class="label mb-0 cursor-pointer" for="mp-delete-sync">Also remove it from other templates containing this part</label>
            </div>
            <div id="mp-delete-template-list" class="hidden mt-3 space-y-2">${renderTemplateChoices(templateTypes)}</div>
          </div>
        ` : ''}
        <p class="text-sm text-gray-500 mt-3">Serialized units must be removed before the part definition can be deleted.</p>
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
