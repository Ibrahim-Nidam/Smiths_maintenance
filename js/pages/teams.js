import { listTeams, createTeam, updateTeam, deleteTeam } from '../api/teams.js';
import { pageHeader, emptyState, loadingState, alertText, esc } from '../components/ui.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { ROLES } from '../auth.js';

export async function render(container, params, ctx) {
  const isGlobal = [ROLES.ADMIN, ROLES.MANAGER].includes(ctx.profile.role);

  const actions = isGlobal
    ? `<button id="btn-add-team" class="btn btn-primary btn-sm">Add team</button>`
    : '';

  container.innerHTML = pageHeader('Teams', 'Manage maintenance teams and assignments.', actions) +
    `<div id="teams-list">${loadingState('Loading teams...')}</div>`;

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
                ${isGlobal ? '<th class="text-right">Actions</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${teams.map(t => `
                <tr data-id="${t.id}">
                  <td class="strong">${esc(t.name)}</td>
                  <td>
                    <span class="badge badge-accent">${t.member_count} member${t.member_count === 1 ? '' : 's'}</span>
                  </td>
                  ${isGlobal ? `
                    <td class="text-right">
                      <div class="cell-actions">
                        <button class="btn btn-ghost btn-sm edit-team-btn" data-id="${t.id}" data-name="${esc(t.name)}">Edit</button>
                        <button class="btn btn-danger btn-sm delete-team-btn" data-id="${t.id}" data-name="${esc(t.name)}" ${t.member_count > 0 ? 'disabled title="Cannot delete team with active members"' : ''}>Delete</button>
                      </div>
                    </td>
                  ` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

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
      submitText: 'Create Team',
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
      submitText: 'Save Changes',
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
