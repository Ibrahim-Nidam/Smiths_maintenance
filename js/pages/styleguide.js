import { pageHeader } from '../components/ui.js';

// Visual reference for the design system. Open at #/styleguide. Not linked in the menu.
export async function render(container) {
  const slots = Array.from({ length: 21 }, (_, i) => {
    const n = i + 1;
    if (n === 8) return `<div class="slot slot-rma"><span class="slot-pos">Position ${n}</span><span class="slot-serial mono">SN-004755</span><span class="badge badge-alert">RMA</span></div>`;
    if (n === 15) return `<div class="slot slot-empty"><span class="slot-pos">Position ${n}</span><span class="slot-serial">Empty</span></div>`;
    return `<div class="slot"><span class="slot-pos">Position ${n}</span><span class="slot-serial mono">SN-${String(4800 + n * 7).padStart(6, '0')}</span></div>`;
  }).join('');

  container.innerHTML =
    pageHeader('Style guide', 'Components used across the app.', '<button class="btn btn-secondary">Export CSV</button><button class="btn btn-primary">Add part</button>') +

    `<h2 class="section-title" style="margin-top:0">Overview numbers</h2>
    <div class="stats">
      <div class="stat"><div class="stat-label">Operational machines</div><div class="stat-value">10</div></div>
      <div class="stat"><div class="stat-label">Open RMAs</div><div class="stat-value">3</div></div>
      <div class="stat"><div class="stat-label">Low stock items</div><div class="stat-value">2</div></div>
    </div>

    <h2 class="section-title">Machine positions</h2>
    <div class="slot-grid">${slots}</div>

    <h2 class="section-title">Table</h2>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Machine</th><th>Part</th><th>Part number</th><th>Serial number</th><th>Status</th></tr></thead>
      <tbody>
        <tr><td>K289</td><td>DMA board</td><td class="mono">DMA-001</td><td class="mono">SN-004812</td><td><span class="badge"><span class="dot"></span>Installed</span></td></tr>
        <tr><td>K289</td><td>DMA board</td><td class="mono">DMA-001</td><td class="mono">SN-004755</td><td><span class="badge"><span class="dot"></span>Installed</span> <span class="badge badge-alert">RMA</span></td></tr>
        <tr><td>K301</td><td>Encoder</td><td class="mono">ENC-014</td><td>Not serialized</td><td><span class="badge badge-accent">Replaced today</span></td></tr>
      </tbody>
    </table></div>

    <h2 class="section-title">Buttons and badges</h2>
    <div class="panel" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
      <button class="btn btn-primary">Replace part</button>
      <button class="btn btn-secondary">Cancel</button>
      <button class="btn btn-ghost">Details</button>
      <button class="btn btn-secondary">Tag as RMA</button>
      <button class="btn btn-secondary">Remove RMA tag</button>
      <button class="btn btn-danger">Scrap unit</button>
      <button class="btn btn-primary" disabled>Disabled</button>
      <span class="badge"><span class="dot"></span>Operational</span>
      <span class="badge badge-alert"><span class="dot"></span>Down</span>
      <span class="badge badge-solid">Admin</span>
    </div>

    <h2 class="section-title">Form</h2>
    <div class="panel" style="max-width:480px">
      <div class="field"><label class="label" for="sg-sn">Serial number</label><input class="input mono" id="sg-sn" value="SN-004812"><span class="hint">Printed on the sticker next to the part number.</span></div>
      <div class="field"><label class="label" for="sg-out">Removed unit</label><select class="select" id="sg-out"><option>Damaged, declare RMA</option><option>Working, return to stock</option><option>Scrapped</option></select></div>
      <div class="field"><label class="label" for="sg-n">Notes</label><textarea class="textarea" id="sg-n"></textarea></div>
      <button class="btn btn-primary">Save changes</button>
    </div>`;
}
