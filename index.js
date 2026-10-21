import QRCodeStyling from "qr-code-styling";

const DEBOUNCE_MS = 1000;

const dataInput = document.getElementById("data");
const logoInput = document.getElementById("logo");
const uploadArea = document.getElementById("uploadArea");
const uploadText = document.getElementById("uploadText");
const clearLogoBtn = document.getElementById("clearLogo");
const canvasEl = document.getElementById("canvas");
const spinnerEl = document.getElementById("spinner");
const downloadBtn = document.getElementById("downloadQr");
const randomizeBtn = document.getElementById("randomizeQr");
const dotColor = document.getElementById("dotColor");
const bgColor = document.getElementById("bgColor");
const bgTransparent = document.getElementById("bgTransparent");
const bgColorWrap = document.getElementById("bgColorWrap");
const canvasWrap = document.getElementById("canvasWrap");
const dotType = document.getElementById("dotType");
const cornerType = document.getElementById("cornerType");
const sizeInput = document.getElementById("size");
const marginInput = document.getElementById("margin");

const STORAGE_KEY = "qrcode-gen-settings";
const PRESETS_KEY = "qrcode-gen-presets";
const THEME_KEY = "qrcode-gen-theme";
const MAX_PRESETS = 3;
const presetsEl = document.getElementById("presets");

const themeToggle = document.getElementById("themeToggle");
const themeColorMeta = document.querySelector('meta[name="theme-color"]');

function getTheme() {
  return document.documentElement.getAttribute("data-theme") || "light";
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (e) {
    /* ignore */
  }
  if (themeColorMeta) {
    themeColorMeta.content = theme === "dark" ? "#1a2630" : "#8ecae6";
  }
  if (themeToggle) {
    themeToggle.setAttribute(
      "aria-label",
      theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
    );
  }
}

if (themeToggle) {
  setTheme(getTheme());
  themeToggle.addEventListener("click", () => {
    setTheme(getTheme() === "dark" ? "light" : "dark");
  });
}

let debounceTimer = null;
let logoDataUrl = null;
let logoFileName = null;

function isBgTransparent() {
  return bgTransparent.getAttribute("aria-pressed") === "true";
}

function setBgTransparent(on) {
  bgTransparent.setAttribute("aria-pressed", on ? "true" : "false");
  bgTransparent.classList.toggle("is-active", on);
  syncBgTransparentUi();
}

function syncBgTransparentUi() {
  const on = isBgTransparent();
  const bgRow = bgColorWrap.parentElement;
  bgColor.disabled = on;
  bgRow?.classList.toggle("is-transparent", on);
  bgTransparent.classList.toggle("is-expanded", on);
  canvasWrap.classList.toggle("is-transparent", on);
}

function getCurrentState() {
  return {
    data: dataInput.value,
    dotColor: dotColor.value,
    bgColor: bgColor.value,
    bgTransparent: isBgTransparent(),
    dotType: dotType.value,
    cornerType: cornerType.value,
    size: sizeInput.value,
    margin: marginInput.value,
    logoDataUrl: logoDataUrl || null,
    logoFileName: logoFileName || null,
  };
}

function applyState(state) {
  if (state.data != null) dataInput.value = state.data;
  if (state.dotColor) dotColor.value = state.dotColor;
  if (state.bgColor && state.bgColor !== "transparent") {
    bgColor.value = state.bgColor;
  }
  setBgTransparent(
    Boolean(state.bgTransparent || state.bgColor === "transparent"),
  );
  if (state.dotType) dotType.value = state.dotType;
  if (state.cornerType) cornerType.value = state.cornerType;
  if (state.size != null) sizeInput.value = state.size;
  if (state.margin != null) marginInput.value = state.margin;
  logoDataUrl = state.logoDataUrl || null;
  logoFileName = state.logoFileName || null;
  logoInput.value = "";
  if (logoDataUrl) {
    uploadText.textContent = logoFileName || "logo";
    clearLogoBtn.hidden = false;
  } else {
    uploadText.textContent = "Drop image or click to upload";
    clearLogoBtn.hidden = true;
  }
}

function getPresets() {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, MAX_PRESETS) : [];
  } catch (e) {
    return [];
  }
}

function setPresets(arr) {
  const list = arr.slice(0, MAX_PRESETS);
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn("Could not save presets:", e);
  }
  updatePresetSlots();
}

function createPresetSlot(index) {
  const slot = document.createElement("div");
  slot.className = "preset-slot";
  slot.dataset.slot = String(index);
  slot.innerHTML = `
    <input
      type="text"
      class="preset-name"
      id="presetName${index}"
      placeholder="Name…"
      aria-label="Preset ${index + 1} name"
    />
    <div class="preset-actions">
      <button type="button" class="preset-load" id="presetLoad${index}" disabled>
        Load
      </button>
      <button type="button" class="preset-save" id="presetSave${index}">
        Save
      </button>
    </div>
  `;

  slot.querySelector(`#presetSave${index}`).addEventListener("click", () => {
    const presets = getPresets();
    const nameInput = document.getElementById(`presetName${index}`);
    const name = nameInput.value.trim() || `Preset ${index + 1}`;
    presets[index] = { name, ...getCurrentState() };
    setPresets(presets);
    buttonFeedback(
      document.getElementById(`presetSave${index}`),
      false,
      index,
      "Saved!",
    );
  });

  slot.querySelector(`#presetLoad${index}`).addEventListener("click", () => {
    const presets = getPresets();
    if (presets[index]) {
      applyState(presets[index]);
      render();
      buttonFeedback(
        document.getElementById(`presetLoad${index}`),
        true,
        index,
        "Loaded!",
      );
    }
  });

  return slot;
}

function updatePresetSlots() {
  const presets = getPresets();

  while (presetsEl.children.length < MAX_PRESETS) {
    presetsEl.appendChild(createPresetSlot(presetsEl.children.length));
  }

  for (let i = 0; i < MAX_PRESETS; i++) {
    const nameInput = document.getElementById(`presetName${i}`);
    const loadBtn = document.getElementById(`presetLoad${i}`);
    if (presets[i]) {
      nameInput.value = presets[i].name ?? `Preset ${i + 1}`;
      loadBtn.disabled = false;
    } else {
      nameInput.placeholder = "Name…";
      loadBtn.disabled = true;
    }
  }
}

function saveSettings() {
  const settings = getCurrentState();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("Could not save settings:", e);
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    applyState(s);
  } catch (e) {
    console.warn("Could not load settings:", e);
  }
}

const qrCode = new QRCodeStyling({
  width: 600,
  height: 600,
  type: "canvas",
  data: "",
  dotsOptions: { color: "#3d5a6c", type: "rounded" },
  backgroundOptions: { color: "#ffffff" },
  cornersSquareOptions: { type: "square", color: "#3d5a6c" },
  cornersDotOptions: { type: "square", color: "#3d5a6c" },
  imageOptions: { crossOrigin: "anonymous", margin: 10 },
  qrOptions: { errorCorrectionLevel: "H" },
});

function debounce(fn, ms) {
  return function run(...args) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      fn.apply(this, args);
    }, ms);
  };
}

function getOptions() {
  const size = Math.min(600, Math.max(200, Number(sizeInput.value) || 300));
  const margin = Math.min(50, Math.max(0, Number(marginInput.value) ?? 10));
  const cornerOpts = { type: cornerType.value, color: dotColor.value };
  return {
    width: size,
    height: size,
    margin,
    data: dataInput.value.trim() || " ",
    image: logoDataUrl || undefined,
    shape: "square",
    dotsOptions: { type: dotType.value, color: dotColor.value },
    backgroundOptions: {
      color: isBgTransparent() ? "transparent" : bgColor.value,
    },
    cornersSquareOptions: cornerOpts,
    cornersDotOptions: cornerOpts,
    imageOptions: { crossOrigin: "anonymous", margin: 12 },
  };
}

function render() {
  spinnerEl.hidden = true;
  qrCode.update(getOptions());
  saveSettings();
}

const debouncedRender = debounce(render, DEBOUNCE_MS);

function readLogoFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    logoDataUrl = e.target.result;
    logoFileName = file.name;
    uploadText.textContent = file.name;
    clearLogoBtn.hidden = false;
    render();
  };
  reader.readAsDataURL(file);
}

uploadArea.addEventListener("click", (e) => {
  if (e.target === clearLogoBtn) return;
  logoInput.click();
});

uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("dragover");
});

uploadArea.addEventListener("dragleave", () => {
  uploadArea.classList.remove("dragover");
});

uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) readLogoFile(file);
});

logoInput.addEventListener("change", () => {
  const file = logoInput.files[0];
  if (file) readLogoFile(file);
});

clearLogoBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  logoDataUrl = null;
  logoFileName = null;
  logoInput.value = "";
  uploadText.textContent = "Drop image or click to upload";
  clearLogoBtn.hidden = true;
  render();
});

function onDataInput() {
  spinnerEl.hidden = false;
  debouncedRender();
}
dataInput.addEventListener("input", onDataInput);
dataInput.addEventListener("paste", onDataInput);

[dotColor, bgColor, dotType, cornerType, sizeInput, marginInput].forEach(
  (el) => {
    el.addEventListener("change", render);
    el.addEventListener("input", render);
  },
);

bgTransparent.addEventListener("click", () => {
  setBgTransparent(!isBgTransparent());
  render();
});

function randomHex() {
  return `#${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0")}`;
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomizeStyle() {
  const dotTypes = [...dotType.options].map((o) => o.value);
  const cornerTypes = [...cornerType.options].map((o) => o.value);
  let dots = randomHex();
  let bg = randomHex();
  const transparent = Math.random() < 0.12;

  if (!transparent && Math.abs(luminance(dots) - luminance(bg)) < 0.35) {
    bg = luminance(dots) > 0.5 ? "#1a2630" : "#ffffff";
  }

  setBgTransparent(transparent);
  dotColor.value = dots;
  bgColor.value = bg;
  dotType.value = pick(dotTypes);
  cornerType.value = pick(cornerTypes);
  render();
}

randomizeBtn.addEventListener("click", randomizeStyle);

downloadBtn.addEventListener("click", () => {
  qrCode.download({ name: "qrcode", extension: "png" });
});

const FEEDBACK_MS = 1500;

function buttonFeedback(btn, isLoad, slotIndex, feedbackText) {
  const originalText = btn.textContent;
  btn.textContent = feedbackText;
  btn.classList.add("preset-btn-feedback");
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = originalText;
    btn.classList.remove("preset-btn-feedback");
    btn.disabled = isLoad ? !getPresets()[slotIndex] : false;
  }, FEEDBACK_MS);
}

loadSettings();
updatePresetSlots();
qrCode.append(canvasEl);
render();
