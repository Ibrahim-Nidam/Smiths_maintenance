import {
  fetchCatalog,
  fetchCatalogContext,
  saveCatalogPart,
  deleteCatalogPart,
  isCatalogMissing,
} from '../api/catalog.js';
import { listMachineTypes } from '../api/machines.js';
import { pageHeader, emptyState, loadingState, alertText, esc } from '../components/ui.js';
import { openModal } from '../components/modal.js';
import { copyButton } from '../components/input-enhancements.js';
import { toast } from '../components/toast.js';
import { ROLES } from '../auth.js';

const PAGE_SIZE = 50;

const FILTERS = [
  { key: 'all', label: 'All parts' },
  { key: 'stock', label: 'In stock' },
  { key: 'templates', label: 'In type templates' },
  { key: 'unused', label: 'Not used yet' },
];

const SORTS = [
  { key: 'part_number', label: 'Part number (A to Z)' },
  { key: 'designation', label: 'Designation (A to Z)' },
];

const MODULE_LABELS = { input: 'Input', scanner: 'Scanner', output: 'Output' };

export async function render(container, params, ctx) {
  const isGlobal = [ROLES.ADMIN, ROLES.MANAGER].includes(ctx.profile.role);

  const actions = isGlobal
    ? `<button id="btn-add-catalog-part" class="btn btn-primary btn-sm">Add part</button>`
    : '';

  let machineTypes = [];
  try { machineTypes = await listMachineTypes(); } catch { machineTypes = []; }
  const typeName = id => (machineTypes.find(t => t.id === id) || {}).name || 'Unknown type';

  container.innerHTML = pageHeader(
    'Parts',
    'Search the catalogue of part numbers: designations, machine types, module and serialization.',
    actions
  ) + `
    <div class="filter-bar">
      <div class="search-field">
        <input type="search" id="parts-search" class="input" placeholder="Search part number or designation" autocomplete="off">
      </div>
      <select class="select" id="parts-type" aria-label="Filter by machine type">
        <option value="">All machine types</option>
        ${machineTypes.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}
      </select>
      <select class="select" id="parts-sort" aria-label="Sort parts">
        ${SORTS.map(s => `<option value="${s.key}">${s.label}</option>`).join('')}
      </select>
    </div>
    <div class="filter-row" id="parts-filters">
      ${FILTERS.map(f => `
        <button type="button" class="chip ${f.key === 'all' ? 'is-active' : ''}" data-filter="${f.key}">
          ${f.label}<span class="chip-count" data-count="${f.key}"></span>
        </button>
      `).join('')}
      <span class="small muted" id="parts-count"></span>
    </div>
    <div id="parts-result">${loadingState('Loading parts catalogue...')}</div>
  `;

  let parts = [];
  let context = { stockByPart: {}, templatesByPart: {} };
  let activeFilter = 'all';
  let activeType = '';
  let sortKey = 'part_number';
  let visible = PAGE_SIZE;
  let searchTerm = '';

  const resultEl = container.querySelector('#parts-result');
  const searchEl = container.querySelector('#parts-search');
  const sortEl = container.querySelector('#parts-sort');
  const typeEl = container.querySelector('#parts-type');
  const countEl = container.querySelector('#parts-count');

  function stockInfo(partNumber) {
    const entries = context.stockByPart[String(partNumber).toUpperCase()] || [];
    if (!entries.length) return null;
    const total = entries.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
    const low = entries.some(item => parseFloat(item.quantity) <= parseFloat(item.min_quantity || 0));
    const unit = entries[0].unit || 'pcs';
    return { total, unit, low };
  }

  function templateCount(partNumber) {
    return context.templatesByPart[String(partNumber).toUpperCase()] || 0;
  }

  function matches(part) {
    const inStock = !!stockInfo(part.part_number);
    const inTemplates = templateCount(part.part_number) > 0;
    if (activeFilter === 'stock' && !inStock) return false;
    if (activeFilter === 'templates' && !inTemplates) return false;
    if (activeFilter === 'unused' && (inStock || inTemplates)) return false;
    if (activeType && !(part.machine_type_ids || []).includes(activeType)) return false;
    return true;
  }

  function searchTermMatch(part) {
    if (!searchTerm) return true;
    return part.part_number.toLowerCase().includes(searchTerm) ||
      part.designation.toLowerCase().includes(searchTerm);
  }

  function updateCounts() {
    const counts = { all: 0, stock: 0, templates: 0, unused: 0 };
    parts.forEach(part => {
      const inStock = !!stockInfo(part.part_number);
      const inTemplates = templateCount(part.part_number) > 0;
      counts.all += 1;
      if (inStock) counts.stock += 1;
      if (inTemplates) counts.templates += 1;
      if (!inStock && !inTemplates) counts.unused += 1;
    });
    container.querySelectorAll('[data-count]').forEach(el => {
      el.textContent = counts[el.dataset.count] ?? '';
    });
  }

  function typeBadges(part) {
    const ids = part.machine_type_ids || [];
    if (!ids.length) return '<span class="muted">Any</span>';
    const shown = ids.slice(0, 2);
    const rest = ids.length - shown.length;
    return shown.map(id => `<span class="badge badge-muted">${esc(typeName(id))}</span>`).join(' ') +
      (rest ? ` <span class="tiny muted" title="${esc(ids.slice(2).map(typeName).join(', '))}">+${rest}</span>` : '');
  }

  function paint() {
    const matched = parts.filter(p => matches(p) && searchTermMatch(p));
    matched.sort((a, b) => {
      const left = a[sortKey].toLowerCase();
      const right = b[sortKey].toLowerCase();
      return left < right ? -1 : left > right ? 1 : 0;
    });

    countEl.textContent = matched.length
      ? `${matched.length} part${matched.length === 1 ? '' : 's'}`
      : '';

    if (!matched.length) {
      resultEl.innerHTML = parts.length
        ? emptyState('No matching parts', 'Try a different search term or clear the selected filters.')
        : emptyState(
            'The parts catalogue is empty',
            'Run sql/011_parts_catalog.sql in the Supabase SQL editor to import the parts list.',
            isGlobal ? `<button id="btn-add-catalog-part-empty" class="btn btn-primary btn-sm">Add first part</button>` : ''
          );
      const emptyBtn = resultEl.querySelector('#btn-add-catalog-part-empty');
      if (emptyBtn) emptyBtn.addEventListener('click', handleAddPart);
      return;
    }

    const shown = matched.slice(0, visible);
    resultEl.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Part number</th>
              <th>Designation</th>
              <th>Machine types</th>
              <th>Module</th>
              <th>Serialized</th>
              <th>Used in</th>
              ${isGlobal ? '<th class="text-right">Actions</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${shown.map(part => {
              const stock = stockInfo(part.part_number);
              const templates = templateCount(part.part_number);
              return `
                <tr>
                  <td class="mono nowrap">${esc(part.part_number)}${copyButton(part.part_number, 'Copy part number')}</td>
                  <td>${esc(part.designation)}</td>
                  <td>${typeBadges(part)}</td>
                  <td>${part.module ? `<span class="badge badge-accent">${MODULE_LABELS[part.module] || esc(part.module)}</span>` : '<span class="muted">&mdash;</span>'}</td>
                  <td>
                    ${part.serialized === true
                      ? '<span class="badge badge-success">Yes</span>'
                      : part.serialized === false
                        ? '<span class="badge badge-muted">No</span>'
                        : '<span class="muted">&mdash;</span>'}
                  </td>
                  <td>
                    <div class="row">
                      ${stock
                        ? `<span class="badge ${stock.low ? 'badge-warning' : 'badge-muted'}">${stock.low ? 'Low stock' : `${stock.total} ${esc(stock.unit)}`}</span>`
                        : ''}
                      ${templates
                        ? `<span class="badge badge-accent">${templates} tpl</span>`
                        : ''}
                      ${!stock && !templates ? '<span class="muted">&mdash;</span>' : ''}
                    </div>
                  </td>
                  ${isGlobal ? `
                    <td class="text-right">
                      <div class="cell-actions">
                        <button class="btn btn-ghost btn-sm edit-catalog-part-btn"
                          data-id="${part.id}"
                          data-pn="${esc(part.part_number)}"
                          data-designation="${esc(part.designation)}"
                          data-module="${part.module || ''}"
                          data-serialized="${part.serialized === null || part.serialized === undefined ? '' : String(part.serialized)}"
                          data-types="${esc((part.machine_type_ids || []).join(','))}">Edit</button>
                        <button class="btn btn-danger btn-sm delete-catalog-part-btn"
                          data-id="${part.id}"
                          data-pn="${esc(part.part_number)}">Remove</button>
                      </div>
                    </td>
                  ` : ''}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
      ${matched.length > shown.length ? `
        <div class="row row-between mt-3">
          <span class="small muted">Showing ${shown.length} of ${matched.length}</span>
          <button type="button" id="parts-show-more" class="btn btn-secondary btn-sm">Show ${Math.min(PAGE_SIZE, matched.length - shown.length)} more</button>
        </div>
      ` : ''}
    `;

    const moreBtn = resultEl.querySelector('#parts-show-more');
    if (moreBtn) moreBtn.addEventListener('click', () => { visible += PAGE_SIZE; paint(); });

    if (isGlobal) {
      resultEl.querySelectorAll('.edit-catalog-part-btn').forEach(btn => {
        btn.addEventListener('click', () => handleEditPart(btn.dataset));
      });
      resultEl.querySelectorAll('.delete-catalog-part-btn').forEach(btn => {
        btn.addEventListener('click', () => handleDeletePart(btn.dataset.id, btn.dataset.pn));
      });
    }
  }

  function classificationFields({ module = '', serialized = '', types = [] } = {}) {
    return `
      <div class="field">
        <span class="label">Machine types</span>
        <div class="check-list">
          ${machineTypes.length
            ? machineTypes.map(t => `
              <label class="checkbox-row">
                <input type="checkbox" name="machineType" value="${t.id}" ${types.includes(t.id) ? 'checked' : ''}>
                <span class="label">${esc(t.name)}</span>
              </label>
            `).join('')
            : '<p class="small muted">No machine types created yet. Add them in Settings first.</p>'}
        </div>
        <span class="hint">Leave all unchecked if the part fits every machine type. Select several when a part is used in more than one.</span>
      </div>
      <div class="grid-1-1">
        <div class="field">
          <label class="label" for="cp-module">Module</label>
          <select class="select" id="cp-module" name="module">
            <option value="" ${module ? '' : 'selected'}>Not specified</option>
            ${Object.entries(MODULE_LABELS).map(([key, label]) =>
              `<option value="${key}" ${module === key ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="label" for="cp-serialized">Serialized</label>
          <select class="select" id="cp-serialized" name="serialized">
            <option value="" ${serialized === '' ? 'selected' : ''}>Not specified</option>
            <option value="true" ${serialized === 'true' ? 'selected' : ''}>Yes, each unit has a serial number</option>
            <option value="false" ${serialized === 'false' ? 'selected' : ''}>No, tracked as a quantity</option>
          </select>
        </div>
      </div>
    `;
  }

  function readClassification(form) {
    const types = [...form.querySelectorAll('input[name="machineType"]:checked')].map(el => el.value);
    const serializedRaw = form.serialized.value;
    return {
      module: form.module.value || null,
      serialized: serializedRaw === '' ? null : serializedRaw === 'true',
      machineTypeIds: types,
    };
  }

  function handleAddPart() {
    openModal({
      title: 'Add part to catalogue',
      contentHtml: `
        <div class="field">
          <label class="label" for="cp-pn">Part number *</label>
          <input class="input mono" id="cp-pn" name="partNumber" required placeholder="e.g. 604620-6" style="text-transform:uppercase" autocomplete="off">
          <span class="hint">Part numbers identify a part and never change once created.</span>
        </div>
        <div class="field">
          <label class="label" for="cp-designation">Designation *</label>
          <input class="input" id="cp-designation" name="designation" required placeholder="e.g. PCB ASSEMBLY HVIC-3 W/FIRMWARE" autocomplete="off">
        </div>
        ${classificationFields()}
        <p class="error-text"></p>
      `,
      submitText: 'Add part',
      onSubmit: async (form, close) => {
        await saveCatalogPart({
          partNumber: form.partNumber.value,
          designation: form.designation.value,
          ...readClassification(form),
        });
        toast(`Part "${form.partNumber.value.trim().toUpperCase()}" added to the catalogue.`);
        close();
        await load();
      },
    });
  }

  function handleEditPart(part) {
    openModal({
      title: `Edit ${part.pn}`,
      contentHtml: `
        <div class="field">
          <label class="label" for="cp-pn">Part number</label>
          <input class="input mono" id="cp-pn" name="partNumber" value="${esc(part.pn)}" readonly>
          <span class="hint">Part numbers never change; edit the details below.</span>
        </div>
        <div class="field">
          <label class="label" for="cp-designation">Designation *</label>
          <input class="input" id="cp-designation" name="designation" required value="${esc(part.designation)}" autocomplete="off">
        </div>
        ${classificationFields({
          module: part.module || '',
          serialized: part.serialized,
          types: part.types ? part.types.split(',').filter(Boolean) : [],
        })}
        <p class="error-text"></p>
      `,
      submitText: 'Save changes',
      onSubmit: async (form, close) => {
        await saveCatalogPart({
          partId: part.id,
          partNumber: part.pn,
          designation: form.designation.value,
          ...readClassification(form),
        });
        toast(`${part.pn} updated.`);
        close();
        await load();
      },
    });
  }

  function handleDeletePart(id, partNumber) {
    openModal({
      title: `Remove ${partNumber} from the catalogue?`,
      danger: true,
      submitText: 'Remove part',
      contentHtml: `
        <p>The part <strong class="mono">${esc(partNumber)}</strong> will be removed from the parts catalogue.</p>
        <p class="small muted mt-2">Machines, templates and stock records that already use this part number are not affected.</p>
        <p class="error-text"></p>
      `,
      onSubmit: async (form, close) => {
        await deleteCatalogPart(id);
        toast(`${partNumber} removed from the catalogue.`);
        close();
        await load();
      },
    });
  }

  async function load() {
    resultEl.innerHTML = loadingState('Loading parts catalogue...');
    try {
      [parts, context] = await Promise.all([fetchCatalog(), fetchCatalogContext()]);
      updateCounts();
      paint();
    } catch (err) {
      resultEl.innerHTML = isCatalogMissing(err)
        ? `<div class="alert alert-warning">
             <p class="alert-title">Parts catalogue table not found</p>
             <p class="alert-text mt-1">Run <code>sql/011_parts_catalog.sql</code> in the Supabase SQL editor once to create the table and import the parts list.</p>
           </div>`
        : alertText(`Failed to load the parts catalogue: ${esc(err.message)}`);
    }
  }

  searchEl.addEventListener('input', () => {
    searchTerm = searchEl.value.trim().toLowerCase();
    visible = PAGE_SIZE;
    paint();
  });

  sortEl.addEventListener('change', () => {
    sortKey = sortEl.value;
    paint();
  });

  typeEl.addEventListener('change', () => {
    activeType = typeEl.value;
    visible = PAGE_SIZE;
    paint();
  });

  container.querySelectorAll('#parts-filters .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      activeFilter = chip.dataset.filter;
      visible = PAGE_SIZE;
      container.querySelectorAll('#parts-filters .chip').forEach(c => {
        c.classList.toggle('is-active', c === chip);
      });
      paint();
    });
  });

  const addBtn = container.querySelector('#btn-add-catalog-part');
  if (addBtn) addBtn.addEventListener('click', handleAddPart);

  await load();
}
