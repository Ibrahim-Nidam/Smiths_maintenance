// Hash router: #/machines, #/machines/K289, #/history ...
const routes = [
  { path: /^\/dashboard$/,         page: 'dashboard' },
  { path: /^\/machines$/,          page: 'machines' },
  { path: /^\/machines\/([^/?]+)/, page: 'machine-detail', params: ['code'] },
  { path: /^\/stock$/,             page: 'stock' },
  { path: /^\/rma$/,               page: 'rma' },
  { path: /^\/history$/,           page: 'history' },
  { path: /^\/teams$/,             page: 'teams' },
  { path: /^\/users$/,             page: 'users' },
  { path: /^\/settings$/,          page: 'settings' },
  { path: /^\/styleguide$/,        page: 'styleguide' },
];

export function startRouter(container, ctx) {
  async function render() {
    const rawHash = window.location.hash.replace(/^#/, '') || '/dashboard';
    const hashPath = rawHash.split('?')[0]; // Extract path without query parameters

    for (const r of routes) {
      const m = hashPath.match(r.path);
      if (!m) continue;
      const params = {};
      (r.params || []).forEach((name, i) => (params[name] = decodeURIComponent(m[i + 1])));
      const mod = await import(`./pages/${r.page}.js`);
      container.innerHTML = '';
      await mod.render(container, params, ctx);
      window.scrollTo(0, 0);
      return;
    }
    container.innerHTML = '<div class="empty"><p class="empty-title">Page not found</p><p class="empty-text">Use the menu above to go back.</p></div>';
  }
  window.addEventListener('hashchange', render);
  render();
}
