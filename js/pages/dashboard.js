import { listMachines } from '../api/machines.js';
import { listRmaUnits } from '../api/rma.js';
import { listStockItems } from '../api/stock.js';
import { pageHeader, esc } from '../components/ui.js';
import { ROLES } from '../auth.js';

export async function render(container, params, ctx) {
  const userName = ctx.profile.full_name || 'Technician';

  container.innerHTML = pageHeader('Dashboard', `Fleet overview & system status. Logged in as ${esc(userName)}.`) + `
    <!-- KPI Cards Overview -->
    <div id="dashboard-stats" class="stats mb-8">
      <div class="stat">
        <div class="stat-label">Fleet Operational Rate</div>
        <div class="stat-value">—</div>
        <div class="hint mt-2 font-medium">—</div>
      </div>
      <div class="stat">
        <div class="stat-label">RMA</div>
        <div class="stat-value">—</div>
        <div class="hint mt-2 font-medium">—</div>
      </div>
      <div class="stat">
        <div class="stat-label">Low Stock Warning</div>
        <div class="stat-value">—</div>
        <div class="hint mt-2 font-medium">—</div>
      </div>
      <div class="stat">
        <div class="stat-label">Down Machines</div>
        <div class="stat-value">—</div>
        <div class="hint mt-2 font-medium">—</div>
      </div>
    </div>

    <!-- Low Stock Alert Banner -->
    <div id="low-stock-container" class="mb-8"></div>

    <!-- Main Dashboard Layout Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <!-- Fleet Status Breakdown -->
      <div id="fleet-widget-container"></div>

      <!-- Quick Operations Panel -->
      <div class="panel">
        <h2 class="text-base font-bold m-0 mb-4 pb-2 border-b border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100">
          Quick Navigation
        </h2>
        <div class="space-y-2">
          <a href="#/machines" class="btn btn-secondary w-full justify-between text-left font-medium text-sm">
            <span>Machines Directory</span>
            <span class="text-xs text-gray-500">&rarr;</span>
          </a>
          <a href="#/stock" class="btn btn-secondary w-full justify-between text-left font-medium text-sm">
            <span>Stock & Parts Inventory</span>
            <span class="text-xs text-gray-500">&rarr;</span>
          </a>
          <a href="#/rma" class="btn btn-secondary w-full justify-between text-left font-medium text-sm">
            <span>RMA Tags</span>
            <span class="text-xs text-gray-500">&rarr;</span>
          </a>
          <a href="#/history" class="btn btn-secondary w-full justify-between text-left font-medium text-sm">
            <span>Global Audit History</span>
            <span class="text-xs text-gray-500">&rarr;</span>
          </a>
          ${[ROLES.ADMIN, ROLES.MANAGER].includes(ctx.profile.role) ? `
            <a href="#/users" class="btn btn-secondary w-full justify-between text-left font-medium text-sm">
              <span>User & Access Control</span>
              <span class="text-xs text-gray-500">&rarr;</span>
            </a>
          ` : ''}
        </div>
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

    // Render KPI Cards
    container.querySelector('#dashboard-stats').innerHTML = `
      <div class="stat">
        <div class="stat-label">Fleet Operational Rate</div>
        <div class="stat-value">${opRate}%</div>
        <div class="hint text-xs mt-2 font-medium">${operationalCount} of ${totalMachines} machines operational</div>
      </div>

      <div class="stat">
        <div class="stat-label">RMA</div>
        <div class="stat-value ${rmaUnits.length ? 'text-alert' : ''}">${rmaUnits.length}</div>
        <div class="hint text-xs mt-2 font-medium">Tagged defective units</div>
      </div>

      <div class="stat">
        <div class="stat-label">Low Stock Warning</div>
        <div class="stat-value ${lowStockItems.length ? 'text-amber-700 dark:text-amber-400' : ''}">${lowStockItems.length}</div>
        <div class="hint text-xs mt-2 font-medium">Parts at or below minimum threshold</div>
      </div>

      <div class="stat">
        <div class="stat-label">Down Machines</div>
        <div class="stat-value ${downCount ? 'text-alert' : ''}">${downCount}</div>
        <div class="hint text-xs mt-2 font-medium">${degradedCount} degraded, ${decommissionedCount} decommissioned</div>
      </div>
    `;

    // Low Stock Alert Section
    const lowStockContainer = container.querySelector('#low-stock-container');
    if (lowStockItems.length > 0) {
      lowStockContainer.innerHTML = `
        <div class="panel border-l-4 border-amber-600 bg-amber-50/50 dark:bg-amber-950/20 p-5 rounded-md">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-bold text-amber-900 dark:text-amber-300 m-0">
              Low Stock Re-order Threshold Warning (${lowStockItems.length})
            </h3>
            <a href="#/stock" class="text-xs font-bold text-amber-800 dark:text-amber-400 hover:underline">
              Manage Stock &rarr;
            </a>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            ${lowStockItems.slice(0, 4).map(it => `
              <div class="p-2.5 rounded border border-amber-300 dark:border-amber-800 bg-white dark:bg-gray-900 flex items-center justify-between text-xs">
                <div>
                  <span class="font-bold font-mono text-gray-900 dark:text-gray-100">${esc(it.part_number)}</span>
                  <span class="text-gray-700 dark:text-gray-300 block truncate max-w-[160px] font-medium">${esc(it.name)}</span>
                </div>
                <div class="text-right">
                  <span class="font-bold text-alert text-sm">${it.quantity}</span>
                  <span class="text-gray-600 dark:text-gray-400 font-semibold">/ min ${it.min_quantity}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Fleet Status Widget
    const fleetContainer = container.querySelector('#fleet-widget-container');
    fleetContainer.innerHTML = `
      <div class="panel">
        <h2 class="text-base font-bold m-0 mb-4 pb-2 border-b border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100">
          Fleet Status Breakdown
        </h2>
        <div class="space-y-4">
          <div>
            <div class="flex justify-between text-xs font-bold mb-1">
              <span class="text-emerald-800 dark:text-emerald-400 flex items-center gap-1.5">
                <span class="dot bg-emerald-500"></span> Operational
              </span>
              <span class="text-gray-900 dark:text-gray-100 font-bold">${operationalCount}</span>
            </div>
            <div class="w-full bg-gray-200 dark:bg-gray-800 h-2 rounded-full overflow-hidden">
              <div class="bg-emerald-500 h-full rounded-full" style="width: ${totalMachines ? (operationalCount/totalMachines)*100 : 0}%"></div>
            </div>
          </div>

          <div>
            <div class="flex justify-between text-xs font-bold mb-1">
              <span class="text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
                <span class="dot bg-amber-500"></span> Degraded
              </span>
              <span class="text-gray-900 dark:text-gray-100 font-bold">${degradedCount}</span>
            </div>
            <div class="w-full bg-gray-200 dark:bg-gray-800 h-2 rounded-full overflow-hidden">
              <div class="bg-amber-500 h-full rounded-full" style="width: ${totalMachines ? (degradedCount/totalMachines)*100 : 0}%"></div>
            </div>
          </div>

          <div>
            <div class="flex justify-between text-xs font-bold mb-1">
              <span class="text-rose-800 dark:text-rose-400 flex items-center gap-1.5">
                <span class="dot bg-rose-500"></span> Down / Offline
              </span>
              <span class="text-gray-900 dark:text-gray-100 font-bold">${downCount}</span>
            </div>
            <div class="w-full bg-gray-200 dark:bg-gray-800 h-2 rounded-full overflow-hidden">
              <div class="bg-rose-500 h-full rounded-full" style="width: ${totalMachines ? (downCount/totalMachines)*100 : 0}%"></div>
            </div>
          </div>
        </div>
      </div>
    `;

  } catch (err) {
    container.querySelector('#dashboard-stats').innerHTML =
      `<div class="p-4 bg-red-50 text-red-900 rounded-md border border-red-200 text-sm font-semibold">Failed to load dashboard data: ${esc(err.message)}</div>`;
  }
}
