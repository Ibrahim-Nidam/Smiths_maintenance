import { requireAuth, signOut, ROLES } from './auth.js';
import { startRouter } from './router.js';
import { openProfileModal } from './components/profile-modal.js';
import { initThemeToggle } from './components/theme-toggle.js';
import { initInputEnhancements, initCopyButtons } from './components/input-enhancements.js';

// Initialize theme toggle
initThemeToggle('theme-toggle-btn');
initInputEnhancements();
initCopyButtons();

const NAV = [
  { href: '#/dashboard', label: 'Dashboard', roles: null },
  { href: '#/machines',  label: 'Machines',  roles: null },
  { href: '#/stock',     label: 'Stock',     roles: null },
  { href: '#/parts',     label: 'Parts',     roles: null },
  { href: '#/rma',       label: 'RMA',       roles: null },
  { href: '#/history',   label: 'History',   roles: null },
  { href: '#/staff',     label: 'Staff',     roles: [ROLES.ADMIN, ROLES.MANAGER] },
  { href: '#/settings',  label: 'Settings',  roles: [ROLES.ADMIN, ROLES.MANAGER] },
];

const ROLE_LABELS = {
  admin: 'Admin',
  maintenance_manager: 'Maintenance manager',
  team_lead: 'Team lead',
  technician: 'Technician',
};

const profile = await requireAuth();
if (profile) {
  const nav = document.getElementById('nav');
  const toggle = document.getElementById('menu-toggle');

  document.getElementById('user-name').textContent = profile.full_name;
  document.getElementById('user-role').textContent = ROLE_LABELS[profile.role] ?? profile.role;

  // Open profile modal when clicking user name
  const userBtn = document.getElementById('user-profile-btn');
  if (userBtn) {
    userBtn.addEventListener('click', () => {
      openProfileModal(profile, (updated) => {
        document.getElementById('user-name').textContent = updated.full_name;
      });
    });
  }

  nav.innerHTML = NAV
    .filter(n => !n.roles || n.roles.includes(profile.role))
    .map(n => `<a href="${n.href}" class="nav-link">${n.label}</a>`)
    .join('');

  const markActive = () => {
    const hash = window.location.hash || '#/dashboard';
    nav.querySelectorAll('.nav-link').forEach(a => {
      const href = a.getAttribute('href');
      const on = hash === href || hash.startsWith(href + '/') || hash.startsWith(href + '?');
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.body.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded', 'false');
  };

  toggle.addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  window.addEventListener('hashchange', markActive);
  markActive();

  document.getElementById('logout').addEventListener('click', signOut);
  startRouter(document.getElementById('view'), { profile });
}
