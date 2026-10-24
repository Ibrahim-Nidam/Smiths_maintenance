import { listUsers, createUser, updateUser, deleteUser, resetUserPassword, listAccountEmails, updateUserEmail } from '../api/users.js';
import { listTeams } from '../api/teams.js';
import { emptyState, loadingState, alertText, esc } from '../components/ui.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { ROLES } from '../auth.js';

// New accounts get first.lastname@DOMAIN, generated from the full name.
// The admin can still adjust the address before creating the account.
const EMAIL_DOMAIN = 'traser.ma';

export function suggestEmail(fullName) {
  const clean = String(fullName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const tokens = clean.split(/[^a-z0-9]+/).filter(Boolean);
  if (!tokens.length) return '';
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  const local = last && last !== first ? `${first}.${last}` : first;
  return `${local}@${EMAIL_DOMAIN}`;
}

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

// Users tab of the Staff page (#/staff).
export async function renderUsersPanel(container, ctx) {
  const isAdmin = ctx.profile.role === ROLES.ADMIN;
  const canManage = isAdmin || ctx.profile.role === ROLES.MANAGER;

  container.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">Users</h2>
          <p class="small muted mt-1">User accounts, roles and team assignments.</p>
        </div>
        ${canManage ? `<button id="btn-add-user" class="btn btn-primary btn-sm">Create user</button>` : ''}
      </div>
      <div id="users-list">${loadingState('Loading users...')}</div>
    </div>
  `;

  // Data refreshed together on every change.
  let rawUsers = [];
  let teams = [];
  // Sign-in addresses, loaded with the users (empty until sql/012 is applied).
  let emails = {};

  async function refresh() {
    const listEl = container.querySelector('#users-list');
    try {
      [rawUsers, teams, emails] = await Promise.all([
        listUsers(),
        listTeams().catch(() => []),
        listAccountEmails(),
      ]);

      // Non-admins must NOT see Admin users in the list
      const users = isAdmin ? rawUsers : rawUsers.filter(u => u.role !== ROLES.ADMIN);

      if (!users.length) {
        listEl.innerHTML = emptyState(
          'No users found',
          'Create user accounts to give technicians and leads access.',
          canManage ? `<button id="btn-add-user-empty" class="btn btn-primary btn-sm">Create first user</button>` : ''
        );
        const emptyBtn = listEl.querySelector('#btn-add-user-empty');
        if (emptyBtn) emptyBtn.addEventListener('click', () => handleAddUser(teams));
        return;
      }

      listEl.innerHTML = `
        <div class="filter-row">
          <div class="search-field">
            <input type="search" id="user-search" class="input" placeholder="Filter users by name, email, role or team" autocomplete="off">
          </div>
          <span class="small muted" id="user-count">${users.length} user${users.length === 1 ? '' : 's'}</span>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Full name</th>
                <th>Sign-in email</th>
                <th>Role</th>
                <th>Team</th>
                <th>Status</th>
                ${canManage ? '<th class="text-right">Actions</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${users.map(u => {
                const isSelf = u.id === ctx.profile.id;
                return `
                  <tr data-id="${u.id}" class="${!u.active ? 'is-muted' : ''}">
                    <td class="strong">
                      ${esc(u.full_name)}
                      ${isSelf ? ' <span class="small muted">(you)</span>' : ''}
                    </td>
                    <td class="secondary">${emails[u.id] ? esc(emails[u.id]) : '<span class="muted">&mdash;</span>'}</td>
                    <td>
                      <span class="badge ${ROLE_BADGE_CLASSES[u.role] || ''}">
                        ${esc(ROLE_LABELS[u.role] || u.role)}
                      </span>
                    </td>
                    <td class="secondary">${esc(u.teams ? u.teams.name : '—')}</td>
                    <td>
                      <button type="button"
                        class="state-toggle toggle-active-btn ${u.active ? 'is-on' : ''}"
                        data-id="${u.id}"
                        data-name="${esc(u.full_name)}"
                        data-active="${u.active}"
                        ${isSelf || !canManage ? 'disabled title="Status change disabled"' : ''}>
                        <span class="dot"></span>${u.active ? 'Active' : 'Disabled'}
                      </button>
                    </td>
                    ${canManage ? `
                      <td class="text-right">
                        <div class="cell-actions">
                          <button class="btn btn-ghost btn-sm edit-user-btn"
                            data-id="${u.id}"
                            data-name="${esc(u.full_name)}"
                            data-role="${u.role}"
                            data-team="${u.team_id || ''}"
                            data-active="${u.active}">
                            Edit
                          </button>
                          <button class="btn btn-ghost btn-sm reset-pass-btn"
                            data-id="${u.id}"
                            data-name="${esc(u.full_name)}">
                            Reset password
                          </button>
                          <button class="btn btn-danger btn-sm delete-user-btn"
                            data-id="${u.id}"
                            data-name="${esc(u.full_name)}"
                            ${isSelf ? 'disabled title="You cannot delete your own account"' : ''}>
                            Delete
                          </button>
                        </div>
                      </td>
                    ` : ''}
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      const searchEl = listEl.querySelector('#user-search');
      const countEl = listEl.querySelector('#user-count');
      if (searchEl) {
        searchEl.addEventListener('input', () => {
          const term = searchEl.value.trim().toLowerCase();
          let shown = 0;
          listEl.querySelectorAll('tbody tr').forEach(row => {
            const matches = !term || row.textContent.toLowerCase().includes(term);
            row.style.display = matches ? '' : 'none';
            if (matches) shown += 1;
          });
          if (countEl) countEl.textContent = `${shown} user${shown === 1 ? '' : 's'}`;
        });
      }

      // Active status inline toggle listener
      if (canManage) {
        listEl.querySelectorAll('.toggle-active-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (btn.disabled) return;
            const userId = btn.dataset.id;
            const userName = btn.dataset.name;
            const currentActive = btn.dataset.active === 'true';
            const newActive = !currentActive;

            try {
              btn.disabled = true;
              await updateUser(userId, { active: newActive }, ctx.profile.role);
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

        listEl.querySelectorAll('.reset-pass-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            handleResetPass(btn.dataset.id, btn.dataset.name);
          });
        });

        listEl.querySelectorAll('.delete-user-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            handleDeleteUser(btn.dataset.id, btn.dataset.name);
          });
        });
      }
    } catch (err) {
      listEl.innerHTML = alertText(`Failed to load users: ${esc(err.message)}`);
    }
  }

  function handleAddUser(teams) {
    const roleOptions = `
      <option value="${ROLES.TECHNICIAN}">Technician</option>
      <option value="${ROLES.TEAM_LEAD}">Team Lead</option>
      <option value="${ROLES.MANAGER}">Maintenance Manager</option>
      ${isAdmin ? `<option value="${ROLES.ADMIN}">Admin</option>` : ''}
    `;

    openModal({
      title: 'Create user account',
      contentHtml: `
        <div class="alert alert-info mb-4">
          <p class="alert-text">The default password for new accounts is <code>Smiths2026!</code>. The user can change it from their profile after signing in.</p>
        </div>
        <div class="field">
          <label class="label" for="user-name">Full name *</label>
          <input class="input" id="user-name" name="fullName" required placeholder="John Doe" autocomplete="off">
        </div>
        <div class="field">
          <label class="label" for="user-email">Sign-in email *</label>
          <input class="input" id="user-email" name="email" type="email" required placeholder="john.doe@${EMAIL_DOMAIN}" autocomplete="off">
          <span class="hint">Generated from the full name as first.lastname@${EMAIL_DOMAIN}. Edit it before creating the account if needed.</span>
        </div>
        <div class="field">
          <label class="label" for="user-pass">Initial password *</label>
          <input class="input" id="user-pass" name="password" type="text" required value="Smiths2026!">
          <span class="hint">Kept as the default password if unchanged.</span>
        </div>
        <div class="field">
          <label class="label" for="user-role">Role *</label>
          <select class="select" id="user-role" name="role" required>
            ${roleOptions}
          </select>
        </div>
        <div class="field">
          <label class="label" for="user-team">Assigned team</label>
          <select class="select" id="user-team" name="teamId">
            <option value="">No team / all teams</option>
            ${teams.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}
          </select>
        </div>
        <p class="error-text"></p>
      `,
      submitText: 'Create account',
      onOpen: modal => {
        const nameInput = modal.querySelector('#user-name');
        const emailInput = modal.querySelector('#user-email');
        let emailEdited = false;

        emailInput.value = suggestEmail(nameInput.value);
        emailInput.addEventListener('input', () => { emailEdited = true; });
        nameInput.addEventListener('input', () => {
          if (emailEdited) return;
          const suggestion = suggestEmail(nameInput.value);
          if (suggestion) emailInput.value = suggestion;
        });
      },
      onSubmit: async (form, close) => {
        const email = form.email.value.trim();
        const password = form.password.value || 'Smiths2026!';
        const fullName = form.fullName.value.trim();
        const role = form.role.value;
        const teamId = form.teamId.value;

        if (!email || !fullName) throw new Error('Email and Full Name are required.');

        await createUser({ email, password, fullName, role, teamId });
        toast(`User "${fullName}" created successfully.`);
        close();
        await refresh();
      }
    });
  }

  function handleEditUser(user, teams) {
    const isSelf = user.id === ctx.profile.id;
    const hasEmail = emails[user.id] !== undefined;

    const roleOptions = `
      <option value="${ROLES.TECHNICIAN}" ${user.role === ROLES.TECHNICIAN ? 'selected' : ''}>Technician</option>
      <option value="${ROLES.TEAM_LEAD}" ${user.role === ROLES.TEAM_LEAD ? 'selected' : ''}>Team Lead</option>
      <option value="${ROLES.MANAGER}" ${user.role === ROLES.MANAGER ? 'selected' : ''}>Maintenance Manager</option>
      ${isAdmin ? `<option value="${ROLES.ADMIN}" ${user.role === ROLES.ADMIN ? 'selected' : ''}>Admin</option>` : ''}
    `;

    openModal({
      title: 'Edit user profile',
      contentHtml: `
        <div class="field">
          <label class="label" for="user-name">Full name *</label>
          <input class="input" id="user-name" name="fullName" required value="${esc(user.fullName)}">
        </div>
        <div class="field">
          <label class="label" for="user-email">Sign-in email *</label>
          ${hasEmail
            ? `<input class="input" id="user-email" name="email" type="email" required value="${esc(emails[user.id] || '')}" autocomplete="off">
               <span class="hint">The address used to sign in (with the password or the full name).</span>`
            : `<input class="input" id="user-email" name="email" disabled placeholder="Not available yet">
               <span class="hint">Run sql/012_login_and_accounts.sql in the Supabase SQL editor to manage email addresses.</span>`}
        </div>
        <div class="field">
          <label class="label" for="user-role">Role *</label>
          <select class="select" id="user-role" name="role" required ${isSelf ? 'disabled title="You cannot change your own role"' : ''}>
            ${roleOptions}
          </select>
        </div>
        <div class="field">
          <label class="label" for="user-team">Assigned team</label>
          <select class="select" id="user-team" name="teamId">
            <option value="">No team / all teams</option>
            ${teams.map(t => `<option value="${t.id}" ${user.teamId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="checkbox-row" for="user-active">
            <input type="checkbox" id="user-active" name="active" ${user.active ? 'checked' : ''} ${isSelf ? 'disabled' : ''}>
            <span class="label">Account active</span>
          </label>
        </div>
        <p class="error-text"></p>
      `,
      submitText: 'Save profile',
      onSubmit: async (form, close) => {
        const fullName = form.fullName.value.trim();
        const role = form.role ? form.role.value : user.role;
        const teamId = form.teamId.value;
        const active = form.active ? form.active.checked : user.active;
        const newEmail = hasEmail && form.email ? form.email.value.trim() : '';

        if (newEmail && newEmail.toLowerCase() !== String(emails[user.id] || '').toLowerCase()) {
          await updateUserEmail(user.id, newEmail);
        }

        await updateUser(user.id, { fullName, role, teamId, active }, ctx.profile.role);
        toast(`Profile for "${fullName}" updated.`);
        close();
        await refresh();
      }
    });
  }

  function handleResetPass(userId, userName) {
    openModal({
      title: 'Reset user password',
      submitText: 'Reset password',
      contentHtml: `
        <p>Reset the password for <strong>${esc(userName)}</strong>?</p>
        <div class="alert alert-warning mt-3">
          <p class="alert-text">The password will be reset to the default: <code>Smiths2026!</code></p>
        </div>
        <p class="error-text mt-2"></p>
      `,
      onSubmit: async (form, close) => {
        await resetUserPassword(userId, 'Smiths2026!');
        toast(`Password for "${userName}" reset to default (Smiths2026!).`);
        close();
      }
    });
  }

  function handleDeleteUser(id, name) {
    openModal({
      title: 'Delete user account',
      danger: true,
      submitText: 'Delete account',
      contentHtml: `
        <p>Are you sure you want to delete the account of <strong>${esc(name)}</strong>?</p>
        <p class="small muted mt-2">This removes the profile record from the maintenance system.</p>
        <p class="error-text"></p>
      `,
      onSubmit: async (form, close) => {
        await deleteUser(id, ctx.profile.role);
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
