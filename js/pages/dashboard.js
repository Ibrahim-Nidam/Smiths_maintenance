import { listMachines } from '../api/machines.js';
import { listRmaUnits } from '../api/rma.js';
import { listStockItems } from '../api/stock.js';
import { listMaintenanceEvents } from '../api/history.js';
import { pageHeader, esc } from '../components/ui.js';

export async function render(container, params, ctx) {
  container.innerHTML = pageHeader('Dashboard', 'Overview of machines, active maintenance, RMA tags, and stock.') + `
    <div id="dashboard-stats" class="stats mb-8">
      <div class="stat"><div class="stat-label">Total Machines</div><div class="stat-value">—</div></div>
      <div class="stat"><div class="stat-label">Open RMAs</div><div class="stat-value">—</div></div>
      <div class="stat"><div class="stat-label">Low Stock Items</div><div class="stat-value">—</div></div>
      <div class="stat"><div class="stat-label">Operational Rate</div><div class="stat-value">—</div></div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div class="lg:col-span-2">
        <div class="panel bg-white">
          <div class="flex items-center justify-between mb-4 pb-2 border-b border-gray-200">
            <h2 class="text-lg font-semibold m-0">Recent Maintenance Activity</h2>
            <span class="text-xs text-gray-500 font-medium">Append-only audit log</span>
          </div>
          <div id="activity-feed"><p class="text-gray-400 text-sm">Loading activity log...</p></div>
        </div>
      </div>

      <div class="lg:col-span-1">
        <div class="panel bg-white">
          <h2 class="text-lg font-semibold m-0 mb-4 pb-2 border-b border-gray-200">Quick Actions</h2>
          <div class="space-y-3">
            <a href="#/machines" class="btn btn-secondary w-full justify-start text-left font-medium">&rarr; View All Machines</a>
            <a href="#/stock" class="btn btn-secondary w-full justify-start text-left font-medium">&rarr; Check Stock Inventory</a>
            <a href="#/rma" class="btn btn-secondary w-full justify-start text-left font-medium">&rarr; Review RMA Tagged Units</a>
          </div>
        </div>
      </div>
    </div>
  `;

  try {
    const [machines, rmaUnits, nonSerStock, consumableStock, events] = await Promise.all([
      listMachines().catch(() => []),
      listRmaUnits().catch(() => []),
      listStockItems('non_serialized').catch(() => []),
      listStockItems('consumable').catch(() => []),
      listMaintenanceEvents({ limit: 15 }).catch(() => []),
    ]);

    const totalMachines = machines.length;
    const operationalMachines = machines.filter(m => m.status === 'operational').length;
    const opRate = totalMachines ? Math.round((operationalMachines / totalMachines) * 100) : 100;

    const allStock = [...nonSerStock, ...consumableStock];
    const lowStockCount = allStock.filter(it => parseFloat(it.quantity) <= parseFloat(it.min_quantity)).length;

    // Update stats HTML
    container.querySelector('#dashboard-stats').innerHTML = `
      <div class="stat bg-white">
        <div class="stat-label">Total Machines</div>
        <div class="stat-value">${totalMachines}</div>
        <div class="text-xs text-gray-500 mt-1">${operationalMachines} operational</div>
      </div>
      <div class="stat bg-white">
        <div class="stat-label">Open RMAs</div>
        <div class="stat-value text-red-600">${rmaUnits.length}</div>
        <div class="text-xs text-gray-500 mt-1">Tagged defective units</div>
      </div>
      <div class="stat bg-white">
        <div class="stat-label">Low Stock Items</div>
        <div class="stat-value ${lowStockCount > 0 ? 'text-amber-600' : 'text-gray-900'}">${lowStockCount}</div>
        <div class="text-xs text-gray-500 mt-1">Below minimum threshold</div>
      </div>
      <div class="stat bg-white">
        <div class="stat-label">Operational Rate</div>
        <div class="stat-value text-green-600">${opRate}%</div>
        <div class="text-xs text-gray-500 mt-1">Active fleet status</div>
      </div>
    `;

    // Render activity feed
    const feedEl = container.querySelector('#activity-feed');
    if (!events.length) {
      feedEl.innerHTML = `<p class="text-gray-400 text-sm italic py-4 text-center">No maintenance events recorded yet.</p>`;
      return;
    }

    const EVENT_LABELS = {
      part_installed: 'Part Installed',
      part_removed: 'Part Removed',
      part_replaced: 'Part Replaced',
      parts_swapped: 'Parts Swapped',
      part_added_to_machine: 'Part Added to Machine',
      rma_tagged: 'RMA Tagged',
      rma_untagged: 'RMA Untagged',
      machine_created: 'Machine Created',
      machine_updated: 'Machine Updated',
      stock_adjusted: 'Stock Adjusted',
      correction: 'Correction',
    };

    feedEl.innerHTML = `
      <div class="space-y-3">
        ${events.map(ev => {
          const machineCode = ev.machines ? ev.machines.code : 'System';
          const userName = ev.profiles ? ev.profiles.full_name : 'Unknown';
          const dateStr = new Date(ev.occurred_at).toLocaleString();
          const oldSn = ev.old_instance ? ev.old_instance.serial_number : null;
          const newSn = ev.new_instance ? ev.new_instance.serial_number : null;
          const partName = ev.machine_parts ? ev.machine_parts.name : (ev.part_number || '');

          return `
            <div class="p-3 rounded-lg border border-gray-100 bg-gray-50/70 text-sm flex flex-col gap-1">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="font-mono font-semibold text-accent">${esc(machineCode)}</span>
                  <span class="badge badge-solid text-xs">${esc(EVENT_LABELS[ev.event_type] || ev.event_type)}</span>
                </div>
                <span class="text-xs text-gray-400">${dateStr}</span>
              </div>
              <div class="text-gray-800 font-medium">
                ${esc(partName)} ${ev.position ? `(Pos ${ev.position})` : ''}
                ${oldSn ? `<span class="text-red-700 font-mono text-xs">-${oldSn}</span>` : ''}
                ${newSn ? `<span class="text-green-700 font-mono text-xs">+${newSn}</span>` : ''}
              </div>
              ${ev.reason ? `<div class="text-xs text-gray-600">Reason: ${esc(ev.reason)}</div>` : ''}
              ${ev.notes ? `<div class="text-xs text-gray-500 italic">${esc(ev.notes)}</div>` : ''}
              <div class="text-xs text-gray-400 text-right">by ${esc(userName)}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;

  } catch (err) {
    container.querySelector('#activity-feed').innerHTML =
      `<div class="p-3 bg-red-50 text-red-700 rounded text-sm">Failed to load dashboard data: ${esc(err.message)}</div>`;
  }
}
