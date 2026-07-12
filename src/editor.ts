import "./editor.css";
import { renderPreview } from "./editor-preview";

declare function require(name: string): any;
declare const globalThis: any;

interface CodeMirrorAPI {
  setOption(key: string, value: unknown): Promise<void>;
}

interface PlainTextInputAPI {
  codeMirror: CodeMirrorAPI & {
    editor: Promise<any>;
  };
}

const { loaded } = require("anki/ui") as { loaded: Promise<void> };
const { instances } = require("anki/NoteEditor");
const { lifecycle, instances: plainTexts } = require("anki/PlainTextInput") as {
  lifecycle: { onMount(cb: (api: PlainTextInputAPI) => (() => void) | void): void };
  instances: PlainTextInputAPI[];
};
const active = () => document.body.classList.contains("anki-md-active");

// Editor settings to force-disable for markdown notes
const settings = ["setCloseHTMLTags", "setShrinkImages", "setMathjaxEnabled"];

// Get boolean array matching field count
const fields = async (val: boolean) => (await instances[0]?.fields)?.map(() => val);

async function setPlainText(val: boolean): Promise<void> {
  const list = await fields(val);
  if (list) globalThis.setPlainTexts(list);
}

// Set a CodeMirror option on all plain-text inputs
async function setOption(key: string, value: unknown): Promise<void> {
  await Promise.all(plainTexts.map((pt) => pt.codeMirror.setOption(key, value)));
}

// Ensure MathJax is loaded
function ensureMathJax() {
  if (!(globalThis as any).MathJax && !document.querySelector("#mathjax-script")) {
    const script = document.createElement("script");
    script.id = "mathjax-script";
    script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js";
    script.async = true;
    document.head.appendChild(script);
  }
}

// Decode HTML entities
function decodeEntities(encodedString: string) {
  const textArea = document.createElement("textarea");
  textArea.innerHTML = encodedString;
  return textArea.value;
}

/** Render and update the preview div content. */
function updatePreview(container: HTMLElement) {
  const preview = container.querySelector<HTMLElement>(".anki-md-preview");
  if (!preview) return;

  const cm5 = (container as any)._cm5;
  let source = "";

  if (cm5 && typeof cm5.getValue === "function") {
    source = decodeEntities(cm5.getValue());
  } else {
    const cmEl = container.querySelector(".CodeMirror");
    if (cmEl) {
      const raw = Array.from(cmEl.querySelectorAll(".CodeMirror-line"))
        .map((l) => l.textContent ?? "")
        .join("\n");
      source = decodeEntities(raw);
    }
  }

  preview.innerHTML = renderPreview(source || "");

  const mj = (globalThis as any).MathJax;
  if (mj?.typesetPromise) {
    mj.typesetPromise([preview]).then(() => {
      updateContainerHeight(container, preview);
    });
  } else {
    updateContainerHeight(container, preview);
  }

  // Ensure height updates if images load slowly
  preview.querySelectorAll("img").forEach((img) => {
    img.addEventListener("load", () => updateContainerHeight(container, preview));
  });
}

function updateContainerHeight(container: HTMLElement, preview: HTMLElement) {
  if (!preview.classList.contains("visible")) return;
  // Briefly remove limits so scrollHeight can accurately reflect content, not the current clip
  container.style.maxHeight = "";
  container.style.minHeight = "";
  
  const h = preview.scrollHeight;
  if (h > 0) {
    container.style.minHeight = h + "px";
    container.style.maxHeight = h + "px";
    container.style.overflow = "hidden";
  }
}

/** Show preview */
function showPreview(container: HTMLElement) {
  updatePreview(container);
  const preview = container.querySelector<HTMLElement>(".anki-md-preview");
  if (!preview) return;
  preview.classList.add("visible");
  container.classList.add("preview-active");
  updateContainerHeight(container, preview);
}

/** Hide preview */
function hidePreview(container: HTMLElement) {
  const preview = container.querySelector<HTMLElement>(".anki-md-preview");
  if (preview) preview.classList.remove("visible");
  container.classList.remove("preview-active");
  
  // Restore CodeMirror's natural height
  container.style.minHeight = "";
  container.style.maxHeight = "";
  container.style.overflow = "";
}

/** Attach a preview overlay to a .plain-text-input container. */
function attachPreviewTo(container: HTMLElement, cm5?: any) {
  const existingPreview = container.querySelector(".anki-md-preview");

  if (cm5 && !(container as any)._cm5) {
    (container as any)._cm5 = cm5;
    
    if (typeof cm5.on === "function" && !(container as any)._mdChangeHandler) {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const changeHandler = () => {
        if (!container.querySelector(".anki-md-preview.visible")) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => showPreview(container), 80);
      };
      cm5.on("change", changeHandler);
      (container as any)._mdChangeHandler = changeHandler;
    }

    if (existingPreview) {
      showPreview(container);
      return;
    }
  }

  if (existingPreview) return;

  const preview = document.createElement("div");
  preview.className = "anki-md-preview";
  container.style.position = "relative";
  container.appendChild(preview);
  
  // Handle container resize (e.g. window resize causing text wrap)
  let lastWidth = 0;
  const resizeObs = new ResizeObserver((entries) => {
    const width = entries[0].contentRect.width;
    if (width !== lastWidth) {
      lastWidth = width;
      updateContainerHeight(container, preview);
    }
  });
  resizeObs.observe(container);

  // Click on preview → focus the CodeMirror editor
  preview.addEventListener("mousedown", (e) => {
    e.preventDefault();
    hidePreview(container);
    const savedCm5 = (container as any)._cm5;
    if (savedCm5 && typeof savedCm5.focus === "function") {
      savedCm5.focus();
    } else {
      const cmEl = container.querySelector(".CodeMirror") as any;
      cmEl?.CodeMirror?.focus?.();
    }
  });

  // Watch for CM focus/blur via .CodeMirror-focused class
  const cmEl = container.querySelector(".CodeMirror");
  if (cmEl) {
    const focusObs = new MutationObserver(() => {
      if (cmEl.classList.contains("CodeMirror-focused")) {
        hidePreview(container);
      } else {
        showPreview(container);
      }
    });
    focusObs.observe(cmEl, { attributes: true, attributeFilter: ["class"] });
    (container as any)._mdFocusObs = focusObs;

    if (!(container as any)._mdChangeHandler) {
      const codeEl = cmEl.querySelector(".CodeMirror-code");
      if (codeEl && !(container as any)._mdContentObs) {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const contentObs = new MutationObserver(() => {
          if (!container.querySelector(".anki-md-preview.visible")) return;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => showPreview(container), 80);
        });
        contentObs.observe(codeEl, { childList: true, subtree: true, characterData: true });
        (container as any)._mdContentObs = contentObs;
      }
    }
  }

  showPreview(container);
}

/** Attach preview once CM5 is truly ready via editor Promise. */
function attachWhenReady(api: PlainTextInputAPI) {
  api.codeMirror.editor
    .then((cm5: any) => {
      if (!active()) return;
      const wrapperEl = cm5.getWrapperElement?.() as HTMLElement | undefined;
      if (wrapperEl) {
        const container = wrapperEl.closest<HTMLElement>(".plain-text-input");
        if (container) attachPreviewTo(container, cm5);
      } else {
        document.querySelectorAll<HTMLElement>(".plain-text-input").forEach((el) => attachPreviewTo(el, cm5));
      }
    })
    .catch(() => {
      setTimeout(() => {
        if (active())
          document.querySelectorAll<HTMLElement>(".plain-text-input").forEach((el) => attachPreviewTo(el));
      }, 500);
    });
}

/** Watch for .plain-text-input elements appearing in the DOM. */
let domObserver: MutationObserver | null = null;

function startDomObserver() {
  if (domObserver) return;
  domObserver = new MutationObserver(() => {
    if (!active()) return;
    document.querySelectorAll<HTMLElement>(".plain-text-input").forEach((el) => {
      if (!el.querySelector(".anki-md-preview")) attachPreviewTo(el);
    });
  });
  domObserver.observe(document.body, { childList: true, subtree: true });
}

function stopDomObserver() {
  domObserver?.disconnect();
  domObserver = null;
}

/** Remove all previews and observers. */
function detachAllPreviews() {
  document.querySelectorAll<HTMLElement>(".plain-text-input").forEach((el) => {
    (el as any)._mdFocusObs?.disconnect();
    (el as any)._mdContentObs?.disconnect();
    delete (el as any)._mdFocusObs;
    delete (el as any)._mdContentObs;

    if ((el as any)._cm5 && (el as any)._mdChangeHandler) {
      try { (el as any)._cm5.off("change", (el as any)._mdChangeHandler); } catch(e) {}
    }
    delete (el as any)._mdChangeHandler;
    delete (el as any)._cm5;

    el.querySelector(".anki-md-preview")?.remove();
    el.style.minHeight = "";
    el.style.position = "";
  });
}

/** Handle Up/Down arrow keys to navigate card list when not editing. */
function handleBrowserNav(e: KeyboardEvent) {
  if (!active()) return;
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

  // If any CodeMirror editor is focused (user is editing), don't intercept
  if (document.querySelector(".CodeMirror-focused")) return;

  e.preventDefault();
  e.stopPropagation();
  const dir = e.key === "ArrowUp" ? "up" : "down";
  (globalThis as any).pycmd(`anki-md-nav:${dir}`);
}

let navListenerInstalled = false;

function installNavListener() {
  if (navListenerInstalled) return;
  document.addEventListener("keydown", handleBrowserNav, true);
  navListenerInstalled = true;
}

function removeNavListener() {
  document.removeEventListener("keydown", handleBrowserNav, true);
  navListenerInstalled = false;
}

globalThis.ankiMdActivate = async () => {
  await loaded;
  document.body.classList.add("anki-md-active");
  for (const fn of settings) globalThis[fn](false);
  await setPlainText(true);
  await setOption("mode", "null");
  ensureMathJax();
  startDomObserver();
  installNavListener();
  for (const pt of plainTexts) attachWhenReady(pt);
};

globalThis.ankiMdDeactivate = async () => {
  await loaded;
  document.body.classList.remove("anki-md-active");
  for (const fn of settings) globalThis[fn](true);
  await setPlainText(false);
  stopDomObserver();
  detachAllPreviews();
  removeNavListener();
};

loaded.then(() => {
  for (const fn of settings) {
    const orig = globalThis[fn];
    globalThis[fn] = (val: boolean) => orig(active() ? false : val);
  }
  const orig = globalThis.setPlainTexts;
  globalThis.setPlainTexts = (vals: boolean[]) => orig(active() ? vals.map(() => true) : vals);
});

lifecycle.onMount((api: PlainTextInputAPI) => {
  if (active()) {
    api.codeMirror.setOption("mode", "null");
    attachWhenReady(api);
  }
});
