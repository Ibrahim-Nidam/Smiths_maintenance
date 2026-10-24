import {
  listMachineTypes,
  createMachineType,
  listTypeTemplates,
  createTypeTemplate,
  updateTypeTemplate,
  deleteTypeTemplate,
} from '../api/machines.js';
import { pageHeader, emptyState, loadingState, esc } from '../components/ui.js';
import { openModal } from '../components/modal.js';
import { mountPartPicker } from '../components/part-picker.js';
import { copyButton } from '../components/input-enhancements.js';
import { toast } from '../components/toast.js';
import { ROLES } from '../auth.js';

export async function render(container, params, ctx) {
  const isGlobal = [ROLES.ADMIN, ROLES.MANAGER].includes(ctx.profile.role);
  if (!isGlobal) {
    container.innerHTML = emptyState('Access Denied', 'Only Admins and Maintenance Managers can access Settings.');
    return;
  }

  container.innerHTML = pageHeader(
    'Settings',
    'Manage machine types and template definitions for new machines.',
    `<a href="#/parts" class="btn btn-secondary btn-sm">Browse parts catalogue</a>`
  ) + `
    <div class="grid-3-1">
      <div class="panel">
        <div class="panel-head">
          <h2 class="panel-title">Machine types</h2>
          <button id="btn-add-type" class="btn btn-ghost btn-sm">New type</button>
        </div>
        <div id="types-list" class="type-list">${loadingState('Loading types...')}</div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h2 id="template-title" class="panel-title">Type template</h2>
            <p class="small muted mt-1">Part definitions copied automatically when creating a machine of this type.</p>
          </div>
          <button id="btn-add-template-part" class="btn btn-primary btn-sm" disabled>Add template part</button>
        </div>
        <div id="templates-container">${loadingState('Select a machine type to view its template parts.')}</div>
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
        listEl.innerHTML = `<p class="small muted">No machine types configured.</p>`;
        return;
      }

      if (!selectedTypeId && machineTypes.length > 0) {
        selectedTypeId = machineTypes[0].id;
      }

      listEl.innerHTML = machineTypes.map(t => `
        <button class="type-item ${t.id === selectedTypeId ? 'is-active' : ''}" data-id="${t.id}" type="button">
          <span>${esc(t.name)}</span>
          ${t.id === selectedTypeId ? '<span class="dot"></span>' : ''}
        </button>
      `).join('');

      listEl.querySelectorAll('.type-item').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedTypeId = btn.dataset.id;
          loadTypes();
          loadTemplates();
        });
      });
    } catch (err) {
      listEl.innerHTML = `<p class="small text-danger">Error: ${esc(err.message)}</p>`;
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
          `<button id="btn-add-part-empty" class="btn btn-primary btn-sm">Add first template part</button>`
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
          <section class="mb-8">
            <h3 class="module-label">${MODULE_LABELS[modKey]}</h3>
            ${!modParts.length
              ? `<p class="small muted italic">No parts in the ${modKey} module.</p>`
              : `
                <div class="table-wrap">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Part name</th>
                        <th>Part number</th>
                        <th>Serialized</th>
                        <th>Qty / machine</th>
                        <th>Placement</th>
                        <th>RMA applicable</th>
                        <th class="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${modParts.map(p => `
                        <tr>
                          <td class="strong">${esc(p.name)}</td>
                          <td class="mono secondary">${esc(p.part_number)}${copyButton(p.part_number, 'Copy part number')}</td>
                          <td>
                            ${p.serialized
                              ? '<span class="badge badge-accent">Serialized</span>'
                              : '<span class="badge badge-muted">Non-serialized</span>'
                            }
                          </td>
                          <td class="mono">${p.quantity}</td>
                          <td class="small capitalize secondary">${p.placement_mode}</td>
                          <td class="small secondary">${p.rma_applicable ? 'Yes' : 'No'}</td>
                          <td class="text-right">
                            <div class="cell-actions">
                              <button class="btn btn-ghost btn-sm edit-part-btn" data-id="${p.id}" data-json="${esc(JSON.stringify(p))}">Edit</button>
                              <button class="btn btn-danger btn-sm delete-part-btn" data-id="${p.id}" data-name="${esc(p.name)}">Delete</button>
                            </div>
                          </td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              `
            }
          </section>
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
      containerEl.innerHTML = `<p class="small text-danger">Failed to load template parts: ${esc(err.message)}</p>`;
    }
  }

  function handleAddType() {
    openModal({
      title: 'Add machine type',
      contentHtml: `
        <div class="field">
          <label class="label" for="type-name">Machine type name *</label>
          <input class="input" id="type-name" name="name" required placeholder="e.g. Morpho, Eclipse">
        </div>
        <p class="error-text"></p>
      `,
      submitText: 'Create type',
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
      title: 'Add template part',
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
          <label class="label" for="p-name">Part name *</label>
          <input class="input" id="p-name" name="name" required placeholder="e.g. DMA, Encoder, Belt">
        </div>
        <div class="field">
          <label class="label" for="p-pn">Part number *</label>
          <input class="input mono" id="p-pn" name="partNumber" required placeholder="e.g. DMA-001" style="text-transform:uppercase">
        </div>
        <div class="field">
          <label class="checkbox-row" for="p-serialized">
            <input type="checkbox" id="p-serialized" name="serialized" checked>
            <span class="label">Serialized (requires a serial number per unit)</span>
          </label>
        </div>
        <div class="field">
          <label class="label" for="p-qty">Quantity per machine *</label>
          <input class="input" id="p-qty" name="quantity" type="number" min="1" value="1" required>
        </div>
        <div class="field">
          <label class="label" for="p-placement">Placement mode *</label>
          <select class="select" id="p-placement" name="placementMode">
            <option value="flexible">Flexible (positions can swap serials)</option>
            <option value="fixed">Fixed (position is locked)</option>
          </select>
        </div>
        <div class="field">
          <label class="checkbox-row" for="p-rma">
            <input type="checkbox" id="p-rma" name="rmaApplicable" checked>
            <span class="label">RMA applicable (damaged units can be tagged RMA)</span>
          </label>
        </div>
        <div class="field">
          <label class="label" for="p-desc">Description / notes</label>
          <textarea class="textarea" id="p-desc" name="description" placeholder="Optional notes"></textarea>
        </div>
        <p class="error-text"></p>
      `,
      submitText: 'Add part',
      onOpen: modal => {
        mountPartPicker(modal.querySelector('#p-pn'), { target: modal.querySelector('#p-name') });
      },
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
      title: `Edit template part: ${p.name}`,
      contentHtml: `
        <div class="field">
          <label class="label" for="p-name">Part name *</label>
          <input class="input" id="p-name" name="name" required value="${esc(p.name)}">
        </div>
        <div class="field">
          <label class="label" for="p-pn">Part number *</label>
          <input class="input mono" id="p-pn" name="partNumber" required value="${esc(p.part_number)}" style="text-transform:uppercase">
        </div>
        <div class="field">
          <label class="checkbox-row" for="p-serialized">
            <input type="checkbox" id="p-serialized" name="serialized" ${p.serialized ? 'checked' : ''}>
            <span class="label">Serialized</span>
          </label>
        </div>
        <div class="field">
          <label class="label" for="p-qty">Quantity per machine *</label>
          <input class="input" id="p-qty" name="quantity" type="number" min="1" value="${p.quantity}" required>
        </div>
        <div class="field">
          <label class="label" for="p-placement">Placement mode *</label>
          <select class="select" id="p-placement" name="placementMode">
            <option value="flexible" ${p.placement_mode === 'flexible' ? 'selected' : ''}>Flexible</option>
            <option value="fixed" ${p.placement_mode === 'fixed' ? 'selected' : ''}>Fixed</option>
          </select>
        </div>
        <div class="field">
          <label class="checkbox-row" for="p-rma">
            <input type="checkbox" id="p-rma" name="rmaApplicable" ${p.rma_applicable ? 'checked' : ''}>
            <span class="label">RMA applicable</span>
          </label>
        </div>
        <div class="field">
          <label class="label" for="p-desc">Description</label>
          <textarea class="textarea" id="p-desc" name="description">${esc(p.description || '')}</textarea>
        </div>
        <p class="error-text"></p>
      `,
      submitText: 'Save template part',
      onOpen: modal => {
        mountPartPicker(modal.querySelector('#p-pn'), { target: modal.querySelector('#p-name') });
      },
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
      title: 'Delete template part',
      danger: true,
      submitText: 'Delete',
      contentHtml: `
        <p>Remove <strong>${esc(name)}</strong> from this type template?</p>
        <p class="small muted mt-2">Existing machines will not be affected.</p>
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
