import {
  listMachineTypes,
  createMachineType,
  listTypeTemplates,
  createTypeTemplate,
  updateTypeTemplate,
  deleteTypeTemplate,
} from '../api/machines.js';
import { pageHeader, emptyState, esc } from '../components/ui.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { ROLES } from '../auth.js';

export async function render(container, params, ctx) {
  const isGlobal = [ROLES.ADMIN, ROLES.MANAGER].includes(ctx.profile.role);
  if (!isGlobal) {
    container.innerHTML = emptyState('Access Denied', 'Only Admins and Maintenance Managers can access Settings.');
    return;
  }

  container.innerHTML = pageHeader('Settings', 'Manage machine types and template definitions for new machines.') + `
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <div class="lg:col-span-1">
        <div class="panel">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold m-0">Machine Types</h2>
            <button id="btn-add-type" class="btn btn-ghost btn-sm text-accent">+ New</button>
          </div>
          <div id="types-list" class="space-y-1"><p class="text-gray-400 text-sm">Loading types...</p></div>
        </div>
      </div>

      <div class="lg:col-span-3">
        <div class="panel">
          <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <h2 id="template-title" class="text-xl font-semibold m-0">Type Template</h2>
              <p class="text-sm text-gray-500 mt-1">Part definitions automatically copied when creating a machine of this type.</p>
            </div>
            <button id="btn-add-template-part" class="btn btn-primary btn-sm" disabled>+ Add template part</button>
          </div>
          <div id="templates-container"><p class="text-gray-400 text-sm">Select a machine type to view its template parts.</p></div>
        </div>
      </div>
    </div>
  `;

  let machineTypes = [];
  let selectedTypeId = null;

  async function loadTypes() {
    const listEl = container.querySelector('#types-list');
    try {
      machineTypes = await listMachineTypes();
      if (!machineTypes.length) {
        listEl.innerHTML = `<p class="text-gray-400 text-sm">No machine types configured.</p>`;
        return;
      }

      if (!selectedTypeId && machineTypes.length > 0) {
        selectedTypeId = machineTypes[0].id;
      }

      listEl.innerHTML = machineTypes.map(t => `
        <button class="type-item-btn w-full text-left px-3 py-2.5 rounded-md font-medium text-sm transition flex items-center justify-between ${t.id === selectedTypeId ? 'bg-orange-50 text-orange-900 border border-orange-200' : 'hover:bg-gray-100 text-gray-700'}" data-id="${t.id}">
          <span>${esc(t.name)}</span>
          ${t.id === selectedTypeId ? '<span class="w-2 h-2 rounded-full bg-accent"></span>' : ''}
        </button>
      `).join('');

      listEl.querySelectorAll('.type-item-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedTypeId = btn.dataset.id;
          loadTypes();
          loadTemplates();
        });
      });
    } catch (err) {
      listEl.innerHTML = `<p class="text-red-500 text-sm">Error: ${esc(err.message)}</p>`;
    }
  }

  async function loadTemplates() {
    const addBtn = container.querySelector('#btn-add-template-part');
    const containerEl = container.querySelector('#templates-container');
    const titleEl = container.querySelector('#template-title');

    if (!selectedTypeId) {
      addBtn.disabled = true;
      containerEl.innerHTML = emptyState('No machine type selected', 'Select a type from the left menu.');
      return;
    }

    addBtn.disabled = false;
    const currentType = machineTypes.find(t => t.id === selectedTypeId);
    if (currentType) {
      titleEl.textContent = `${currentType.name} Template Parts`;
    }

    try {
      const parts = await listTypeTemplates(selectedTypeId);
      if (!parts.length) {
        containerEl.innerHTML = emptyState(
          'No template parts defined',
          `Add default parts for ${currentType ? currentType.name : 'this type'}.`,
          `<button id="btn-add-part-empty" class="btn btn-primary btn-sm">+ Add first template part</button>`
        );
        const emptyBtn = containerEl.querySelector('#btn-add-part-empty');
        if (emptyBtn) emptyBtn.addEventListener('click', handleAddPart);
        return;
      }

      const modules = ['input', 'scanner', 'output'];
      const MODULE_LABELS = { input: 'Input Module', scanner: 'Scanner Module', output: 'Output Module' };

      containerEl.innerHTML = modules.map(modKey => {
        const modParts = parts.filter(p => p.module === modKey);
        return `
          <div class="mb-8 last:mb-0">
            <h3 class="text-base font-semibold border-b border-gray-200 pb-2 mb-4 text-gray-800">${MODULE_LABELS[modKey]}</h3>
            ${!modParts.length
              ? `<p class="text-xs text-gray-400 italic">No parts in ${modKey} module.</p>`
              : `
                <div class="table-wrap">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Part Name</th>
                        <th>Part Number</th>
                        <th>Serialized</th>
                        <th>Qty / Machine</th>
                        <th>Placement</th>
                        <th>RMA Applicable</th>
                        <th class="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${modParts.map(p => `
                        <tr>
                          <td class="font-semibold">${esc(p.name)}</td>
                          <td class="mono font-semibold text-gray-700">${esc(p.part_number)}</td>
                          <td>
                            ${p.serialized
                              ? '<span class="badge badge-accent">Serialized</span>'
                              : '<span class="badge text-gray-500 bg-gray-100">Non-serialized</span>'
                            }
                          </td>
                          <td class="mono">${p.quantity}</td>
                          <td class="capitalize text-sm">${p.placement_mode}</td>
                          <td>${p.rma_applicable ? 'Yes' : 'No'}</td>
                          <td class="text-right">
                            <button class="btn btn-ghost btn-sm edit-part-btn" data-id="${p.id}" data-json="${esc(JSON.stringify(p))}">Edit</button>
                            <button class="btn btn-ghost btn-sm btn-danger delete-part-btn" data-id="${p.id}" data-name="${esc(p.name)}">Delete</button>
                          </td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              `
            }
          </div>
        `;
      }).join('');

      containerEl.querySelectorAll('.edit-part-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          handleEditPart(JSON.parse(btn.dataset.json));
        });
      });

      containerEl.querySelectorAll('.delete-part-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          handleDeletePart(btn.dataset.id, btn.dataset.name);
        });
      });
    } catch (err) {
      containerEl.innerHTML = `<p class="text-red-500 text-sm">Failed to load template parts: ${esc(err.message)}</p>`;
    }
  }

  function handleAddType() {
    openModal({
      title: 'Add Machine Type',
      contentHtml: `
        <div class="field">
          <label class="label" for="type-name">Machine Type Name *</label>
          <input class="input" id="type-name" name="name" required placeholder="e.g. Morpho, Eclipse">
        </div>
        <p class="error-text"></p>
      `,
      submitText: 'Create Type',
      onSubmit: async (form, close) => {
        const name = form.name.value;
        const created = await createMachineType(name);
        toast(`Machine type "${name}" created.`);
        selectedTypeId = created.id;
        close();
        await loadTypes();
        await loadTemplates();
      }
    });
  }

  function handleAddPart() {
    if (!selectedTypeId) return;

    openModal({
      title: 'Add Template Part',
      contentHtml: `
        <div class="field">
          <label class="label" for="p-module">Module *</label>
          <select class="select" id="p-module" name="module" required>
            <option value="input">Input</option>
            <option value="scanner">Scanner</option>
            <option value="output">Output</option>
          </select>
        </div>
        <div class="field">
          <label class="label" for="p-name">Part Name *</label>
          <input class="input" id="p-name" name="name" required placeholder="e.g. DMA, Encoder, Belt">
        </div>
        <div class="field">
          <label class="label" for="p-pn">Part Number *</label>
          <input class="input font-mono" id="p-pn" name="partNumber" required placeholder="e.g. DMA-001" style="text-transform:uppercase">
        </div>
        <div class="field flex items-center gap-3">
          <input type="checkbox" id="p-serialized" name="serialized" checked>
          <label class="label mb-0 cursor-pointer" for="p-serialized">Serialized (requires serial number per unit)</label>
        </div>
        <div class="field">
          <label class="label" for="p-qty">Quantity per machine *</label>
          <input class="input" id="p-qty" name="quantity" type="number" min="1" value="1" required>
        </div>
        <div class="field">
          <label class="label" for="p-placement">Placement Mode *</label>
          <select class="select" id="p-placement" name="placementMode">
            <option value="flexible">Flexible (positions can swap serials)</option>
            <option value="fixed">Fixed (position is locked)</option>
          </select>
        </div>
        <div class="field flex items-center gap-3">
          <input type="checkbox" id="p-rma" name="rmaApplicable" checked>
          <label class="label mb-0 cursor-pointer" for="p-rma">RMA applicable (damaged units can be tagged RMA)</label>
        </div>
        <div class="field">
          <label class="label" for="p-desc">Description / Notes</label>
          <textarea class="textarea" id="p-desc" name="description" placeholder="Optional notes..."></textarea>
        </div>
        <p class="error-text"></p>
      `,
      submitText: 'Add Part',
      onSubmit: async (form, close) => {
        await createTypeTemplate({
          machineTypeId: selectedTypeId,
          module: form.module.value,
          name: form.name.value,
          partNumber: form.partNumber.value,
          serialized: form.serialized.checked,
          quantity: form.quantity.value,
          placementMode: form.placementMode.value,
          rmaApplicable: form.rmaApplicable.checked,
          description: form.description.value,
        });
        toast(`Template part "${form.name.value}" added.`);
        close();
        await loadTemplates();
      }
    });
  }

  function handleEditPart(p) {
    openModal({
      title: `Edit Template Part: ${p.name}`,
      contentHtml: `
        <div class="field">
          <label class="label" for="p-name">Part Name *</label>
          <input class="input" id="p-name" name="name" required value="${esc(p.name)}">
        </div>
        <div class="field">
          <label class="label" for="p-pn">Part Number *</label>
          <input class="input font-mono" id="p-pn" name="partNumber" required value="${esc(p.part_number)}" style="text-transform:uppercase">
        </div>
        <div class="field flex items-center gap-3">
          <input type="checkbox" id="p-serialized" name="serialized" ${p.serialized ? 'checked' : ''}>
          <label class="label mb-0 cursor-pointer" for="p-serialized">Serialized</label>
        </div>
        <div class="field">
          <label class="label" for="p-qty">Quantity per machine *</label>
          <input class="input" id="p-qty" name="quantity" type="number" min="1" value="${p.quantity}" required>
        </div>
        <div class="field">
          <label class="label" for="p-placement">Placement Mode *</label>
          <select class="select" id="p-placement" name="placementMode">
            <option value="flexible" ${p.placement_mode === 'flexible' ? 'selected' : ''}>Flexible</option>
            <option value="fixed" ${p.placement_mode === 'fixed' ? 'selected' : ''}>Fixed</option>
          </select>
        </div>
        <div class="field flex items-center gap-3">
          <input type="checkbox" id="p-rma" name="rmaApplicable" ${p.rma_applicable ? 'checked' : ''}>
          <label class="label mb-0 cursor-pointer" for="p-rma">RMA applicable</label>
        </div>
        <div class="field">
          <label class="label" for="p-desc">Description</label>
          <textarea class="textarea" id="p-desc" name="description">${esc(p.description || '')}</textarea>
        </div>
        <p class="error-text"></p>
      `,
      submitText: 'Save Template Part',
      onSubmit: async (form, close) => {
        await updateTypeTemplate(p.id, {
          name: form.name.value,
          partNumber: form.partNumber.value,
          serialized: form.serialized.checked,
          quantity: form.quantity.value,
          placementMode: form.placementMode.value,
          rmaApplicable: form.rmaApplicable.checked,
          description: form.description.value,
        });
        toast(`Part "${form.name.value}" updated.`);
        close();
        await loadTemplates();
      }
    });
  }

  function handleDeletePart(id, name) {
    openModal({
      title: 'Delete Template Part',
      danger: true,
      submitText: 'Delete',
      contentHtml: `
        <p>Are you sure you want to remove <strong>${esc(name)}</strong> from this type template?</p>
        <p class="text-sm text-gray-500 mt-2">Existing machines will not be affected.</p>
        <p class="error-text"></p>
      `,
      onSubmit: async (form, close) => {
        await deleteTypeTemplate(id);
        toast(`Template part "${name}" deleted.`);
        close();
        await loadTemplates();
      }
    });
  }

  container.querySelector('#btn-add-type').addEventListener('click', handleAddType);
  container.querySelector('#btn-add-template-part').addEventListener('click', handleAddPart);

  await loadTypes();
  await loadTemplates();
}
