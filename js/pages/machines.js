import { listMachines, createMachine, updateMachine, deleteMachine, listMachineTypes } from '../api/machines.js';
import { listTeams } from '../api/teams.js';
import { pageHeader, emptyState, loadingState, alertText, esc } from '../components/ui.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { ROLES } from '../auth.js';

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

export async function render(container, params, ctx) {
  const canManage = [ROLES.ADMIN, ROLES.MANAGER, ROLES.TEAM_LEAD].includes(ctx.profile.role);
  const isGlobal = [ROLES.ADMIN, ROLES.MANAGER].includes(ctx.profile.role);

  const actions = canManage
    ? `<button id="btn-add-machine" class="btn btn-primary btn-sm">Create machine</button>`
    : '';

  container.innerHTML = pageHeader('Machines', 'Manage physical machines, positions and serial numbers.', actions) + `
    <div class="filter-bar">
      <div class="search-field">
        <input type="search" id="search-code" class="input" placeholder="Search by machine code">
      </div>
      <select id="filter-type" class="select">
        <option value="">All types</option>
      </select>
      <select id="filter-team" class="select">
        <option value="">All teams</option>
      </select>
      <select id="filter-status" class="select">
        <option value="">All statuses</option>
        <option value="operational">Operational</option>
        <option value="degraded">Degraded</option>
        <option value="down">Down</option>
        <option value="decommissioned">Decommissioned</option>
      </select>
    </div>
    <div id="machines-container">${loadingState('Loading machines...')}</div>
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
      alertText(`Failed to load machines: ${esc(err.message)}`);
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
        (canManage && !allMachines.length) ? `<button id="btn-add-machine-empty" class="btn btn-primary btn-sm">Create first machine</button>` : ''
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
              <th>Machine code</th>
              <th>Type</th>
              <th>Team</th>
              <th>Status</th>
              <th>Parts installed</th>
              <th>RMA flags</th>
              <th>Location</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(m => `
              <tr data-id="${m.id}">
                <td><a href="#/machines/${encodeURIComponent(m.code)}" class="mono strong">${esc(m.code)}</a></td>
                <td><span class="badge">${esc(m.type_name)}</span></td>
                <td class="secondary">${esc(m.team_name)}</td>
                <td>
                  <span class="badge ${STATUS_BADGE_CLASSES[m.status] || ''}">
                    <span class="dot"></span>${esc(STATUS_LABELS[m.status] || m.status)}
                  </span>
                </td>
                <td class="mono">${m.installed_slots} / ${m.total_slots}</td>
                <td>
                  ${m.rma_count > 0
                    ? `<span class="badge badge-danger">${m.rma_count} RMA</span>`
                    : '<span class="muted small">None</span>'
                  }
                </td>
                <td class="small secondary">${esc(m.location || '—')}</td>
                <td class="text-right">
                  <div class="cell-actions">
                    <a href="#/machines/${encodeURIComponent(m.code)}" class="btn btn-ghost btn-sm">View detail</a>
                    ${canManage ? `<button class="btn btn-ghost btn-sm edit-machine-btn" data-id="${m.id}" data-code="${esc(m.code)}" data-status="${m.status}" data-team="${m.team_id}" data-loc="${esc(m.location || '')}">Edit</button>` : ''}
                    ${isGlobal ? `<button class="btn btn-danger btn-sm delete-machine-btn" data-id="${m.id}" data-code="${esc(m.code)}">Delete</button>` : ''}
                  </div>
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
      title: 'Create new machine',
      contentHtml: `
        <div class="field">
          <label class="label" for="m-code">Machine code *</label>
          <input class="input mono" id="m-code" name="code" required placeholder="e.g. K289" style="text-transform:uppercase">
          <p class="hint">Unique identifier for this machine.</p>
        </div>
        <div class="field">
          <label class="label" for="m-type">Machine type *</label>
          <select class="select" id="m-type" name="machineTypeId" required>
            ${types.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}
          </select>
          <p class="hint">Parts structure is copied from the type template automatically.</p>
        </div>
        <div class="field">
          <label class="label" for="m-team">Assigned team *</label>
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
      submitText: 'Create machine',
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
      title: `Edit machine ${machine.code}`,
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
          <label class="label" for="m-team">Assigned team</label>
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
      submitText: 'Save changes',
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
      title: `Delete machine ${code}`,
      danger: true,
      submitText: 'Delete machine',
      contentHtml: `
        <p>Are you sure you want to delete machine <strong>${esc(code)}</strong>?</p>
        <p class="small muted mt-2">The installed parts structure for this machine will be removed. Historical event logs remain preserved.</p>
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
