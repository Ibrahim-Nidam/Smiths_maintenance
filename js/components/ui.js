export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// title and subtitle must already be safe text; use esc() on user data.
export function pageHeader(title, subtitle = '', actions = '') {
  return `<div class="page-header">
    <div><h1 class="page-title">${title}</h1>${subtitle ? `<p class="page-sub">${subtitle}</p>` : ''}</div>
    <div class="page-actions">${actions}</div>
  </div>`;
}

export function emptyState(title, text, actionHtml = '') {
  return `<div class="empty"><p class="empty-title">${title}</p><p class="empty-text">${text}</p>${actionHtml}</div>`;
}
