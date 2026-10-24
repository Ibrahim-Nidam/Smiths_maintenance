import { renderUsersPanel } from './users.js';
import { renderTeamsPanel } from './teams.js';
import { pageHeader, emptyState } from '../components/ui.js';
import { ROLES } from '../auth.js';

// One page for user accounts and teams (#/staff).
export async function render(container, params, ctx) {
  const isGlobal = [ROLES.ADMIN, ROLES.MANAGER].includes(ctx.profile.role);
  if (!isGlobal) {
    container.innerHTML = emptyState('Access Denied', 'Only Admins and Maintenance Managers can manage staff.');
    return;
  }

  // Keep old bookmarks working: #/users, #/teams and #/people point at this page.
  const hash = window.location.hash;
  if (hash.startsWith('#/users') || hash.startsWith('#/teams') || hash.startsWith('#/people')) {
    window.location.hash = hash.includes('teams') ? '#/staff/teams' : '#/staff';
    return;
  }

  const activeTab = params.tab === 'teams' ? 'teams' : 'users';

  container.innerHTML = pageHeader(
    'Staff',
    'User accounts, roles and maintenance teams in one place.'
  ) + `
    <div class="tabs" role="tablist">
      <button class="tab-btn staff-tab-btn" type="button" role="tab" data-tab="users" aria-selected="${activeTab === 'users'}">Users</button>
      <button class="tab-btn staff-tab-btn" type="button" role="tab" data-tab="teams" aria-selected="${activeTab === 'teams'}">Teams</button>
    </div>
    <div id="staff-panel"></div>
  `;

  const panelEl = container.querySelector('#staff-panel');
  if (activeTab === 'teams') {
    await renderTeamsPanel(panelEl, ctx);
  } else {
    await renderUsersPanel(panelEl, ctx);
  }

  container.querySelectorAll('.staff-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.hash = btn.dataset.tab === 'teams' ? '#/staff/teams' : '#/staff';
    });
  });
}
