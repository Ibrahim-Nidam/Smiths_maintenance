import { pageHeader } from '../components/ui.js';

// Visual reference for the design system. Open at #/styleguide. Not linked in the menu.
export async function render(container) {
  const slots = Array.from({ length: 15 }, (_, i) => {
    const n = i + 1;
    if (n === 8) return `<div class="slot slot-rma"><span class="slot-pos">Position ${n}</span><span class="slot-serial mono">SN-004755</span><span class="badge badge-danger">RMA</span></div>`;
    if (n === 12) return `<div class="slot slot-empty"><span class="slot-pos">Position ${n}</span><span class="slot-serial">Empty</span></div>`;
    return `<div class="slot"><span class="slot-pos">Position ${n}</span><span class="slot-serial mono">SN-${String(4800 + n * 7).padStart(6, '0')}</span></div>`;
  }).join('');

  container.innerHTML =
    pageHeader('Style guide', 'Components used across the app.',
      '<button class="btn btn-secondary">Export</button><button class="btn btn-primary">Add part</button>') +

    `<h2 class="section-title" style="margin-top:0">Overview numbers</h2>
    <div class="stats mb-8">
      <div class="stat">
        <div class="stat-label">Operational machines</div>
        <div class="stat-value">10</div>
        <div class="stat-note">9 of 10 machines operational</div>
      </div>
      <div class="stat">
        <div class="stat-label">Open RMAs</div>
        <div class="stat-value text-danger">3</div>
        <div class="stat-note">Tagged defective units</div>
      </div>
      <div class="stat">
        <div class="stat-label">Low stock items</div>
        <div class="stat-value text-warning">2</div>
        <div class="stat-note">At or below minimum threshold</div>
      </div>
    </div>

    <h2 class="section-title">Fleet meters</h2>
    <div class="panel mb-8">
      <div class="stack">
        <div class="meter">
          <div class="meter-head"><span class="meter-label"><span class="dot text-success"></span>Operational</span><span>10</span></div>
          <div class="meter-track"><div class="meter-fill is-success" style="width:70%"></div></div>
        </div>
        <div class="meter">
          <div class="meter-head"><span class="meter-label"><span class="dot text-warning"></span>Degraded</span><span>2</span></div>
          <div class="meter-track"><div class="meter-fill is-warning" style="width:20%"></div></div>
        </div>
        <div class="meter">
          <div class="meter-head"><span class="meter-label"><span class="dot text-danger"></span>Down</span><span>1</span></div>
          <div class="meter-track"><div class="meter-fill is-danger" style="width:10%"></div></div>
        </div>
      </div>
    </div>

    <h2 class="section-title">Alerts</h2>
    <div class="stack mb-8">
      <div class="alert alert-info"><p class="alert-title">Information</p><p class="alert-text">Neutral information for the operator.</p></div>
      <div class="alert alert-warning"><p class="alert-title">Low stock threshold</p><p class="alert-text">Two parts reached their minimum quantity.</p></div>
      <div class="alert alert-danger"><p class="alert-title">Load failed</p><p class="alert-text">The data could not be loaded.</p></div>
    </div>

    <h2 class="section-title">Machine positions</h2>
    <div class="slot-grid mb-8">${slots}</div>

    <h2 class="section-title">Table</h2>
    <div class="table-wrap mb-8">
      <table class="table">
        <thead><tr><th>Machine</th><th>Part</th><th>Part number</th><th>Serial number</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td class="mono">K289</td><td>DMA board</td><td class="mono">DMA-001</td><td class="mono">SN-004812</td><td><span class="badge badge-success"><span class="dot"></span>Installed</span></td></tr>
          <tr><td class="mono">K289</td><td>DMA board</td><td class="mono">DMA-001</td><td class="mono">SN-004755</td><td><span class="badge badge-danger"><span class="dot"></span>RMA tagged</span></td></tr>
          <tr><td class="mono">K301</td><td>Encoder</td><td class="mono">ENC-014</td><td>Not serialized</td><td><span class="badge badge-accent">Replaced today</span></td></tr>
        </tbody>
      </table>
    </div>

    <h2 class="section-title">Buttons and badges</h2>
    <div class="panel mb-8">
      <div class="row">
        <button class="btn btn-primary">Replace part</button>
        <button class="btn btn-secondary">Cancel</button>
        <button class="btn btn-ghost">Details</button>
        <button class="btn btn-danger">Scrap unit</button>
        <button class="btn btn-danger-solid">Delete machine</button>
        <button class="btn btn-primary" disabled>Disabled</button>
      </div>
      <div class="row mt-4">
        <span class="badge badge-success"><span class="dot"></span>Operational</span>
        <span class="badge badge-warning"><span class="dot"></span>Degraded</span>
        <span class="badge badge-danger"><span class="dot"></span>Down</span>
        <span class="badge badge-muted">Decommissioned</span>
        <span class="badge badge-accent">Serialized</span>
        <span class="badge badge-solid">Admin</span>
        <button class="chip" type="button">All events</button>
        <button class="chip is-active" type="button">Installed</button>
        <button class="slot-action is-danger">Tag RMA</button>
        <button class="slot-action">Replace</button>
      </div>
    </div>

    <h2 class="section-title">Form</h2>
    <div class="panel" style="max-width:520px">
      <div class="field"><label class="label" for="sg-sn">Serial number</label><input class="input mono" id="sg-sn" value="SN-004812"><span class="hint">Printed on the sticker next to the part number.</span></div>
      <div class="field"><label class="label" for="sg-out">Removed unit</label><select class="select" id="sg-out"><option>Damaged, declare RMA</option><option>Working, return to stock</option><option>Scrapped</option></select></div>
      <div class="field"><label class="label" for="sg-n">Notes</label><textarea class="textarea" id="sg-n"></textarea></div>
      <div class="field"><label class="checkbox-row" for="sg-rma"><input type="checkbox" id="sg-rma" checked><span class="label">RMA applicable</span></label></div>
      <button class="btn btn-primary">Save changes</button>
    </div>`;
}
