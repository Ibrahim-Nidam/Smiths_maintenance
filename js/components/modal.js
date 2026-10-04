// Reusable modal dialog component
export function openModal({ title, contentHtml, onSubmit, submitText = 'Save', danger = false }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="flex items-center justify-between mb-4">
        <h2 id="modal-title" class="text-xl font-semibold m-0">${title}</h2>
        <button type="button" class="btn btn-ghost btn-sm close-btn" aria-label="Close">&times;</button>
      </div>
      <form id="modal-form">
        <div class="modal-body">${contentHtml}</div>
        <div class="flex justify-end gap-3 mt-6">
          <button type="button" class="btn btn-secondary cancel-btn">Cancel</button>
          <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'} submit-btn">${submitText}</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();

  backdrop.querySelector('.close-btn').addEventListener('click', close);
  backdrop.querySelector('.cancel-btn').addEventListener('click', close);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  const form = backdrop.querySelector('#modal-form');
  const submitBtn = form.querySelector('.submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    try {
      await onSubmit(form, close);
    } catch (err) {
      const errEl = form.querySelector('.error-text');
      if (errEl) errEl.textContent = err.message || 'An error occurred';
      submitBtn.disabled = false;
    }
  });

  // Focus first input
  const firstInput = form.querySelector('input, select, textarea');
  if (firstInput) firstInput.focus();

  return close;
}
