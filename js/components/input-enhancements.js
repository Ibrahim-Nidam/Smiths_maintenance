const CLEARABLE_TYPES = new Set(['text', 'search', 'email', 'password', 'number', 'tel', 'url']);

function isClearable(input) {
  return input instanceof HTMLInputElement &&
    CLEARABLE_TYPES.has((input.type || 'text').toLowerCase()) &&
    !input.disabled &&
    !input.readOnly &&
    !input.closest('.clearable-input');
}

function addClearButton(input) {
  if (!isClearable(input)) return;

  const wrapper = document.createElement('span');
  wrapper.className = 'clearable-input';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'clear-input-btn';
  button.setAttribute('aria-label', 'Clear field');
  button.title = 'Clear field';
  button.innerHTML = clearIcon();
  wrapper.appendChild(button);

  if (input.type === 'password') {
    const revealButton = document.createElement('button');
    revealButton.type = 'button';
    revealButton.className = 'password-toggle-btn';
    revealButton.setAttribute('aria-label', 'Show password');
    revealButton.title = 'Show password';
    revealButton.innerHTML = eyeIcon(false);
    wrapper.appendChild(revealButton);
    revealButton.addEventListener('click', () => {
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      revealButton.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
      revealButton.title = visible ? 'Show password' : 'Hide password';
      revealButton.innerHTML = eyeIcon(!visible);
    });
  }

  const update = () => {
    button.hidden = !input.value;
  };

  button.addEventListener('click', () => {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
    update();
  });
  input.addEventListener('input', update);
  input.addEventListener('change', update);
  update();
}

function enhance(root) {
  root.querySelectorAll('input').forEach(addClearButton);
}

export function initInputEnhancements(root = document) {
  enhance(root);
  const observer = new MutationObserver(records => {
    records.forEach(record => {
      record.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.matches('input')) addClearButton(node);
          enhance(node);
        }
      });
    });
  });
  observer.observe(root === document ? document.body : root, { childList: true, subtree: true });
  return observer;
}

export function initCopyButtons(root = document) {
  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-copy-value]');
    if (!button) return;

    try {
      await navigator.clipboard.writeText(button.dataset.copyValue || '');
      const original = button.innerHTML;
      button.innerHTML = checkIcon();
      button.classList.add('copied');
      setTimeout(() => {
        button.innerHTML = original;
        button.classList.remove('copied');
      }, 1200);
    } catch {
      button.setAttribute('title', 'Copy failed');
    }
  });
}

export function copyButton(value, label = 'Copy') {
  const safeValue = String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<button type="button" class="copy-btn" data-copy-value="${safeValue}" aria-label="${label}" title="${label}">${copyIcon()}</button>`;
}

function copyIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="10" height="10" rx="1"></rect><path d="M6 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1"></path></svg>';
}

function clearIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"></path></svg>';
}

function checkIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"></path></svg>';
}

function eyeIcon(visible) {
  return visible
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18"></path><path d="M10.6 6.1A10.7 10.7 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.5 6 10 6c1.2 0 2.3-.2 3.3-.6"></path></svg>';
}
