// Camera barcode scanner for serial numbers.
// Supports both mobile phone cameras (native capture) and laptop/desktop webcams,
// working across all modern browsers (Firefox, Chrome, Edge, Safari).
// Uses native BarcodeDetector when available, with client-side ZXing fallback for
// browsers without it (such as Firefox).
import { openModal } from './modal.js';
import { esc } from './ui.js';
import { toast } from './toast.js';

// Barcode glyph used by the scan buttons (inline SVG: no image files, no icon font).
export const SCAN_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8.5 9v6M11.5 9v6M14.5 9v6M17 9v6"/></svg>`;

const FORMATS = [
  'code_128', 'code_39', 'code_93', 'codabar', 'ean_13', 'ean_8',
  'upc_a', 'upc_e', 'itf', 'qr_code', 'data_matrix',
];

// Returns true if the current device is a mobile phone / tablet.
export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
    return navigator.userAgentData.mobile;
  }
  const ua = navigator.userAgent || '';
  if (/Android.*Mobile|iPhone|iPod|Mobile|IEMobile|Opera Mini/i.test(ua)) {
    return true;
  }
  if (/Android|iPad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    if (!/Windows NT|Macintosh/i.test(ua) || navigator.maxTouchPoints > 1) {
      return true;
    }
  }
  return false;
}

// Scanning is supported on all mobile devices (via native phone camera capture)
// and on laptops/desktops via webcam or photo upload.
export function cameraScanSupported() {
  if (isMobileDevice()) return true;
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

// ---------------------------------------------------- ZXing Engine Loader
let zxingPromise = null;
export function getZXing() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window not available'));
  if (window.ZXing) return Promise.resolve(window.ZXing);
  if (zxingPromise) return zxingPromise;

  zxingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('../vendor/zxing.min.js', import.meta.url).href;
    script.onload = () => {
      if (window.ZXing) resolve(window.ZXing);
      else reject(new Error('ZXing not defined on window'));
    };
    script.onerror = () => {
      // Fallback to CDN if local bundle fails
      const cdn = document.createElement('script');
      cdn.src = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
      cdn.onload = () => {
        if (window.ZXing) resolve(window.ZXing);
        else reject(new Error('ZXing CDN failed to load'));
      };
      cdn.onerror = () => reject(new Error('Could not load barcode library'));
      document.head.appendChild(cdn);
    };
    document.head.appendChild(script);
  });
  return zxingPromise;
}

// Native BarcodeDetector instance cache
let nativeDetector = null;
function getNativeDetector() {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null;
  if (!nativeDetector) {
    try {
      nativeDetector = new window.BarcodeDetector({ formats: FORMATS });
    } catch {
      try {
        nativeDetector = new window.BarcodeDetector();
      } catch {
        nativeDetector = null;
      }
    }
  }
  return nativeDetector;
}

// ZXing MultiFormatReader cache
let zxingMultiReader = null;
async function getZXingReader() {
  const zxing = await getZXing();
  if (!zxingMultiReader) {
    const hints = new Map();
    hints.set(zxing.DecodeHintType.TRY_HARDER, true);
    hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, [
      zxing.BarcodeFormat.CODE_128,
      zxing.BarcodeFormat.CODE_39,
      zxing.BarcodeFormat.CODE_93,
      zxing.BarcodeFormat.EAN_13,
      zxing.BarcodeFormat.EAN_8,
      zxing.BarcodeFormat.UPC_A,
      zxing.BarcodeFormat.UPC_E,
      zxing.BarcodeFormat.ITF,
      zxing.BarcodeFormat.QR_CODE,
      zxing.BarcodeFormat.DATA_MATRIX,
      zxing.BarcodeFormat.CODABAR,
      zxing.BarcodeFormat.PDF_417,
    ]);
    zxingMultiReader = new zxing.MultiFormatReader();
    zxingMultiReader.setHints(hints);
  }
  return { zxing, reader: zxingMultiReader };
}

// Decodes a canvas using ZXing MultiFormatReader
function decodeCanvasWithZXing(canvas, zxing, reader) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;
  const lums = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    lums[j] = (data[i] * 306 + data[i + 1] * 601 + data[i + 2] * 117) >> 10;
  }
  const lumSource = new zxing.RGBLuminanceSource(lums, width, height);
  const bitmap = new zxing.BinaryBitmap(new zxing.HybridBinarizer(lumSource));
  try {
    const result = reader.decode(bitmap);
    if (result) return String(result.getText() || '').trim();
  } catch {
    // Try inverted colors (for light barcodes on dark backgrounds)
    try {
      const invSource = lumSource.invert();
      const invBitmap = new zxing.BinaryBitmap(new zxing.HybridBinarizer(invSource));
      const invResult = reader.decode(invBitmap);
      if (invResult) return String(invResult.getText() || '').trim();
    } catch {
      // Nothing found
    }
  }
  return null;
}

// Decodes an image element, supporting BarcodeDetector and ZXing with multi-orientation.
export async function decodeBarcodeFromImage(img) {
  // 1. Try native BarcodeDetector if available
  const native = getNativeDetector();
  if (native) {
    try {
      const codes = await native.detect(img);
      if (codes && codes.length) {
        const val = String(codes[0].rawValue || '').trim();
        if (val) return val;
      }
    } catch {
      // Fall through to ZXing
    }
  }

  // 2. Use ZXing
  const { zxing, reader } = await getZXingReader();
  const canvas = document.createElement('canvas');
  let { naturalWidth: w, naturalHeight: h } = img;
  if (!w || !h) {
    w = img.width || 800;
    h = img.height || 600;
  }

  // Downscale large photos to max 1600px for speed and crisp edge contrast
  const maxDim = 1600;
  let scale = 1;
  if (Math.max(w, h) > maxDim) {
    scale = maxDim / Math.max(w, h);
  }
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  let code = decodeCanvasWithZXing(canvas, zxing, reader);
  if (code) return code;

  // Try 90 degree rotation (phone held vertically for a horizontal barcode)
  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = canvas.height;
  rotCanvas.height = canvas.width;
  const rotCtx = rotCanvas.getContext('2d', { willReadFrequently: true });
  rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
  rotCtx.rotate((90 * Math.PI) / 180);
  rotCtx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  code = decodeCanvasWithZXing(rotCanvas, zxing, reader);
  if (code) return code;

  // Try 270 degree rotation
  rotCtx.clearRect(0, 0, rotCanvas.width, rotCanvas.height);
  rotCtx.rotate((180 * Math.PI) / 180);
  rotCtx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  code = decodeCanvasWithZXing(rotCanvas, zxing, reader);
  if (code) return code;

  return null;
}

// Decodes a barcode from a File or Blob object
export async function decodeBarcodeFromFile(file) {
  if (!file) return null;
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Failed to load image file'));
      img.src = objectUrl;
    });
    return await decodeBarcodeFromImage(img);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// Detects a barcode from an active video element
let frameCanvas = null;
async function detectFrame(video) {
  if (!video.videoWidth || !video.videoHeight) return null;

  // 1. Try native BarcodeDetector if available
  const native = getNativeDetector();
  if (native) {
    try {
      const codes = await native.detect(video);
      if (codes && codes.length) {
        const val = String(codes[0].rawValue || '').trim();
        if (val) return val;
      }
    } catch {
      // Continue to ZXing fallback
    }
  }

  // 2. Fallback to ZXing
  try {
    const { zxing, reader } = await getZXingReader();
    if (!frameCanvas) {
      frameCanvas = document.createElement('canvas');
    }
    const maxDim = 640;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    frameCanvas.width = Math.round(video.videoWidth * scale);
    frameCanvas.height = Math.round(video.videoHeight * scale);
    const ctx = frameCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
    return decodeCanvasWithZXing(frameCanvas, zxing, reader);
  } catch {
    return null;
  }
}

// Audible beep on successful barcode scan
function playBeep() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1760, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // Audio is optional feedback
  }
}

// Updates an input element with the scanned code and triggers event listeners
function fillTargetInput(input, code) {
  if (!input || !code) return;
  input.value = code;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.focus();
  playBeep();
}

// ------------------------------------------------ Phone Native Camera Capture
let phoneInputEl = null;
let currentPhoneTarget = null;
let currentPhoneTitle = '';
let currentPhoneHint = '';

function getPhoneCameraInput() {
  if (phoneInputEl && document.body.contains(phoneInputEl)) {
    return phoneInputEl;
  }
  phoneInputEl = document.createElement('input');
  phoneInputEl.type = 'file';
  phoneInputEl.accept = 'image/*';
  phoneInputEl.setAttribute('capture', 'environment');
  phoneInputEl.style.position = 'fixed';
  phoneInputEl.style.top = '-9999px';
  phoneInputEl.style.left = '-9999px';
  phoneInputEl.style.opacity = '0';
  phoneInputEl.style.pointerEvents = 'none';
  phoneInputEl.setAttribute('tabindex', '-1');
  phoneInputEl.setAttribute('aria-hidden', 'true');

  phoneInputEl.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    const targetInput = currentPhoneTarget;
    const title = currentPhoneTitle;
    const hint = currentPhoneHint;
    phoneInputEl.value = '';

    if (!file || !targetInput) return;

    toast('Reading barcode from photo\u2026');
    try {
      const code = await decodeBarcodeFromFile(file);
      if (code) {
        fillTargetInput(targetInput, code);
        toast(`Scanned: ${code}`);
      } else {
        showScanFailedModal({
          targetInput,
          title,
          hint,
          onRetryCamera: () => {
            currentPhoneTarget = targetInput;
            currentPhoneTitle = title;
            currentPhoneHint = hint;
            phoneInputEl.value = '';
            phoneInputEl.click();
          },
          onOpenLiveScanner: async () => {
            const liveCode = await scanBarcode({ title, hint });
            if (liveCode) {
              fillTargetInput(targetInput, liveCode);
              toast(`Scanned: ${liveCode}`);
            }
          },
        });
      }
    } catch (err) {
      toast(`Could not read barcode: ${err.message || 'unknown error'}`, 'error');
    }
  });

  document.body.appendChild(phoneInputEl);
  return phoneInputEl;
}

// Displays a retry/options modal when a photo did not yield a barcode
function showScanFailedModal({ targetInput, title, hint, onRetryCamera, onOpenLiveScanner }) {
  openModal({
    title: 'Barcode not detected',
    submitText: 'Take another photo',
    contentHtml: `
      <p class="secondary mb-2">Could not find a clear barcode in the photo.</p>
      <p class="small muted mb-3">Make sure the barcode is well-lit, clearly in focus, and not cut off.</p>
      <div style="display:flex; flex-direction:column; gap:8px;">
        <button type="button" class="btn btn-secondary btn-block" id="modal-open-live-btn">
          Open live camera scanner
        </button>
      </div>
      <p class="error-text"></p>
    `,
    onOpen: (modalEl) => {
      const liveBtn = modalEl.querySelector('#modal-open-live-btn');
      if (liveBtn) {
        liveBtn.addEventListener('click', () => {
          modalEl.querySelector('.close-btn').click();
          if (onOpenLiveScanner) onOpenLiveScanner();
        });
      }
    },
    onSubmit: async (form, close) => {
      close();
      if (onRetryCamera) onRetryCamera();
    },
  });
}

// Triggers the phone's native camera directly via media capture
export function triggerPhoneCamera({ input, title, hint }) {
  currentPhoneTarget = input;
  currentPhoneTitle = title || 'Scan a barcode';
  currentPhoneHint = hint || 'Point the camera at the barcode on the label.';
  const cameraInput = getPhoneCameraInput();
  cameraInput.value = '';
  cameraInput.click();
}

// ------------------------------------------------ Live Camera Scanner Modal
// Opens the live camera (webcam on laptops or live stream), reads one barcode and resolves.
// Resolves with null when the dialog is closed without a reading.
export function scanBarcode({
  title = 'Scan a barcode',
  hint = 'Point the camera at the barcode on the label.',
} = {}) {
  return new Promise(resolve => {
    let closeFn = null;
    let stream = null;
    let timer = null;
    let watchdog = null;
    let finished = false;
    let lastCode = '';
    let currentDeviceId = null;

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
        <div class="mt-2" style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
          <p class="small secondary mb-0" id="scanner-status">Starting camera&hellip;</p>
          <div style="display:flex; gap:6px; align-items:center;">
            <select id="scanner-camera-select" class="select select-sm" style="display:none; max-width:180px; height:28px; font-size:12px; padding:2px 8px;"></select>
            <button type="button" id="scanner-photo-fallback-btn" class="btn btn-ghost btn-sm" style="height:28px; font-size:12px; padding:0 8px;">
              ${isMobileDevice() ? 'Open phone camera' : 'Upload photo'}
            </button>
            <input type="file" id="scanner-modal-file" accept="image/*" ${isMobileDevice() ? 'capture="environment"' : ''} style="display:none">
          </div>
        </div>
        <p class="small muted mt-1 mb-0">${esc(hint)}</p>
        <p class="error-text"></p>
      `,
      onOpen: backdrop => {
        const video = backdrop.querySelector('.scanner-video');
        const status = backdrop.querySelector('#scanner-status');
        const cameraSelect = backdrop.querySelector('#scanner-camera-select');
        const photoBtn = backdrop.querySelector('#scanner-photo-fallback-btn');
        const modalFile = backdrop.querySelector('#scanner-modal-file');

        const setStatus = (message, isError = false) => {
          status.textContent = message;
          status.classList.toggle('text-danger', isError);
        };

        // Preload ZXing engine in background
        getZXing().catch(() => {});

        // Photo button inside the modal for fallback
        if (photoBtn && modalFile) {
          photoBtn.addEventListener('click', () => {
            modalFile.value = '';
            modalFile.click();
          });
          modalFile.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            setStatus('Reading barcode from photo\u2026');
            try {
              const code = await decodeBarcodeFromFile(file);
              if (code) {
                setStatus(`Scanned: ${code}`);
                finish(code);
              } else {
                setStatus('No barcode found in that photo. Try again or hold up to camera.', true);
              }
            } catch (err) {
              setStatus(`Could not read photo: ${err.message}`, true);
            }
          });
        }

        // Clean up when the modal is removed
        watchdog = setInterval(() => {
          if (!document.contains(backdrop)) finish(lastCode);
        }, 200);

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setStatus('Live camera is not available here (requires HTTPS or localhost). You can upload a photo of the barcode instead, or type the serial number.', true);
          return;
        }

        async function startCamera(deviceId = null) {
          if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
          }
          const constraints = {
            video: deviceId
              ? { deviceId: { exact: deviceId } }
              : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          };

          try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            currentDeviceId = deviceId;
          } catch (err) {
            // Fallback to basic video constraint if exact device or resolution failed
            try {
              stream = await navigator.mediaDevices.getUserMedia({ video: true });
            } catch (err2) {
              setStatus(
                err && err.name === 'NotAllowedError'
                  ? 'Camera permission was denied. Allow the camera for this site, or upload a photo.'
                  : `Could not open camera: ${err && err.message ? err.message : 'device not found'}. You can upload a photo instead.`,
                true
              );
              return;
            }
          }

          video.srcObject = stream;
          try { await video.play(); } catch { /* Autoplay */ }
          setStatus('Scanning, hold the barcode inside the frame.');

          // Enumerate video devices and show switcher if multiple cameras are available
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            if (videoDevices.length > 1 && cameraSelect) {
              cameraSelect.innerHTML = videoDevices.map((d, idx) =>
                `<option value="${esc(d.deviceId)}">${esc(d.label || `Camera ${idx + 1}`)}</option>`
              ).join('');
              const currentTrack = stream.getVideoTracks()[0];
              const settings = currentTrack ? currentTrack.getSettings() : null;
              if (settings && settings.deviceId) {
                cameraSelect.value = settings.deviceId;
              }
              cameraSelect.style.display = 'inline-block';
            }
          } catch {
            // Enumeration is optional
          }

          if (!timer) {
            timer = setInterval(detect, 200);
          }
        }

        if (cameraSelect) {
          cameraSelect.addEventListener('change', () => {
            startCamera(cameraSelect.value);
          });
        }

        let busy = false;
        async function detect() {
          if (finished || busy || !video.videoWidth || !video.videoHeight) return;
          busy = true;
          try {
            const code = await detectFrame(video);
            if (code) {
              setStatus(`Scanned: ${code}`);
              finish(code);
              return;
            }
          } catch {
            // Frame read failure is normal between valid frames
          }
          busy = false;
        }

        startCamera();
      },
      onSubmit: async () => { finish(lastCode); },
    });
  });
}

// Wires every [data-scan-target] button to its input:
// - On mobile devices: opens the phone's native camera directly for sharp autofocus capture.
// - On laptops and desktops: opens the live camera (webcam) scanner dialog.
// Both paths support all modern browsers (Firefox, Chrome, Safari, Edge).
export function mountScanButtons(root) {
  if (!root || root.dataset.scanButtons === 'on') return;
  root.dataset.scanButtons = 'on';

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-scan-target]');
    if (!btn || !root.contains(btn)) return;

    const targetId = btn.dataset.scanTarget;
    const input = root.querySelector(`#${targetId}`) || document.getElementById(targetId);
    if (!input) return;

    const title = btn.dataset.scanTitle || 'Scan a barcode';
    const hint = btn.dataset.scanHint || 'Point the camera at the barcode on the label.';

    if (isMobileDevice()) {
      // Mobile phone: directly open the phone's native camera
      triggerPhoneCamera({ input, title, hint });
    } else {
      // Laptop/desktop: open the live webcam camera scanner
      const code = await scanBarcode({ title, hint });
      if (code) {
        fillTargetInput(input, code);
      }
    }
  });
}

// The button markup shared by every serial number field.
export function scanButton({ target, title, label }) {
  const lbl = label || title || 'Scan barcode with camera';
  return `<button type="button" class="btn btn-ghost btn-sm icon-btn"
    data-scan-target="${esc(target)}"
    data-scan-title="${esc(title)}"
    title="${esc(lbl)}"
    aria-label="${esc(lbl)}">${SCAN_ICON}</button>`;
}
