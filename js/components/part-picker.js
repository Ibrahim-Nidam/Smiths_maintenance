import { searchCatalogParts } from '../api/catalog.js';
import { esc } from './ui.js';

// Autocomplete for part numbers backed by the parts catalogue.
//
//   <div class="picker-wrap"><input class="input mono" id="..."></div>
//
//   mountPartPicker(modal.querySelector('#ap-pn'), { target: modal.querySelector('#ap-name') });
//
// Selecting a suggestion writes the part number into the input and, when a target
// field is given, its designation into that field (unless it was typed by hand).

export function mountPartPicker(input, { target = null, hint = 'Search the parts catalogue by part number or designation' } = {}) {
  if (!input || input.dataset.pickerMounted === '1') return null;
  input.dataset.pickerMounted = '1';

  const wrap = ensureWrap(input);
  const menu = document.createElement('div');
  menu.className = 'picker-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;
  wrap.appendChild(menu);

  let items = [];
  let activeIndex = -1;
  let requestId = 0;
  let timer = null;

  if (target) {
    target.addEventListener('input', () => { target.dataset.autofilled = '0'; });
  }

  const close = () => {
    menu.hidden = true;
    activeIndex = -1;
  };

  const paint = () => {
    menu.querySelectorAll('.picker-item').forEach((el, i) => {
      el.classList.toggle('is-active', i === activeIndex);
      el.setAttribute('aria-selected', String(i === activeIndex));
    });
  };

  const choose = (part) => {
    input.value = part.part_number;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    if (target) {
      target.value = part.designation;
      target.dataset.autofilled = '1';
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }
    close();
    input.focus();
  };

  const render = (parts, term) => {
    items = parts;
    activeIndex = -1;
    if (!term) { close(); return; }
    if (!parts.length) {
      menu.innerHTML = `<div class="picker-empty">No catalogue match for "${esc(term)}". You can keep typing a new part number.</div>`;
      menu.hidden = false;
      return;
    }
    menu.innerHTML = parts.map((p, i) => `
      <button type="button" class="picker-item" role="option" data-index="${i}" aria-selected="false">
        <span class="picker-pn mono">${esc(p.part_number)}</span>
        <span class="picker-designation">${esc(p.designation)}</span>
      </button>
    `).join('');
    menu.hidden = false;
    menu.querySelectorAll('.picker-item').forEach(el => {
      el.addEventListener('mousedown', e => e.preventDefault());
      el.addEventListener('click', () => choose(items[Number(el.dataset.index)]));
    });
  };

  const suggest = () => {
    const term = input.value.trim();
    if (term.length < 1) { close(); return; }
    const id = ++requestId;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const parts = await searchCatalogParts(term, 8);
      if (id !== requestId) return; // a newer keystroke won
      render(parts, term);
    }, 120);
  };

  input.addEventListener('input', () => {
    if (target && input.dataset.pickerCleared !== '1' && target.dataset.autofilled === '1' && !input.value.trim()) {
      target.value = '';
      target.dataset.autofilled = '0';
    }
    suggest();
  });

  input.addEventListener('focus', suggest);

  input.addEventListener('keydown', e => {
    if (menu.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      activeIndex = (activeIndex + step + items.length) % Math.max(items.length, 1);
      if (!items.length) activeIndex = -1;
      paint();
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && items[activeIndex]) {
        e.preventDefault();
        choose(items[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  });

  input.addEventListener('blur', () => setTimeout(() => {
    if (!wrap.isConnected) { document.removeEventListener('mousedown', onOutside); return; }
    close();
  }, 120));

  const onOutside = (e) => {
    if (!wrap.isConnected) {
      document.removeEventListener('mousedown', onOutside);
      return;
    }
    if (!wrap.contains(e.target)) close();
  };
  document.addEventListener('mousedown', onOutside);

  return { close };
}

function ensureWrap(input) {
  const existing = input.closest('.picker-wrap');
  if (existing) return existing;
  const anchor = input.closest('.clearable-input') || input;
  const wrap = document.createElement('div');
  wrap.className = 'picker-wrap';
  anchor.parentNode.insertBefore(wrap, anchor);
  wrap.appendChild(anchor);
  return wrap;
}
