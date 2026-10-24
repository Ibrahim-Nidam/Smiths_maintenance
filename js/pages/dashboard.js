import { listMachines } from '../api/machines.js';
import { listRmaUnits } from '../api/rma.js';
import { listStockItems } from '../api/stock.js';
import { pageHeader, esc } from '../components/ui.js';
import { ROLES } from '../auth.js';
import { copyButton } from '../components/input-enhancements.js';

const QUICK_LINKS = [
  { href: '#/machines', label: 'Machines directory', roles: null },
  { href: '#/stock', label: 'Stock & parts inventory', roles: null },
  { href: '#/parts', label: 'Parts catalogue', roles: null },
  { href: '#/rma', label: 'RMA tags', roles: null },
  { href: '#/history', label: 'Global audit history', roles: null },
  { href: '#/staff', label: 'Staff (users & teams)', roles: [ROLES.ADMIN, ROLES.MANAGER] },
];

function linkRows(role) {
  return QUICK_LINKS
    .filter(l => !l.roles || l.roles.includes(role))
    .map(l => `<a class="link-row" href="${l.href}"><span>${l.label}</span><span class="link-arrow" aria-hidden="true">&rarr;</span></a>`)
    .join('');
}

export async function render(container, params, ctx) {
  const userName = ctx.profile.full_name || 'Technician';

  container.innerHTML = pageHeader('Dashboard', `Fleet overview and system status. Signed in as ${esc(userName)}.`) + `
    <div id="dashboard-stats" class="stats mb-8">
      ${['Fleet operational rate', 'RMA', 'Low stock warning', 'Down machines'].map(label => `
        <div class="stat">
          <div class="stat-label">${label}</div>
          <div class="stat-value">&mdash;</div>
          <div class="stat-note">&mdash;</div>
        </div>
      `).join('')}
    </div>

    <div id="low-stock-container" class="mb-8"></div>

    <div class="grid-1-1">
      <div id="fleet-widget-container"></div>

      <div class="panel">
        <div class="panel-head"><h2 class="panel-title">Quick navigation</h2></div>
        <div class="link-list">${linkRows(ctx.profile.role)}</div>
      </div>
    </div>
  `;

  try {
    const [machines, rmaUnits, nonSerStock, consumableStock] = await Promise.all([
      listMachines().catch(() => []),
      listRmaUnits().catch(() => []),
      listStockItems('non_serialized').catch(() => []),
      listStockItems('consumable').catch(() => []),
    ]);

    const totalMachines = machines.length;
    const operationalCount = machines.filter(m => m.status === 'operational').length;
    const degradedCount = machines.filter(m => m.status === 'degraded').length;
    const downCount = machines.filter(m => m.status === 'down').length;
    const decommissionedCount = machines.filter(m => m.status === 'decommissioned').length;

    const opRate = totalMachines ? Math.round((operationalCount / totalMachines) * 100) : 100;

    const allStock = [...nonSerStock, ...consumableStock];
    const lowStockItems = allStock.filter(it => parseFloat(it.quantity) <= parseFloat(it.min_quantity));

    // KPI cards
    container.querySelector('#dashboard-stats').innerHTML = `
      <div class="stat">
        <div class="stat-label">Fleet operational rate</div>
        <div class="stat-value">${opRate}%</div>
        <div class="stat-note">${operationalCount} of ${totalMachines} machines operational</div>
      </div>

      <div class="stat">
        <div class="stat-label">RMA</div>
        <div class="stat-value ${rmaUnits.length ? 'text-danger' : ''}">${rmaUnits.length}</div>
        <div class="stat-note">Tagged defective units</div>
      </div>

      <div class="stat">
        <div class="stat-label">Low stock warning</div>
        <div class="stat-value ${lowStockItems.length ? 'text-warning' : ''}">${lowStockItems.length}</div>
        <div class="stat-note">Parts at or below minimum threshold</div>
      </div>

      <div class="stat">
        <div class="stat-label">Down machines</div>
        <div class="stat-value ${downCount ? 'text-danger' : ''}">${downCount}</div>
        <div class="stat-note">${degradedCount} degraded, ${decommissionedCount} decommissioned</div>
      </div>
    `;

    // Low stock alert
    const lowStockContainer = container.querySelector('#low-stock-container');
    if (lowStockItems.length > 0) {
      lowStockContainer.innerHTML = `
        <div class="alert alert-warning">
          <div class="row row-between mb-3">
            <h3 class="alert-title">Low stock re-order threshold (${lowStockItems.length})</h3>
            <a href="#/stock" class="small strong">Manage stock &rarr;</a>
          </div>
          <div class="stack-sm">
            ${lowStockItems.slice(0, 4).map(it => `
              <div class="alert-row">
                <span class="mono strong">${esc(it.part_number)}${copyButton(it.part_number, 'Copy part number')}</span>
                <span class="small secondary truncate grow">${esc(it.name)}</span>
                <span class="small strong">${it.quantity} <span class="muted">/ min ${it.min_quantity}</span></span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Fleet status breakdown
    const meter = (label, value, modifier) => `
      <div class="meter">
        <div class="meter-head">
          <span class="meter-label"><span class="dot ${modifier ? `text-${modifier}` : ''}"></span>${label}</span>
          <span>${value}</span>
        </div>
        <div class="meter-track">
          <div class="meter-fill ${modifier ? `is-${modifier}` : ''}" style="width: ${totalMachines ? (value / totalMachines) * 100 : 0}%"></div>
        </div>
      </div>
    `;

    container.querySelector('#fleet-widget-container').innerHTML = `
      <div class="panel">
        <div class="panel-head"><h2 class="panel-title">Fleet status breakdown</h2></div>
        <div class="stack">
          ${meter('Operational', operationalCount, 'success')}
          ${meter('Degraded', degradedCount, 'warning')}
          ${meter('Down / offline', downCount, 'danger')}
        </div>
      </div>
    `;

  } catch (err) {
    container.querySelector('#dashboard-stats').innerHTML =
      `<div class="alert alert-danger"><p class="alert-text">Failed to load dashboard data: ${esc(err.message)}</p></div>`;
  }
}
