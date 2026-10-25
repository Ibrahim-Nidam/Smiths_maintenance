// Camera barcode scanner for serial numbers.
// Uses the native BarcodeDetector API (Chrome, Edge, Android WebView): no library
// and no build step. Browsers without it (Safari, Firefox) get a clear message and
// the field stays editable by hand or with a handheld USB scanner.
import { openModal } from './modal.js';
import { esc } from './ui.js';

// Barcode glyph used by the scan buttons (inline SVG: no image files, no icon font).
export const SCAN_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8.5 9v6M11.5 9v6M14.5 9v6M17 9v6"/></svg>`;

const FORMATS = [
  'code_128', 'code_39', 'code_93', 'codabar', 'ean_13', 'ean_8',
  'upc_a', 'upc_e', 'itf', 'qr_code', 'data_matrix',
];

export function cameraScanSupported() {
  return 'BarcodeDetector' in window
    && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

// Opens the camera, reads one barcode and resolves with the value.
// Resolves with null when the dialog is closed without a reading.
export function scanBarcode({
  title = 'Scan a barcode',
  hint = 'Point the camera at the barcode on the label.',
} = {}) {
  return new Promise(resolve => {
    let closeFn = null;
    let stream = null;
    let detector = null;
    let timer = null;
    let watchdog = null;
    let finished = false;
    let lastCode = '';

    function cleanup() {
      if (timer) { clearInterval(timer); timer = null; }
      if (watchdog) { clearInterval(watchdog); watchdog = null; }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
      }
    }

    function finish(code) {
      if (finished) return;
      finished = true;
      if (code) lastCode = code;
      cleanup();
      if (closeFn) closeFn();
      resolve(lastCode || null);
    }

    closeFn = openModal({
      title,
      submitText: 'Close',
      contentHtml: `
        <div class="scanner">
          <video class="scanner-video" playsinline muted autoplay></video>
          <span class="scanner-frame" aria-hidden="true"></span>
        </div>
        <p class="small secondary mt-2" id="scanner-status">Starting the camera&hellip;</p>
        <p class="small muted mt-1 mb-0">${esc(hint)}</p>
        <p class="error-text"></p>
      `,
      onOpen: backdrop => {
        const video = backdrop.querySelector('.scanner-video');
        const status = backdrop.querySelector('#scanner-status');

        const setStatus = (message, isError = false) => {
          status.textContent = message;
          status.classList.toggle('text-danger', isError);
        };

        // The dialog can be closed with Escape, the backdrop, the X or Cancel;
        // the camera must stop in every case, so watch for the removal.
        watchdog = setInterval(() => {
          if (!document.contains(backdrop)) finish(lastCode);
        }, 200);

        if (!('BarcodeDetector' in window)) {
          setStatus('Camera scanning needs a browser with barcode detection (Chrome or Edge). Type the serial number instead.', true);
          return;
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setStatus('The camera is not available here (needs https or localhost). Type the serial number instead.', true);
          return;
        }

        try {
          detector = new BarcodeDetector({ formats: FORMATS });
        } catch {
          try {
            detector = new BarcodeDetector();
          } catch {
            setStatus('This browser cannot read barcodes from the camera. Type the serial number instead.', true);
            return;
          }
        }

        (async () => {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: 'environment' } },
            });
          } catch (err) {
            setStatus(
              err && err.name === 'NotAllowedError'
                ? 'Camera permission was denied. Allow the camera for this site, or type the serial number.'
                : `Could not open the camera: ${err && err.message ? err.message : 'unknown error'}`,
              true
            );
            return;
          }

          video.srcObject = stream;
          try { await video.play(); } catch { /* autoplay hint is harmless */ }
          setStatus('Scanning, hold the barcode inside the frame.');
          timer = setInterval(detect, 250);
        })();

        let busy = false;
        async function detect() {
          if (finished || busy || !detector || !video.videoWidth) return;
          busy = true;
          try {
            const codes = await detector.detect(video);
            const value = codes && codes.length ? String(codes[0].rawValue || '').trim() : '';
            if (value) {
              setStatus(`Scanned: ${value}`);
              finish(value);
              return;
            }
          } catch {
            // A frame the detector cannot read is normal, just try the next one.
          }
          busy = false;
        }
      },
      onSubmit: async () => { finish(lastCode); },
    });
  });
}

// Wires every [data-scan-target] button inside a modal to its input:
// click the button, read the barcode, fill the field and focus it again.
export function mountScanButtons(root) {
  if (!root || root.dataset.scanButtons === 'on') return;
  root.dataset.scanButtons = 'on';

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-scan-target]');
    if (!btn || !root.contains(btn)) return;

    const input = root.querySelector(`#${btn.dataset.scanTarget}`);
    if (!input) return;

    const code = await scanBarcode({
      title: btn.dataset.scanTitle || 'Scan a barcode',
      hint: btn.dataset.scanHint || 'Point the camera at the barcode on the label.',
    });

    if (!code) return;
    input.value = code;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
  });
}

// The button markup shared by every serial number field.
export function scanButton({ target, title, label }) {
  return `<button type="button" class="btn btn-ghost btn-sm icon-btn"
    data-scan-target="${esc(target)}"
    data-scan-title="${esc(title)}"
    aria-label="${esc(label)}">${SCAN_ICON}</button>`;
}
