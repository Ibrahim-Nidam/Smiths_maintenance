import { listUsers, createUser, updateUser, deleteUser } from '../api/users.js';
import { listTeams } from '../api/teams.js';
import { pageHeader, emptyState, esc } from '../components/ui.js';
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
  [ROLES.TECHNICIAN]: 'badge',
};

export async function render(container, params, ctx) {
  const isAdmin = ctx.profile.role === ROLES.ADMIN;

  const actions = isAdmin
    ? `<button id="btn-add-user" class="btn btn-primary btn-sm">+ Create user</button>`
    : '';

  container.innerHTML = pageHeader('Users', 'Manage user accounts, roles and team assignments.', actions) +
    `<div id="users-list"><p class="text-gray-500 text-sm">Loading users...</p></div>`;

  async function refresh() {
    const listEl = container.querySelector('#users-list');
    try {
      const [users, teams] = await Promise.all([listUsers(), listTeams().catch(() => [])]);

      if (!users.length) {
        listEl.innerHTML = emptyState(
          'No users found',
          'Create user accounts to give technicians and leads access.',
          isAdmin ? `<button id="btn-add-user-empty" class="btn btn-primary btn-sm">+ Create first user</button>` : ''
        );
        const emptyBtn = listEl.querySelector('#btn-add-user-empty');
        if (emptyBtn) emptyBtn.addEventListener('click', () => handleAddUser(teams));
        return;
      }

      listEl.innerHTML = `
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Role</th>
                <th>Team</th>
                <th>Status (Click to toggle)</th>
                ${isAdmin ? '<th class="text-right">Actions</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${users.map(u => {
                const isSelf = u.id === ctx.profile.id;
                return `
                  <tr data-id="${u.id}" class="${!u.active ? 'opacity-50 bg-gray-50' : ''}">
                    <td class="font-semibold">
                      ${esc(u.full_name)}
                      ${isSelf ? ' <span class="text-xs text-orange-600 font-normal">(You)</span>' : ''}
                    </td>
                    <td>
                      <span class="badge ${ROLE_BADGE_CLASSES[u.role] || ''}">
                        ${esc(ROLE_LABELS[u.role] || u.role)}
                      </span>
                    </td>
                    <td>${esc(u.teams ? u.teams.name : '—')}</td>
                    <td>
                      <button type="button"
                        class="toggle-active-btn inline-flex items-center text-xs font-medium px-2.5 py-1 rounded border transition cursor-pointer ${
                          u.active
                            ? 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100'
                            : 'text-gray-500 bg-gray-100 border-gray-300 hover:bg-gray-200'
                        }"
                        data-id="${u.id}"
                        data-name="${esc(u.full_name)}"
                        data-active="${u.active}"
                        ${isSelf ? 'disabled title="You cannot disable your own account"' : ''}>
                        ${u.active ? '🟢 Active' : '⚪ Disabled'}
                      </button>
                    </td>
                    ${isAdmin ? `
                      <td class="text-right">
                        <button class="btn btn-ghost btn-sm edit-user-btn"
                          data-id="${u.id}"
                          data-name="${esc(u.full_name)}"
                          data-role="${u.role}"
                          data-team="${u.team_id || ''}"
                          data-active="${u.active}">
                          Edit
                        </button>
                        <button class="btn btn-ghost btn-sm btn-danger delete-user-btn"
                          data-id="${u.id}"
                          data-name="${esc(u.full_name)}"
                          ${isSelf ? 'disabled title="You cannot delete your own account"' : ''}>
                          Delete
                        </button>
                      </td>
                    ` : ''}
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      // Active status inline toggle listener
      listEl.querySelectorAll('.toggle-active-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const userId = btn.dataset.id;
          const userName = btn.dataset.name;
          const currentActive = btn.dataset.active === 'true';
          const newActive = !currentActive;

          try {
            btn.disabled = true;
            await updateUser(userId, { active: newActive });
            toast(`User "${userName}" set to ${newActive ? 'Active' : 'Disabled'}.`);
            await refresh();
          } catch (err) {
            toast(err.message || 'Could not update status', 'error');
            btn.disabled = false;
          }
        });
      });

      listEl.querySelectorAll('.edit-user-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          handleEditUser({
            id: btn.dataset.id,
            fullName: btn.dataset.name,
            role: btn.dataset.role,
            teamId: btn.dataset.team,
            active: btn.dataset.active === 'true',
          }, teams);
        });
      });

      listEl.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          handleDeleteUser(btn.dataset.id, btn.dataset.name);
        });
      });
    } catch (err) {
      listEl.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded-md border border-red-200">Failed to load users: ${esc(err.message)}</div>`;
    }
  }

  function handleAddUser(teams) {
    openModal({
      title: 'Create User Account',
      contentHtml: `
        <div class="field">
          <label class="label" for="user-email">Email Address *</label>
          <input class="input" id="user-email" name="email" type="email" required placeholder="technician@company.com">
        </div>
        <div class="field">
          <label class="label" for="user-pass">Initial Password *</label>
          <input class="input" id="user-pass" name="password" type="password" required minlength="6" placeholder="Min 6 characters">
        </div>
        <div class="field">
          <label class="label" for="user-name">Full Name *</label>
          <input class="input" id="user-name" name="fullName" required placeholder="John Doe">
        </div>
        <div class="field">
          <label class="label" for="user-role">Role *</label>
          <select class="select" id="user-role" name="role" required>
            <option value="${ROLES.TECHNICIAN}">Technician</option>
            <option value="${ROLES.TEAM_LEAD}">Team Lead</option>
            <option value="${ROLES.MANAGER}">Maintenance Manager</option>
            <option value="${ROLES.ADMIN}">Admin</option>
          </select>
        </div>
        <div class="field">
          <label class="label" for="user-team">Assigned Team</label>
          <select class="select" id="user-team" name="teamId">
            <option value="">(No team / All teams)</option>
            ${teams.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}
          </select>
        </div>
        <p class="error-text"></p>
      `,
      submitText: 'Create Account',
      onSubmit: async (form, close) => {
        const email = form.email.value;
        const password = form.password.value;
        const fullName = form.fullName.value;
        const role = form.role.value;
        const teamId = form.teamId.value;

        await createUser({ email, password, fullName, role, teamId });
        toast(`User "${fullName}" created successfully.`);
        close();
        await refresh();
      }
    });
  }

  function handleEditUser(user, teams) {
    const isSelf = user.id === ctx.profile.id;

    openModal({
      title: 'Edit User Profile',
      contentHtml: `
        <div class="field">
          <label class="label" for="user-name">Full Name *</label>
          <input class="input" id="user-name" name="fullName" required value="${esc(user.fullName)}">
        </div>
        <div class="field">
          <label class="label" for="user-role">Role *</label>
          <select class="select" id="user-role" name="role" required ${isSelf ? 'disabled title="You cannot change your own role"' : ''}>
            <option value="${ROLES.TECHNICIAN}" ${user.role === ROLES.TECHNICIAN ? 'selected' : ''}>Technician</option>
            <option value="${ROLES.TEAM_LEAD}" ${user.role === ROLES.TEAM_LEAD ? 'selected' : ''}>Team Lead</option>
            <option value="${ROLES.MANAGER}" ${user.role === ROLES.MANAGER ? 'selected' : ''}>Maintenance Manager</option>
            <option value="${ROLES.ADMIN}" ${user.role === ROLES.ADMIN ? 'selected' : ''}>Admin</option>
          </select>
        </div>
        <div class="field">
          <label class="label" for="user-team">Assigned Team</label>
          <select class="select" id="user-team" name="teamId">
            <option value="">(No team / All teams)</option>
            ${teams.map(t => `<option value="${t.id}" ${user.teamId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field flex items-center gap-3">
          <input type="checkbox" id="user-active" name="active" ${user.active ? 'checked' : ''} ${isSelf ? 'disabled' : ''}>
          <label class="label mb-0 cursor-pointer" for="user-active">Account active</label>
        </div>
        <p class="error-text"></p>
      `,
      submitText: 'Save Profile',
      onSubmit: async (form, close) => {
        const fullName = form.fullName.value;
        const role = form.role ? form.role.value : user.role;
        const teamId = form.teamId.value;
        const active = form.active ? form.active.checked : user.active;

        await updateUser(user.id, { fullName, role, teamId, active });
        toast(`Profile for "${fullName}" updated.`);
        close();
        await refresh();
      }
    });
  }

  function handleDeleteUser(id, name) {
    openModal({
      title: 'Delete User Profile',
      danger: true,
      submitText: 'Delete Account',
      contentHtml: `
        <p>Are you sure you want to delete user account <strong>${esc(name)}</strong>?</p>
        <p class="text-sm text-gray-500 mt-2">This will remove their profile record from the maintenance system.</p>
        <p class="error-text"></p>
      `,
      onSubmit: async (form, close) => {
        await deleteUser(id);
        toast(`User "${name}" deleted.`);
        close();
        await refresh();
      }
    });
  }

  const addBtn = container.querySelector('#btn-add-user');
  if (addBtn) addBtn.addEventListener('click', async () => {
    const teams = await listTeams().catch(() => []);
    handleAddUser(teams);
  });

  await refresh();
}
