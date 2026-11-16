import Alpine from "alpinejs";
import QRCodeStyling from "qr-code-styling";

const DEBOUNCE_MS = 1000;
const FEEDBACK_MS = 1500;
const STORAGE_KEY = "qrcode-gen-settings";
const PRESETS_KEY = "qrcode-gen-presets";
const THEME_KEY = "qrcode-gen-theme";
const MAX_PRESETS = 3;

const DEFAULT_STATE = {
  data: "",
  dotColor: "#3d5a6c",
  bgColor: "#ffffff",
  bgTransparent: false,
  dotType: "square",
  cornerType: "square",
  size: 600,
  margin: 10,
  logoDataUrl: null,
  logoFileName: null,
};

function toColorInputValue(value, fallback) {
  if (!value || value === "transparent") return fallback;
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^#[0-9a-fA-F]{8}$/.test(value)) return value.slice(0, 7);
  const rgba = String(value).match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i,
  );
  if (rgba) {
    return `#${[rgba[1], rgba[2], rgba[3]]
      .map((x) => Number(x).toString(16).padStart(2, "0"))
      .join("")}`;
  }
  return fallback;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Could not save ${key}:`, e);
  }
}

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

Alpine.data("qrcodeApp", () => ({
  data: DEFAULT_STATE.data,
  dotColor: DEFAULT_STATE.dotColor,
  bgColor: DEFAULT_STATE.bgColor,
  bgTransparent: DEFAULT_STATE.bgTransparent,
  dotType: DEFAULT_STATE.dotType,
  cornerType: DEFAULT_STATE.cornerType,
  size: DEFAULT_STATE.size,
  margin: DEFAULT_STATE.margin,
  logoDataUrl: DEFAULT_STATE.logoDataUrl,
  logoFileName: DEFAULT_STATE.logoFileName,

  theme: "light",
  dragging: false,
  showingSpinner: false,
  presets: Array.from({ length: MAX_PRESETS }, () => ({
    name: "",
    hasData: false,
    feedback: null,
  })),

  _qr: null,
  _debounceTimer: null,
  _feedbackTimers: {},

  init() {
    this.theme =
      document.documentElement.getAttribute("data-theme") || "light";
    this.applyTheme(this.theme, false);
    this.loadSettings();
    this.loadPresets();

    this._qr = new QRCodeStyling({
      width: 600,
      height: 600,
      type: "canvas",
      data: "",
      dotsOptions: { color: "#3d5a6c", type: "square" },
      backgroundOptions: { color: "#ffffff" },
      cornersSquareOptions: { type: "square", color: "#3d5a6c" },
      cornersDotOptions: { type: "square", color: "#3d5a6c" },
      imageOptions: { crossOrigin: "anonymous", margin: 10 },
      qrOptions: { errorCorrectionLevel: "H" },
    });
    this._qr.append(this.$refs.canvas);

    this.render();
  },

  get uploadLabel() {
    return this.logoDataUrl
      ? this.logoFileName || "logo"
      : "Drop image or click to upload";
  },

  get themeLabel() {
    return this.theme === "dark"
      ? "Switch to light mode"
      : "Switch to dark mode";
  },

  getCurrentState() {
    return {
      data: this.data,
      dotColor: this.dotColor,
      bgColor: this.bgColor,
      bgTransparent: this.bgTransparent,
      dotType: this.dotType,
      cornerType: this.cornerType,
      size: this.size,
      margin: this.margin,
      logoDataUrl: this.logoDataUrl || null,
      logoFileName: this.logoFileName || null,
    };
  },

  applyState(state) {
    if (!state || typeof state !== "object") return;
    if (state.data != null) this.data = state.data;
    if (state.dotColor) {
      this.dotColor = toColorInputValue(state.dotColor, DEFAULT_STATE.dotColor);
    }
    if (state.bgColor && state.bgColor !== "transparent") {
      this.bgColor = toColorInputValue(state.bgColor, DEFAULT_STATE.bgColor);
    }
    this.bgTransparent = Boolean(
      state.bgTransparent || state.bgColor === "transparent",
    );
    if (state.dotType) this.dotType = state.dotType;
    if (state.cornerType) this.cornerType = state.cornerType;
    if (state.size != null) this.size = Number(state.size) || DEFAULT_STATE.size;
    if (state.margin != null) {
      this.margin = Number(state.margin) ?? DEFAULT_STATE.margin;
    }
    this.logoDataUrl = state.logoDataUrl || null;
    this.logoFileName = state.logoFileName || null;
    if (this.$refs.logoInput) this.$refs.logoInput.value = "";
  },

  loadSettings() {
    const saved = readJson(STORAGE_KEY, null);
    if (saved) this.applyState(saved);
  },

  saveSettings() {
    writeJson(STORAGE_KEY, this.getCurrentState());
  },

  loadPresets() {
    const stored = readJson(PRESETS_KEY, []);
    const list = Array.isArray(stored) ? stored.slice(0, MAX_PRESETS) : [];
    this.presets = Array.from({ length: MAX_PRESETS }, (_, i) => ({
      name: list[i]?.name ?? "",
      hasData: Boolean(list[i]),
      feedback: null,
      _saved: list[i] || null,
    }));
  },

  persistPresets() {
    const presets = [];
    for (let i = 0; i < MAX_PRESETS; i++) {
      if (this.presets[i]._saved) presets[i] = this.presets[i]._saved;
    }
    writeJson(PRESETS_KEY, presets);
  },

  applyTheme(theme, persist = true) {
    this.theme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {
        /* ignore */
      }
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === "dark" ? "#1a2630" : "#8ecae6";
  },

  toggleTheme() {
    this.applyTheme(this.theme === "dark" ? "light" : "dark");
  },

  getOptions() {
    const size = Math.min(600, Math.max(200, Number(this.size) || 300));
    const margin = Math.min(50, Math.max(0, Number(this.margin) ?? 10));
    const cornerOpts = { type: this.cornerType, color: this.dotColor };
    return {
      width: size,
      height: size,
      margin,
      data: String(this.data).trim() || " ",
      image: this.logoDataUrl || undefined,
      shape: "square",
      dotsOptions: { type: this.dotType, color: this.dotColor },
      backgroundOptions: {
        color: this.bgTransparent ? "transparent" : this.bgColor,
      },
      cornersSquareOptions: cornerOpts,
      cornersDotOptions: cornerOpts,
      imageOptions: { crossOrigin: "anonymous", margin: 12 },
    };
  },

  render() {
    this.showingSpinner = false;
    if (!this._qr) return;
    this._qr.update(this.getOptions());
    this.saveSettings();
  },

  onDataInput() {
    this.showingSpinner = true;
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      this.render();
    }, DEBOUNCE_MS);
  },

  toggleBgTransparent() {
    this.bgTransparent = !this.bgTransparent;
    this.render();
  },

  openLogoPicker(event) {
    if (event?.target === this.$refs.logoInput) return;
    this.$refs.logoInput?.click();
  },

  onLogoChange(event) {
    const file = event.target.files?.[0];
    if (file) this.readLogoFile(file);
  },

  onDrop(event) {
    this.dragging = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) this.readLogoFile(file);
  },

  readLogoFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.logoDataUrl = e.target.result;
      this.logoFileName = file.name;
      this.render();
    };
    reader.readAsDataURL(file);
  },

  clearLogo() {
    this.logoDataUrl = null;
    this.logoFileName = null;
    if (this.$refs.logoInput) this.$refs.logoInput.value = "";
    this.render();
  },

  randomizeStyle() {
    const dotTypes = [
      "square",
      "rounded",
      "dots",
      "classy",
      "classy-rounded",
      "extra-rounded",
    ];
    const cornerTypes = ["square", "dot", "extra-rounded"];
    let dots = randomHex();
    let bg = randomHex();
    const transparent = Math.random() < 0.12;

    if (!transparent && Math.abs(luminance(dots) - luminance(bg)) < 0.35) {
      bg = luminance(dots) > 0.5 ? "#1a2630" : "#ffffff";
    }

    this.bgTransparent = transparent;
    this.dotColor = dots;
    this.bgColor = bg;
    this.dotType = pick(dotTypes);
    this.cornerType = pick(cornerTypes);
    this.render();
  },

  download() {
    this._qr?.download({ name: "qrcode", extension: "png" });
  },

  savePreset(index) {
    const name =
      this.presets[index].name.trim() || `Preset ${index + 1}`;
    this.presets[index].name = name;
    this.presets[index]._saved = { name, ...this.getCurrentState() };
    this.presets[index].hasData = true;
    this.persistPresets();
    this.buttonFeedback(index, "Saved!");
  },

  loadPreset(index) {
    const saved = this.presets[index]._saved;
    if (!saved) return;
    this.applyState(saved);
    this.render();
    this.buttonFeedback(index, "Loaded!");
  },

  buttonFeedback(index, text) {
    if (this._feedbackTimers[index]) {
      clearTimeout(this._feedbackTimers[index]);
    }
    this.presets[index].feedback = text;
    this._feedbackTimers[index] = setTimeout(() => {
      this.presets[index].feedback = null;
      this._feedbackTimers[index] = null;
    }, FEEDBACK_MS);
  },
}));

Alpine.start();
