import { listMachines, createMachine, updateMachine, deleteMachine, listMachineTypes } from '../api/machines.js';
import { listTeams } from '../api/teams.js';
import { pageHeader, emptyState, esc } from '../components/ui.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { ROLES } from '../auth.js';

const STATUS_BADGE_CLASSES = {
  operational: 'badge-accent',
  degraded: 'badge-alert',
  down: 'badge-solid bg-red-700 text-white',
  decommissioned: 'badge text-gray-500 bg-gray-100',
};

const STATUS_LABELS = {
  operational: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
  decommissioned: 'Decommissioned',
};

export async function render(container, params, ctx) {
  const canManage = [ROLES.ADMIN, ROLES.MANAGER, ROLES.TEAM_LEAD].includes(ctx.profile.role);
  const isGlobal = [ROLES.ADMIN, ROLES.MANAGER].includes(ctx.profile.role);

  const actions = canManage
    ? `<button id="btn-add-machine" class="btn btn-primary btn-sm">+ Create machine</button>`
    : '';

  container.innerHTML = pageHeader('Machines', 'Manage physical machines, positions and serial numbers.', actions) + `
    <div class="flex flex-wrap gap-4 mb-6 items-center justify-between">
      <div class="flex flex-wrap gap-3 items-center flex-1 max-w-2xl">
        <input type="search" id="search-code" class="input w-48" placeholder="Search by code...">
        <select id="filter-type" class="select w-40">
          <option value="">All Types</option>
        </select>
        <select id="filter-team" class="select w-40">
          <option value="">All Teams</option>
        </select>
        <select id="filter-status" class="select w-40">
          <option value="">All Statuses</option>
          <option value="operational">Operational</option>
          <option value="degraded">Degraded</option>
          <option value="down">Down</option>
          <option value="decommissioned">Decommissioned</option>
        </select>
      </div>
    </div>
    <div id="machines-container"><p class="text-gray-500 text-sm">Loading machines...</p></div>
  `;

  let allMachines = [];
  let types = [];
  let teams = [];

  try {
    const [mList, tList, tmList] = await Promise.all([
      listMachines(),
      listMachineTypes().catch(() => []),
      listTeams().catch(() => []),
    ]);
    allMachines = mList;
    types = tList;
    teams = tmList;

    const typeSelect = container.querySelector('#filter-type');
    types.forEach(t => {
      typeSelect.innerHTML += `<option value="${t.id}">${esc(t.name)}</option>`;
    });

    const teamSelect = container.querySelector('#filter-team');
    teams.forEach(t => {
      teamSelect.innerHTML += `<option value="${t.id}">${esc(t.name)}</option>`;
    });
  } catch (err) {
    container.querySelector('#machines-container').innerHTML =
      `<div class="p-4 bg-red-50 text-red-700 rounded-md border border-red-200">Failed to load machines: ${esc(err.message)}</div>`;
    return;
  }

  function filterAndRender() {
    const search = container.querySelector('#search-code').value.trim().toLowerCase();
    const selectedType = container.querySelector('#filter-type').value;
    const selectedTeam = container.querySelector('#filter-team').value;
    const selectedStatus = container.querySelector('#filter-status').value;

    const filtered = allMachines.filter(m => {
      if (search && !m.code.toLowerCase().includes(search)) return false;
      if (selectedType && m.machine_type_id !== selectedType) return false;
      if (selectedTeam && m.team_id !== selectedTeam) return false;
      if (selectedStatus && m.status !== selectedStatus) return false;
      return true;
    });

    const listEl = container.querySelector('#machines-container');
    if (!filtered.length) {
      listEl.innerHTML = emptyState(
        'No machines found',
        allMachines.length ? 'Try adjusting your search filters.' : 'Get started by creating your first machine.',
        (canManage && !allMachines.length) ? `<button id="btn-add-machine-empty" class="btn btn-primary btn-sm">+ Create first machine</button>` : ''
      );
      const emptyBtn = listEl.querySelector('#btn-add-machine-empty');
      if (emptyBtn) emptyBtn.addEventListener('click', () => handleAddMachine(types, teams));
      return;
    }

    listEl.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Machine Code</th>
              <th>Type</th>
              <th>Team</th>
              <th>Status</th>
              <th>Parts Installed</th>
              <th>RMA Flags</th>
              <th>Location</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(m => `
              <tr data-id="${m.id}">
                <td>
                  <a href="#/machines/${encodeURIComponent(m.code)}" class="font-mono font-semibold text-accent hover:underline">
                    ${esc(m.code)}
                  </a>
                </td>
                <td><span class="badge">${esc(m.type_name)}</span></td>
                <td>${esc(m.team_name)}</td>
                <td>
                  <span class="badge ${STATUS_BADGE_CLASSES[m.status] || ''}">
                    ${esc(STATUS_LABELS[m.status] || m.status)}
                  </span>
                </td>
                <td class="mono font-sm">
                  ${m.installed_slots} / ${m.total_slots}
                </td>
                <td>
                  ${m.rma_count > 0
                    ? `<span class="badge badge-alert font-medium">${m.rma_count} RMA</span>`
                    : '<span class="text-gray-400 text-sm">None</span>'
                  }
                </td>
                <td class="text-gray-600 text-sm">${esc(m.location || '—')}</td>
                <td class="text-right">
                  <a href="#/machines/${encodeURIComponent(m.code)}" class="btn btn-ghost btn-sm">View detail</a>
                  ${canManage ? `<button class="btn btn-ghost btn-sm edit-machine-btn" data-id="${m.id}" data-code="${esc(m.code)}" data-status="${m.status}" data-team="${m.team_id}" data-loc="${esc(m.location || '')}">Edit</button>` : ''}
                  ${isGlobal ? `<button class="btn btn-ghost btn-sm btn-danger delete-machine-btn" data-id="${m.id}" data-code="${esc(m.code)}">Delete</button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    listEl.querySelectorAll('.edit-machine-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        handleEditMachine({
          id: btn.dataset.id,
          code: btn.dataset.code,
          status: btn.dataset.status,
          teamId: btn.dataset.team,
          location: btn.dataset.loc,
        }, teams);
      });
    });

    listEl.querySelectorAll('.delete-machine-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        handleDeleteMachine(btn.dataset.id, btn.dataset.code);
      });
    });
  }

  function handleAddMachine(types, teams) {
    if (!types.length) {
      toast('Please create at least one machine type in Settings first.', 'error');
      return;
    }
    if (!teams.length) {
      toast('Please create at least one team in Teams page first.', 'error');
      return;
    }

    const defaultTeamId = ctx.profile.role === ROLES.TEAM_LEAD ? ctx.profile.team_id : (teams[0] ? teams[0].id : '');

    openModal({
      title: 'Create New Machine',
      contentHtml: `
        <div class="field">
          <label class="label" for="m-code">Machine Code *</label>
          <input class="input font-mono" id="m-code" name="code" required placeholder="e.g. K289" style="text-transform:uppercase">
          <p class="hint">Unique identifier for this machine.</p>
        </div>
        <div class="field">
          <label class="label" for="m-type">Machine Type *</label>
          <select class="select" id="m-type" name="machineTypeId" required>
            ${types.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}
          </select>
          <p class="hint">Copying parts structure from type template automatically.</p>
        </div>
        <div class="field">
          <label class="label" for="m-team">Assigned Team *</label>
          <select class="select" id="m-team" name="teamId" required ${ctx.profile.role === ROLES.TEAM_LEAD ? 'disabled' : ''}>
            ${teams.map(t => `<option value="${t.id}" ${t.id === defaultTeamId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="label" for="m-loc">Location</label>
          <input class="input" id="m-loc" name="location" placeholder="e.g. Terminal 1 - Gate 5">
        </div>
        <p class="error-text"></p>
      `,
      submitText: 'Create Machine',
      onSubmit: async (form, close) => {
        const code = form.code.value.trim().toUpperCase();
        const machineTypeId = form.machineTypeId.value;
        const teamId = ctx.profile.role === ROLES.TEAM_LEAD ? ctx.profile.team_id : form.teamId.value;
        const location = form.location.value;

        await createMachine({ code, machineTypeId, teamId, location });
        toast(`Machine "${code}" created successfully.`);
        close();
        window.location.hash = `#/machines/${encodeURIComponent(code)}`;
      }
    });
  }

  function handleEditMachine(machine, teams) {
    const isGlobal = [ROLES.ADMIN, ROLES.MANAGER].includes(ctx.profile.role);

    openModal({
      title: `Edit Machine ${machine.code}`,
      contentHtml: `
        <div class="field">
          <label class="label" for="m-status">Status *</label>
          <select class="select" id="m-status" name="status" required>
            <option value="operational" ${machine.status === 'operational' ? 'selected' : ''}>Operational</option>
            <option value="degraded" ${machine.status === 'degraded' ? 'selected' : ''}>Degraded</option>
            <option value="down" ${machine.status === 'down' ? 'selected' : ''}>Down</option>
            <option value="decommissioned" ${machine.status === 'decommissioned' ? 'selected' : ''}>Decommissioned</option>
          </select>
        </div>
        <div class="field">
          <label class="label" for="m-team">Assigned Team</label>
          <select class="select" id="m-team" name="teamId" ${!isGlobal ? 'disabled title="Only admins and managers can change machine team assignment"' : ''}>
            ${teams.map(t => `<option value="${t.id}" ${t.id === machine.teamId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="label" for="m-loc">Location</label>
          <input class="input" id="m-loc" name="location" value="${esc(machine.location)}">
        </div>
        <p class="error-text"></p>
      `,
      submitText: 'Save Changes',
      onSubmit: async (form, close) => {
        const status = form.status.value;
        const teamId = isGlobal ? form.teamId.value : machine.teamId;
        const location = form.location.value;

        await updateMachine(machine.id, { status, teamId, location });
        toast(`Machine ${machine.code} updated.`);
        close();
        allMachines = await listMachines();
        filterAndRender();
      }
    });
  }

  function handleDeleteMachine(id, code) {
    openModal({
      title: `Delete Machine ${code}`,
      danger: true,
      submitText: 'Delete Machine',
      contentHtml: `
        <p>Are you sure you want to delete machine <strong>${esc(code)}</strong>?</p>
        <p class="text-sm text-gray-500 mt-2">All installed parts structure for this machine will be removed. Historical event logs will remain preserved.</p>
        <p class="error-text"></p>
      `,
      onSubmit: async (form, close) => {
        await deleteMachine(id);
        toast(`Machine ${code} deleted.`);
        close();
        allMachines = await listMachines();
        filterAndRender();
      }
    });
  }

  ['search-code', 'filter-type', 'filter-team', 'filter-status'].forEach(id => {
    const el = container.querySelector(`#${id}`);
    if (el) el.addEventListener('input', filterAndRender);
  });

  const addBtn = container.querySelector('#btn-add-machine');
  if (addBtn) addBtn.addEventListener('click', () => handleAddMachine(types, teams));

  filterAndRender();
}
