import { listTeams, createTeam, updateTeam, deleteTeam } from '../api/teams.js';
import { emptyState, loadingState, alertText, esc } from '../components/ui.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { ROLES } from '../auth.js';

const ROLE_LABELS = {
  [ROLES.ADMIN]: 'Admin',
  [ROLES.MANAGER]: 'Maintenance manager',
  [ROLES.TEAM_LEAD]: 'Team lead',
  [ROLES.TECHNICIAN]: 'Technician',
};

const ROLE_BADGE_CLASSES = {
  [ROLES.ADMIN]: 'badge-solid',
  [ROLES.MANAGER]: 'badge-accent',
  [ROLES.TEAM_LEAD]: 'badge',
  [ROLES.TECHNICIAN]: 'badge-muted',
};

// Teams tab of the Staff page (#/staff/teams).
export async function renderTeamsPanel(container, ctx) {
  const isGlobal = [ROLES.ADMIN, ROLES.MANAGER].includes(ctx.profile.role);

  container.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">Teams</h2>
          <p class="small muted mt-1">Maintenance teams and their member counts.</p>
        </div>
        ${isGlobal ? `<button id="btn-add-team" class="btn btn-primary btn-sm">Add team</button>` : ''}
      </div>
      <div id="teams-list">${loadingState('Loading teams...')}</div>
    </div>
  `;

  async function refresh() {
    const listEl = container.querySelector('#teams-list');
    try {
      const teams = await listTeams();
      if (!teams.length) {
        listEl.innerHTML = emptyState(
          'No teams created yet',
          'Create a team to organize your technicians and assign machines.',
          isGlobal ? `<button id="btn-add-team-empty" class="btn btn-primary btn-sm">Add first team</button>` : ''
        );
        const emptyBtn = listEl.querySelector('#btn-add-team-empty');
        if (emptyBtn) emptyBtn.addEventListener('click', handleAddTeam);
        return;
      }

      listEl.innerHTML = `
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Team name</th>
                <th>Members</th>
                <th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${teams.map(t => {
                const members = t.members || [];
                const rows = members.length
                  ? members.map(m => `
                      <div class="member-row">
                        <span class="member-name">${esc(m.full_name)}</span>
                        <span class="badge ${ROLE_BADGE_CLASSES[m.role] || 'badge-muted'}">${ROLE_LABELS[m.role] || esc(m.role)}</span>
                        ${m.active ? '' : '<span class="badge badge-warning">Inactive</span>'}
                      </div>
                    `).join('')
                  : '<p class="small muted mb-0">No staff assigned to this team yet.</p>';
                return `
                  <tr data-id="${t.id}">
                    <td class="strong">${esc(t.name)}</td>
                    <td>
                      <span class="badge badge-accent">${t.member_count} member${t.member_count === 1 ? '' : 's'}</span>
                    </td>
                    <td class="text-right">
                      <div class="cell-actions">
                        <button class="btn btn-ghost btn-sm toggle-team-btn" data-id="${t.id}"
                          aria-expanded="false" aria-controls="team-members-${t.id}">Show members</button>
                        ${isGlobal ? `
                          <button class="btn btn-ghost btn-sm edit-team-btn" data-id="${t.id}" data-name="${esc(t.name)}">Edit</button>
                          <button class="btn btn-danger btn-sm delete-team-btn" data-id="${t.id}" data-name="${esc(t.name)}" ${t.member_count > 0 ? 'disabled title="Cannot delete team with active members"' : ''}>Delete</button>
                        ` : ''}
                      </div>
                    </td>
                  </tr>
                  <tr class="group-details" id="team-members-${t.id}" hidden>
                    <td colspan="3">
                      <div class="group-details-head">Members of ${esc(t.name)}</div>
                      <div class="members-list">${rows}</div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      listEl.querySelectorAll('.toggle-team-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const details = listEl.querySelector(`#team-members-${btn.dataset.id}`);
          if (!details) return;
          details.hidden = !details.hidden;
          btn.setAttribute('aria-expanded', String(!details.hidden));
          btn.textContent = details.hidden ? 'Show members' : 'Hide members';
        });
      });

      listEl.querySelectorAll('.edit-team-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          handleEditTeam({
            id: btn.dataset.id,
            name: btn.dataset.name,
          });
        });
      });

      listEl.querySelectorAll('.delete-team-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          handleDeleteTeam(btn.dataset.id, btn.dataset.name);
        });
      });
    } catch (err) {
      listEl.innerHTML = alertText(`Failed to load teams: ${esc(err.message)}`);
    }
  }

  function handleAddTeam() {
    openModal({
      title: 'Add new team',
      contentHtml: `
        <div class="field">
          <label class="label" for="team-name">Team name *</label>
          <input class="input" id="team-name" name="name" required placeholder="e.g. Team A">
        </div>
        <p class="error-text"></p>
      `,
      submitText: 'Create team',
      onSubmit: async (form, close) => {
        const name = form.name.value;
        await createTeam({ name });
        toast(`Team "${name}" created successfully.`);
        close();
        await refresh();
      }
    });
  }

  function handleEditTeam(team) {
    openModal({
      title: 'Edit team',
      contentHtml: `
        <div class="field">
          <label class="label" for="team-name">Team name *</label>
          <input class="input" id="team-name" name="name" required value="${esc(team.name)}">
        </div>
        <p class="error-text"></p>
      `,
      submitText: 'Save changes',
      onSubmit: async (form, close) => {
        const name = form.name.value;
        await updateTeam(team.id, { name });
        toast(`Team "${name}" updated.`);
        close();
        await refresh();
      }
    });
  }

  function handleDeleteTeam(id, name) {
    openModal({
      title: 'Delete team',
      danger: true,
      submitText: 'Delete team',
      contentHtml: `
        <p>Are you sure you want to delete team <strong>${esc(name)}</strong>?</p>
        <p class="small muted mt-2">This action cannot be undone.</p>
        <p class="error-text"></p>
      `,
      onSubmit: async (form, close) => {
        await deleteTeam(id);
        toast(`Team "${name}" deleted.`);
        close();
        await refresh();
      }
    });
  }

  const addBtn = container.querySelector('#btn-add-team');
  if (addBtn) addBtn.addEventListener('click', handleAddTeam);

  await refresh();
}
