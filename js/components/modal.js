// Reusable modal dialog component
export function openModal({ title, contentHtml, onSubmit, onOpen = null, submitText = 'Save', danger = false }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head">
        <h2 id="modal-title" class="modal-title">${title}</h2>
        <button type="button" class="modal-close close-btn" aria-label="Close">&times;</button>
      </div>
      <form id="modal-form" class="modal-form">
        <div class="modal-body">${contentHtml}</div>
        <div class="modal-foot">
          <button type="button" class="btn btn-secondary cancel-btn">Cancel</button>
          <button type="submit" class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'} submit-btn">${submitText}</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(backdrop);

  const onKeydown = (e) => {
    if (e.key !== 'Escape') return;
    // Only the dialog on top reacts, so closing a scanner never closes the
    // form that opened it.
    const open = document.querySelectorAll('.modal-backdrop');
    if (open[open.length - 1] !== backdrop) return;
    close();
  };

  const close = () => {
    document.removeEventListener('keydown', onKeydown);
    backdrop.remove();
  };

  document.addEventListener('keydown', onKeydown);

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

  // Focus the first field, or the first button when the dialog has none, so
  // the keyboard lands inside the dialog instead of on the page behind it.
  const firstInput = form.querySelector('input, select, textarea, button');
  if (firstInput) firstInput.focus();

  if (onOpen) {
    Promise.resolve(onOpen(backdrop)).catch(err => {
      const errEl = form.querySelector('.error-text');
      if (errEl) errEl.textContent = err.message || 'Could not load the requested data.';
    });
  }

  return close;
}
