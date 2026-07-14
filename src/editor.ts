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

// Hook global require to intercept and wrap the frozen anki/TemplateButtons module.
// In older Anki versions, media is inserted via insertMedia.
// In newer Anki versions (e.g. 26.5), it is inserted via resolveMedia.
// We intercept both to convert media insertion to markdown and insert directly to CodeMirror.
const originalRequire = (globalThis as any).require;
if (originalRequire && !(originalRequire as any)._ankiMdWrapped) {
  const wrappedRequire = function(name: string) {
    const module = originalRequire(name);
    if (name === "anki/TemplateButtons") {
      return {
        ...module,
        resolveMedia: function(html: string) {
          if (active() && activeCm5) {
            let cleanValue = html;
            const autoplay = localStorage.getItem("anki-md-audio-autoplay") !== "false";
            if (!autoplay) {
              cleanValue = cleanValue.replace(/\[sound:([^\]]+)\]/gi, '<audio src="$1" class="anki-md-click-play"></audio>');
            }
            activeCm5.replaceSelection(cleanValue);
            activeCm5.focus();
            return;
          }
          if (module.resolveMedia) {
            module.resolveMedia(html);
          }
        },
        insertMedia: function(html: string) {
          if (active() && activeCm5) {
            let cleanValue = html;
            const autoplay = localStorage.getItem("anki-md-audio-autoplay") !== "false";
            if (!autoplay) {
              cleanValue = cleanValue.replace(/\[sound:([^\]]+)\]/gi, '<audio src="$1" class="anki-md-click-play"></audio>');
            }
            activeCm5.replaceSelection(cleanValue);
            activeCm5.focus();
            return;
          }
          if (module.insertMedia) {
            module.insertMedia(html);
          }
        }
      };
    }
    return module;
  };
  (wrappedRequire as any)._ankiMdWrapped = true;
  (globalThis as any).require = wrappedRequire;
}

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

let activeCm5: any = null;

(globalThis as any).ankiMdInsertText = (text: string) => {
  let cm = activeCm5;
  if (!cm) {
    const cmEl = document.querySelector(".CodeMirror") as any;
    if (cmEl && cmEl.CodeMirror) {
      cm = cmEl.CodeMirror;
    }
  }
  if (cm && typeof cm.replaceSelection === "function") {
    cm.replaceSelection(text);
    cm.focus();
  } else {
    document.execCommand('insertText', false, text);
  }
};

let activeColor = "#66b2ff";
let activeHighlight = "#ffeb3b80";
let focusTimeout: any = null;

function syncCustomButtonsFocus() {
  if (focusTimeout) clearTimeout(focusTimeout);
  
  const isCmFocused = !!document.querySelector(".CodeMirror-focused");
  const activeEl = document.activeElement;
  const isClickingToolbar = activeEl && !!(activeEl.closest(".editor-toolbar") || activeEl.closest("anki-editor-toolbar"));
  const isFocused = isCmFocused || isClickingToolbar;
  
  const toolbar = document.querySelector(".editor-toolbar") || document.querySelector("anki-editor-toolbar");
  if (toolbar) {
    toolbar.querySelectorAll(".anki-md-custom-btn").forEach((el) => {
      const btn = el as HTMLButtonElement;
      if (isFocused) {
        btn.removeAttribute("disabled");
      } else {
        btn.setAttribute("disabled", "");
      }
    });
  }
}

if (!(globalThis as any)._ankiMdFocusListenersAdded) {
  (globalThis as any)._ankiMdFocusListenersAdded = true;
  
  document.addEventListener("focusin", () => {
    if (focusTimeout) clearTimeout(focusTimeout);
    focusTimeout = setTimeout(syncCustomButtonsFocus, 50);
  });
  
  document.addEventListener("focusout", () => {
    if (focusTimeout) clearTimeout(focusTimeout);
    focusTimeout = setTimeout(syncCustomButtonsFocus, 150);
  });
}

function wrapSelection(cm5: any, prefix: string, suffix: string) {
  if (!cm5) return;
  const selection = cm5.getSelection();
  if (!selection) {
    const doc = cm5.getDoc();
    const cursor = doc.getCursor();
    cm5.replaceSelection(prefix + suffix);
    doc.setCursor({ line: cursor.line, ch: cursor.ch + prefix.length });
  } else {
    cm5.replaceSelection(prefix + selection + suffix);
  }
  cm5.focus();
}

function wrapInActiveCm5(prefix: string, suffix: string) {
  if (!activeCm5) return;
  wrapSelection(activeCm5, prefix, suffix);
}

function insertMarkdownCloze(same: boolean) {
  if (!active() || !activeCm5) return;
  const selection = activeCm5.getSelection();
  const text = activeCm5.getValue();
  
  let max = 0;
  const matches = Array.from(text.matchAll(/\{\{c(\d+)::/g)) as RegExpExecArray[];
  for (const m of matches) {
    const val = parseInt(m[1], 10);
    if (val > max) max = val;
  }
  
  const idx = same ? (max || 1) : (max + 1);
  
  if (!selection) {
    const doc = activeCm5.getDoc();
    const cursor = doc.getCursor();
    activeCm5.replaceSelection(`{{c${idx}::}}`);
    doc.setCursor({ line: cursor.line, ch: cursor.ch + 5 + String(idx).length });
  } else {
    activeCm5.replaceSelection(`{{c${idx}::${selection}}}`);
  }
  activeCm5.focus();
}


function clickNativeHelper(nativeBtn: HTMLButtonElement | null) {
  if (!nativeBtn) return;
  const wasDisabled = nativeBtn.hasAttribute("disabled");
  if (wasDisabled) nativeBtn.removeAttribute("disabled");
  nativeBtn.click();
  if (wasDisabled) nativeBtn.setAttribute("disabled", "");
}

function injectMarkdownToolbar() {
  const toolbar = document.querySelector(".editor-toolbar") || document.querySelector("anki-editor-toolbar");
  if (!toolbar) return;
  
  // Remove any existing custom buttons first to prevent duplicates/stale renders
  toolbar.querySelectorAll(".anki-md-custom-btn").forEach(el => el.remove());
  toolbar.querySelectorAll(".anki-md-audio-split-group").forEach(el => el.remove());
  
  const allBtns = Array.from(toolbar.querySelectorAll("button"));
  const findBtn = (checkFn: (btn: HTMLButtonElement) => boolean) => allBtns.find(checkFn) || null;
  
  const getCleanText = (btn: HTMLButtonElement) => {
    return (btn.title || btn.getAttribute("aria-label") || btn.getAttribute("data-tooltip") || btn.textContent || "").toLowerCase();
  };

  const boldBtnPrimary = findBtn(btn => {
    const txt = getCleanText(btn);
    return txt.includes("bold") || txt.includes("加粗") || txt.includes("粗體") || txt.includes("ctrl+b") || txt.includes("⌘b");
  });
  
  const colorBtnPrimary = findBtn(btn => {
    const txt = getCleanText(btn);
    return txt.includes("color") || txt.includes("颜色") || txt.includes("顏色") || txt.includes("前景色") || txt.includes("文字") || txt.includes("字型") || txt.includes("字體");
  });
  
  const eraserBtnPrimary = findBtn(btn => {
    const txt = getCleanText(btn);
    return txt.includes("eraser") || txt.includes("clear") || txt.includes("清除") || txt.includes("橡皮擦") || txt.includes("格式");
  });
  
  const bulletBtnPrimary = findBtn(btn => {
    const txt = getCleanText(btn);
    return txt.includes("bullet") || txt.includes("无序") || txt.includes("無序") || txt.includes("項目") || txt.includes("项目") || txt.includes("清單") || txt.includes("清单") || txt.includes("shift+u") || txt.includes("⌘⇧u") || txt.includes("ctrl+shift+u");
  });
  
  const attachBtnPrimary = findBtn(btn => {
    const txt = getCleanText(btn);
    return txt.includes("attach") || txt.includes("file") || txt.includes("附件") || txt.includes("夹") || txt.includes("夾") || txt.includes("paperclip") || txt.includes("媒體") || txt.includes("media") || txt.includes("图片") || txt.includes("圖片") || txt.includes("音訊") || txt.includes("音效") || txt.includes("錄音") || txt.includes("录音") || txt.includes("視訊") || txt.includes("视频");
  });

  const superscriptBtnPrimary = findBtn(btn => {
    const txt = getCleanText(btn);
    return txt.includes("superscript") || txt.includes("上標") || txt.includes("上标") || txt.includes("ctrl+shift+=") || txt.includes("⌘⇧+");
  });
  
  const clozeBtnPrimary = findBtn(btn => {
    const txt = getCleanText(btn);
    return txt.includes("cloze") || txt.includes("挖空") || txt.includes("克漏字") || txt.includes("c1");
  });

  if (!boldBtnPrimary) console.warn("AnkiMD: Bold primary button not found");
  if (!colorBtnPrimary) console.warn("AnkiMD: Color primary button not found");
  if (!eraserBtnPrimary) console.warn("AnkiMD: Eraser primary button not found");
  if (!bulletBtnPrimary) console.warn("AnkiMD: Bullet primary button not found");
  if (!attachBtnPrimary) console.warn("AnkiMD: Attach primary button not found");
  if (!superscriptBtnPrimary) console.warn("AnkiMD: Superscript primary button not found");

  const boldGroup = boldBtnPrimary ? boldBtnPrimary.closest(".button-group") as HTMLElement : null;
  const colorGroup = colorBtnPrimary ? colorBtnPrimary.closest(".button-group") as HTMLElement : null;
  const eraserGroup = eraserBtnPrimary ? eraserBtnPrimary.closest(".button-group") as HTMLElement : null;
  const superscriptGroup = superscriptBtnPrimary ? superscriptBtnPrimary.closest(".button-group") as HTMLElement : null;
  const listGroup = bulletBtnPrimary ? bulletBtnPrimary.closest(".button-group") as HTMLElement : null;
  const insertGroup = attachBtnPrimary ? attachBtnPrimary.closest(".button-group") as HTMLElement : null;
  const clozeGroup = clozeBtnPrimary ? clozeBtnPrimary.closest(".button-group") as HTMLElement : null;
  
  const getBtn = (group: HTMLElement | null, index: number) => {
    if (!group) return null;
    const buttons = group.querySelectorAll("button");
    return (buttons[index] as HTMLButtonElement) || null;
  };
  
  const boldBtn = getBtn(boldGroup, 0);
  const italicBtn = getBtn(boldGroup, 1);
  const underlineBtn = getBtn(boldGroup, 2);
  const strikethroughBtn = getBtn(boldGroup, 3);
  
  const superscriptBtn = getBtn(superscriptGroup, 0);
  const subscriptBtn = getBtn(superscriptGroup, 1);
  
  const colorBtn = getBtn(colorGroup, 0);
  const colorArrowBtn = getBtn(colorGroup, 1);
  const highlightBtn = getBtn(colorGroup, 2);
  const highlightArrowBtn = getBtn(colorGroup, 3);
  const eraserBtn = getBtn(eraserGroup, 0);
  
  const bulletBtn = getBtn(listGroup, 0);
  const numberBtn = getBtn(listGroup, 1);
  
  const attachBtn = getBtn(insertGroup, 0);
  const micBtn = getBtn(insertGroup, 1);
  const mathBtn = getBtn(insertGroup, 2);
  const codeBtn = getBtn(insertGroup, 3);
  const hrBtn = getBtn(insertGroup, 4);
  
  const clozeBtn = getBtn(clozeGroup, 0);
  const clozeSameBtn = getBtn(clozeGroup, 1);
  
  // Tag groups as native format groups so CSS will hide their native children
  [boldGroup, colorGroup, eraserGroup, superscriptGroup, listGroup, insertGroup, clozeGroup].forEach((g) => {
    if (g) g.classList.add("anki-md-native-format-group");
  });
  
  const nativeClass = boldBtn ? boldBtn.className : "toolbar-button";
  
  const customButtons = [
    // Cloze group
    { btn: clozeBtn, label: "[::+]", title: "Cloze Deletion (Increment) (Cmd+Shift+C)", cmd: () => insertMarkdownCloze(false), targetGroup: clozeGroup },
    { btn: clozeSameBtn, label: "[::]", title: "Cloze Deletion (Same Index) (Cmd+Alt+Shift+C)", cmd: () => insertMarkdownCloze(true), targetGroup: clozeGroup },

    // 1. Text format group
    { btn: boldBtn, label: "B", title: "Bold (加粗)", cmd: () => wrapInActiveCm5("**", "**"), targetGroup: boldGroup, isBold: true },
    { btn: italicBtn, label: "I", title: "Italic (斜体)", cmd: () => wrapInActiveCm5("*", "*"), targetGroup: boldGroup },
    { btn: underlineBtn, label: "U", title: "Underline (下划线)", cmd: () => wrapInActiveCm5("<u>", "</u>"), targetGroup: boldGroup },
    { btn: strikethroughBtn, label: "S", title: "Strikethrough (删除线)", cmd: () => wrapInActiveCm5("~~", "~~"), targetGroup: boldGroup },
    { btn: superscriptBtn, label: "Superscript", title: "Superscript (上标)", cmd: () => wrapInActiveCm5("<sup>", "</sup>"), targetGroup: superscriptGroup },
    { btn: subscriptBtn, label: "Subscript", title: "Subscript (下标)", cmd: () => wrapInActiveCm5("<sub>", "</sub>"), targetGroup: superscriptGroup },
    
    // 2. Color / Eraser group
    {
      btn: colorBtn,
      label: "Color",
      title: "Foreground Color (前景色)",
      cmd: () => wrapInActiveCm5('<font color="' + activeColor + '">', '</font>'),
      targetGroup: colorGroup
    },
    { btn: colorArrowBtn, label: "v", title: "Select Foreground Color", cmd: () => clickNativeHelper(colorArrowBtn), targetGroup: colorGroup, isDropdown: true },
    {
      btn: highlightBtn,
      label: "Highlight",
      title: "Highlight Color (高亮)",
      cmd: () => wrapInActiveCm5('<span style="background-color: ' + activeHighlight + '">', '</span>'),
      targetGroup: colorGroup
    },
    { btn: highlightArrowBtn, label: "v", title: "Select Highlight Color", cmd: () => clickNativeHelper(highlightArrowBtn), targetGroup: colorGroup, isDropdown: true },
    {
      btn: null,
      label: "Mark",
      title: "Semantic Mark (高亮标记)",
      cmd: () => wrapInActiveCm5("<mark>", "</mark>"),
      targetGroup: colorGroup,
      svg: `<svg viewBox="0 0 24 24"><rect class="anki-md-mark-bg" x="3" y="3" width="18" height="18" rx="3" fill="#ffeb3b" fill-opacity="0.35"></rect><path d="M11 5.5L6 17.5h2.1l1.1-3h5.6l1.1 3H18L13 5.5h-2zm1 2.2l1.9 5.1h-3.8L12 7.7z" fill="currentColor"></path></svg>`
    },
    {
      btn: eraserBtn,
      label: "Clear",
      title: "Clear Formatting (清除格式)",
      cmd: () => {
        if (!activeCm5) return;
        const selection = activeCm5.getSelection();
        const cleaned = selection
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/\*([^*]+)\*/g, '$1')
          .replace(/~~([^~]+)~~/g, '$1')
          .replace(/<u>([^<]+)<\/u>/g, '$1')
          .replace(/<mark>([^<]+)<\/mark>/g, '$1')
          .replace(/<span style="background-color:[^"]*">([^<]+)<\/span>/g, '$1')
          .replace(/<font[^>]*>([^<]+)<\/font>/g, '$1');
        activeCm5.replaceSelection(cleaned);
        activeCm5.focus();
      },
      targetGroup: eraserGroup
    },
    
    // 3. Lists group
    {
      btn: bulletBtn,
      label: "• List",
      title: "Bullet List (无序列表)",
      cmd: () => {
        if (!activeCm5) return;
        const doc = activeCm5.getDoc();
        const cursor = doc.getCursor();
        const lineContent = doc.getLine(cursor.line);
        doc.replaceRange("- " + lineContent, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: lineContent.length });
        activeCm5.focus();
      },
      targetGroup: listGroup
    },
    {
      btn: numberBtn,
      label: "1. List",
      title: "Numbered List (有序列表)",
      cmd: () => {
        if (!activeCm5) return;
        const doc = activeCm5.getDoc();
        const cursor = doc.getCursor();
        const lineContent = doc.getLine(cursor.line);
        doc.replaceRange("1. " + lineContent, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: lineContent.length });
        activeCm5.focus();
      },
      targetGroup: listGroup
    },
    
    // 4. Insert / Media group (with click delegation to hidden native buttons!)
    {
      btn: attachBtn,
      label: "Attach",
      title: "Attach pictures/audio/video",
      cmd: () => {
        (globalThis as any).pycmd("attach");
      },
      targetGroup: insertGroup
    },
    {
      btn: micBtn,
      label: "Record",
      title: "Record audio",
      cmd: () => {
        (globalThis as any).pycmd("record");
      },
      targetGroup: insertGroup,
      className: "anki-md-mic-btn"
    },
    {
      btn: colorArrowBtn,
      label: "v",
      title: "Audio Insertion Mode (音频插入模式)",
      cmd: (e: Event) => {
        (globalThis as any).showAudioModeMenu(e);
      },
      targetGroup: insertGroup,
      isDropdown: true,
      className: "anki-md-audio-mode-btn"
    },
    {
      btn: codeBtn,
      label: "</>",
      title: "Inline Code (行内代码)",
      cmd: () => wrapInActiveCm5("`", "`"),
      targetGroup: insertGroup
    },
    {
      btn: null,
      label: "CB",
      title: "Code Block (代码块)",
      cmd: () => wrapInActiveCm5("```\n", "\n```"),
      targetGroup: insertGroup,
      svg: `<svg viewBox="0 0 24 24"><path d="M9.5 3a1.5 1.5 0 0 0-1.5 1.5v4.2c0 1.2-.6 2-1.5 2.5 1 .5 1.5 1.3 1.5 2.5v4.2A1.5 1.5 0 0 0 9.5 19.4h1.5V21H9.5C7.2 21 5.3 19.1 5.3 16.8v-2.7c0-1.2-.7-2.1-1.8-2.6 1.1-.5 1.8-1.4 1.8-2.6V6.2C5.3 3.9 7.2 2 9.5 2h1.5v1.6H9.5z" transform="translate(-2, 0)" fill="currentColor"></path><path d="M14.5 3a1.5 1.5 0 0 1 1.5 1.5v4.2c0 1.2.6 2 1.5 2.5c-.9.5-1.5 1.3-1.5 2.5v4.2a1.5 1.5 0 0 1-1.5 1.5H13V21h1.5c2.3 0 4.2-1.9 4.2-4.2v-2.7c0-1.2.7-2.1 1.8-2.6-1.1-.5-1.8-1.4-1.8-2.6V6.2C18.7 3.9 16.8 2 14.5 2H13v1.6h1.5z" transform="translate(2, 0)" fill="currentColor"></path></svg>`
    },
    {
      btn: mathBtn,
      label: "$$",
      title: "Math Formula (LaTeX)",
      cmd: () => wrapInActiveCm5("$", "$"),
      targetGroup: insertGroup
    },
    {
      btn: hrBtn,
      label: "Divider",
      title: "Divider (分割线)",
      cmd: () => wrapInActiveCm5("\n---\n", ""),
      targetGroup: insertGroup,
      svg: `<svg viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="2" rx="1" fill="currentColor"></rect></svg>`
    },
    {
      btn: null,
      label: "田",
      title: "Table (表格)",
      cmd: () => wrapInActiveCm5("\n| Header | Header |\n| --- | --- |\n| Cell | Cell |\n", ""),
      targetGroup: insertGroup,
      svg: `<svg viewBox="0 0 24 24"><path d="M4,5H20A2,2 0 0,1 22,7V17A2,2 0 0,1 20,19H4A2,2 0 0,1 2,17V7A2,2 0 0,1 4,5M4,7V11H8V7H4M10,7V11H14V7H10M16,7V11H20V7H16M4,13V17H8V13H4M10,13V17H14V13H10M16,13V17H20V13H16Z" fill="currentColor"></path></svg>`
    },
    {
      btn: null,
      label: "Abbr",
      title: "Abbreviation / Tooltip (缩写/悬浮提示)",
      cmd: () => {
        if (!activeCm5) return;
        const selection = activeCm5.getSelection();
        const doc = activeCm5.getDoc();
        const cursor = doc.getCursor();
        if (!selection) {
          activeCm5.replaceSelection("[]{}");
          doc.setCursor({ line: cursor.line, ch: cursor.ch + 1 });
        } else {
          activeCm5.replaceSelection(`[${selection}]{}`);
          const newCursor = doc.getCursor();
          doc.setCursor({ line: newCursor.line, ch: newCursor.ch - 1 });
        }
        activeCm5.focus();
      },
      targetGroup: insertGroup,
      svg: `<svg viewBox="0 0 24 24"><path transform="scale(-1, 1) translate(-24, 0)" d="M20,2H4C2.9,2,2,2.9,2,4v12c0,1.1,0.9,2,2,2h14l4,4V4C22,2.9,21.1,2,20,2z M20,16H5.2L4,17.2V4h16V16z M6,7h12v2H6V7z M6,11h10v2H6V11z" fill="currentColor"></path></svg>`
    }
  ];
  
  // Dynamically extract the Svelte wrapper span class and style from native buttons to ensure perfect layout/centering
  let spanClass = "svelte-19q1ue1";
  let spanStyle = "--width-multiplier: 1; --icon-size: 75%;";
  const nativeSpan = boldBtn ? boldBtn.querySelector("span") : null;
  if (nativeSpan) {
    spanClass = nativeSpan.className;
    spanStyle = nativeSpan.getAttribute("style") || spanStyle;
  }
  
  customButtons.forEach((cb) => {
    if (!cb.targetGroup) return;
    
    let parent: HTMLElement = cb.targetGroup;
    if (cb.className === "anki-md-mic-btn" || cb.className === "anki-md-audio-mode-btn") {
      let splitGroup = cb.targetGroup.querySelector(".anki-md-audio-split-group") as HTMLElement;
      if (!splitGroup) {
        splitGroup = document.createElement("div");
        splitGroup.className = "anki-md-audio-split-group";
        splitGroup.style.display = "inline-flex";
        splitGroup.style.alignItems = "center";
        cb.targetGroup.appendChild(splitGroup);
      }
      parent = splitGroup;
    }
    
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = (cb.btn ? cb.btn.className : nativeClass) + " anki-md-custom-btn";
    btn.title = cb.title;
    
    if ((cb as any).className) {
      btn.classList.add((cb as any).className);
    }
    
    if (cb.isDropdown) {
      btn.classList.add("anki-md-custom-dropdown-btn");
    }
    
    if (cb.btn && cb.btn.innerHTML) {
      btn.innerHTML = cb.btn.innerHTML;
      
      // Force underline colors to match preset colors (blue for text, yellow for highlight)
      if (cb.btn === colorBtn) {
        btn.style.setProperty("--color", activeColor);
        btn.style.setProperty("--color-bar-color", activeColor);
        const helper = btn.querySelector("svg#mdi-color-helper path");
        if (helper) {
          helper.setAttribute("fill", activeColor);
          (helper as SVGElement).style.fill = activeColor;
        }
      } else if (cb.btn === highlightBtn) {
        const uiColor = activeHighlight === "#ffeb3b80" ? "#ffeb3b" : activeHighlight;
        btn.style.setProperty("--color", uiColor);
        btn.style.setProperty("--color-bar-color", uiColor);
        const helper = btn.querySelector("svg#mdi-color-helper path");
        if (helper) {
          helper.setAttribute("fill", uiColor);
          (helper as SVGElement).style.fill = uiColor;
        }
      }
    } else if ("svg" in cb && cb.svg) {
      btn.innerHTML = `<span class="${spanClass}" style="${spanStyle}">${cb.svg}</span>`;
    } else {
      let content = cb.label;
      if (cb.label === "S") {
        content = `<s>S</s>`;
      } else {
        content = content.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      }
      btn.innerHTML = `<span class="${spanClass}" style="${spanStyle} ${cb.isBold ? 'font-weight: bold;' : ''}">${content}</span>`;
    }
    
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      if (btn.hasAttribute("disabled")) return;
      cb.cmd(e);
    });
    parent.appendChild(btn);
  });

  const updateCustomColorBtn = (customBtn: HTMLButtonElement, nativeBtn: HTMLButtonElement, isHighlight: boolean) => {
    let color = isHighlight ? "#ffff00" : "#0000ff";
    if (nativeBtn) {
      const style = nativeBtn.getAttribute("style") || "";
      const match = style.match(/--color:\s*(#[0-9a-fA-F]+|rgb\([^)]+\))/);
      if (match) {
        color = match[1];
      } else {
        const helper = nativeBtn.querySelector("svg#mdi-color-helper path");
        if (helper) {
          color = helper.getAttribute("fill") || (helper as SVGElement).style.fill || color;
        }
      }
    }
    
    // Normalize color value to check if it matches Anki's default colors
    const norm = color.toLowerCase().replace(/\s+/g, "");
    const isDefaultBlue = norm === "#0000ff" || norm === "rgb(0,0,255)";
    const isDefaultYellow = norm === "#ffff00" || norm === "rgb(255,255,0)";
    
    if (isHighlight) {
      if (isDefaultYellow) {
        activeHighlight = "#ffeb3b80";
        color = "#ffeb3b";
      } else {
        activeHighlight = color;
        color = activeHighlight;
      }
    } else {
      if (isDefaultBlue) {
        activeColor = "#66b2ff";
        color = "#66b2ff";
      } else {
        activeColor = color;
        color = activeColor;
      }
    }
    
    customBtn.style.setProperty("--color", color);
    customBtn.style.setProperty("--color-bar-color", color);
    const helper = customBtn.querySelector("svg#mdi-color-helper path");
    if (helper) {
      helper.setAttribute("fill", color);
      (helper as SVGElement).style.fill = color;
    }
  };

  // Start mutation observers to sync color picker choices
  if (colorBtn) {
    const observer = new MutationObserver(() => {
      const customColorBtn = toolbar.querySelector(".anki-md-custom-btn[title*='Foreground Color']") as HTMLButtonElement;
      if (customColorBtn) updateCustomColorBtn(customColorBtn, colorBtn, false);
    });
    observer.observe(colorBtn, { attributes: true, attributeFilter: ["style"] });
    const customColorBtn = toolbar.querySelector(".anki-md-custom-btn[title*='Foreground Color']") as HTMLButtonElement;
    if (customColorBtn) updateCustomColorBtn(customColorBtn, colorBtn, false);
  }
  
  if (highlightBtn) {
    const observer = new MutationObserver(() => {
      const customHighlightBtn = toolbar.querySelector(".anki-md-custom-btn[title*='Highlight Color']") as HTMLButtonElement;
      if (customHighlightBtn) updateCustomColorBtn(customHighlightBtn, highlightBtn, true);
    });
    observer.observe(highlightBtn, { attributes: true, attributeFilter: ["style"] });
    const customHighlightBtn = toolbar.querySelector(".anki-md-custom-btn[title*='Highlight Color']") as HTMLButtonElement;
    if (customHighlightBtn) updateCustomColorBtn(customHighlightBtn, highlightBtn, true);
  }
  
  // Set initial focus/disabled states
  syncCustomButtonsFocus();
}

/** Attach a preview overlay to a .plain-text-input container. */
function attachPreviewTo(container: HTMLElement, cm5?: any) {
  const existingPreview = container.querySelector(".anki-md-preview");

  if (cm5 && !(container as any)._cm5) {
    (container as any)._cm5 = cm5;
    
    // Set activeCm5 on focus
    cm5.on("focus", () => {
      activeCm5 = cm5;
    });
    
    // Bind keys for cloze deletion
    if (typeof cm5.getOption === "function" && typeof cm5.setOption === "function") {
      const rawKeys: Record<string, any> = {};
      rawKeys["Cmd-Shift-C"] = () => insertMarkdownCloze(false);
      rawKeys["Ctrl-Shift-C"] = () => insertMarkdownCloze(false);
      rawKeys["Cmd-Alt-Shift-C"] = () => insertMarkdownCloze(true);
      rawKeys["Ctrl-Alt-Shift-C"] = () => insertMarkdownCloze(true);
      
      let keys = cm5.getOption("extraKeys") || {};
      if (cm5.constructor && typeof (cm5.constructor as any).normalizeKeyMap === "function") {
        const normalized = (cm5.constructor as any).normalizeKeyMap(rawKeys);
        keys = { ...keys, ...normalized };
      } else {
        // CodeMirror 5 modifier order: Shift-Cmd-Ctrl-Alt
        keys["Shift-Cmd-C"] = () => insertMarkdownCloze(false);
        keys["Shift-Ctrl-C"] = () => insertMarkdownCloze(false);
        keys["Shift-Cmd-Alt-C"] = () => insertMarkdownCloze(true);
        keys["Shift-Ctrl-Alt-C"] = () => insertMarkdownCloze(true);
      }
      cm5.setOption("extraKeys", keys);
    }
    
    // Inject the top toolbar group
    injectMarkdownToolbar();
    
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
    // If clicking on a replay-button or inside one, play the sound and block edit mode transitions
    const btn = (e.target as HTMLElement).closest(".replay-button") as HTMLElement;
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      const filename = btn.getAttribute("data-filename");
      if (filename) {
        playPreviewAudio(e, btn, filename);
      }
      return;
    }

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
      if (typeof cm5.setOption === "function") {
        cm5.setOption("mode", "htmlmixed");
      }
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
    
    // Temporarily disconnect to avoid infinite mutation loops when we modify DOM
    domObserver?.disconnect();
    
    document.querySelectorAll<HTMLElement>(".plain-text-input").forEach((el) => {
      if (!el.querySelector(".anki-md-preview")) attachPreviewTo(el);
    });
    injectMarkdownToolbar();
    
    // Reconnect the observer
    if (domObserver) {
      domObserver.observe(document.body, { childList: true, subtree: true });
    }
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
    el.querySelector(".anki-md-field-toolbar")?.remove();
    el.style.minHeight = "";
    el.style.position = "";
  });
}

/** Handle arrow keys to navigate card list (Left/Right) or sidebar (Up/Down) when not editing. */
function handleBrowserNav(e: KeyboardEvent) {
  if (!active()) return;
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;

  // If any CodeMirror editor is focused (user is editing), don't intercept any keys
  if (document.querySelector(".CodeMirror-focused")) return;

  e.preventDefault();
  e.stopPropagation();

  let dir = "";
  if (e.key === "ArrowUp") dir = "up";
  else if (e.key === "ArrowDown") dir = "down";
  else if (e.key === "ArrowLeft") dir = "left";
  else if (e.key === "ArrowRight") dir = "right";

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
  await setOption("mode", "htmlmixed");
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
  
  // Remove custom toolbar buttons
  document.querySelectorAll(".anki-md-custom-btn").forEach((btn) => btn.remove());
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
    api.codeMirror.setOption("mode", "htmlmixed");
    attachWhenReady(api);
  }
});

// Process activation queue (handles race conditions if Python triggers before JS is loaded)
const queue = (window as any).__ankiMdQueue || [];
for (const cmd of queue) {
  if (cmd === 'activate') globalThis.ankiMdActivate();
  if (cmd === 'deactivate') globalThis.ankiMdDeactivate();
}
(window as any).__ankiMdQueue = [];

// Audio replay button animation and preview play controller
function playPreviewAudio(e: Event, el: HTMLElement, filename: string) {
  e.preventDefault();
  e.stopPropagation();
  
  if (el) {
    if (el.classList.contains("playing")) return;
    el.classList.add("playing");
    setTimeout(() => {
      el.classList.remove("playing");
    }, 2000);
  }
  
  (globalThis as any).pycmd("anki-md-play-sound:" + filename);
}
(globalThis as any).playPreviewAudio = playPreviewAudio;

if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest(".replay-button") as HTMLElement;
    if (!btn) return;
    if (btn.classList.contains("playing")) return;
    
    btn.classList.add("playing");
    
    const localAudio = (btn as any)._localAudio;
    if (localAudio) {
      const onEnded = () => {
        btn.classList.remove("playing");
        localAudio.removeEventListener("ended", onEnded);
        localAudio.removeEventListener("pause", onEnded);
      };
      localAudio.addEventListener("ended", onEnded);
      localAudio.addEventListener("pause", onEnded);
    } else {
      setTimeout(() => {
        btn.classList.remove("playing");
      }, 2000);
    }
  });
}

function showAudioModeMenu(e: Event) {
  e.stopPropagation();
  const triggerBtn = (e.currentTarget || e.target) as HTMLElement;
  
  // Remove any existing dropdown menus first
  document.querySelectorAll(".anki-md-audio-dropdown").forEach(el => el.remove());
  
  const dropdown = document.createElement("div");
  dropdown.className = "anki-md-audio-dropdown";
  
  // Get current preference
  const isAutoplay = localStorage.getItem("anki-md-audio-autoplay") !== "false";
  
  const optAutoplay = document.createElement("div");
  optAutoplay.className = "anki-md-audio-dropdown-item" + (isAutoplay ? " active" : "");
  optAutoplay.innerHTML = `<span>自动播放 ([sound:])</span>${isAutoplay ? " ✓" : ""}`;
  optAutoplay.onclick = () => {
    localStorage.setItem("anki-md-audio-autoplay", "true");
    dropdown.remove();
    updateAudioModeIndicator();
  };
  
  const optClickPlay = document.createElement("div");
  optClickPlay.className = "anki-md-audio-dropdown-item" + (!isAutoplay ? " active" : "");
  optClickPlay.innerHTML = `<span>点击播放 (&lt;audio&gt;)</span>${!isAutoplay ? " ✓" : ""}`;
  optClickPlay.onclick = () => {
    localStorage.setItem("anki-md-audio-autoplay", "false");
    dropdown.remove();
    updateAudioModeIndicator();
  };
  
  dropdown.appendChild(optAutoplay);
  dropdown.appendChild(optClickPlay);
  
  // Style the dropdown
  Object.assign(dropdown.style, {
    position: "fixed",
    zIndex: "99999",
    background: "var(--canvas, #fff)",
    border: "1px solid var(--border, #ccc)",
    borderRadius: "6px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    padding: "4px 0",
    minWidth: "160px",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: "13px",
    color: "var(--fg, #000)"
  });
  
  document.body.appendChild(dropdown);
  
  // Position it under the trigger button
  const rect = triggerBtn.getBoundingClientRect();
  dropdown.style.top = `${rect.bottom + 4}px`;
  dropdown.style.left = `${rect.left}px`;
  
  // Close menu on outside click
  const closeMenu = (ev: MouseEvent) => {
    if (!dropdown.contains(ev.target as Node)) {
      dropdown.remove();
      document.removeEventListener("click", closeMenu);
    }
  };
  setTimeout(() => {
    document.addEventListener("click", closeMenu);
  }, 50);
}
(globalThis as any).showAudioModeMenu = showAudioModeMenu;

function updateAudioModeIndicator() {
  const isAutoplay = localStorage.getItem("anki-md-audio-autoplay") !== "false";
  const btn = document.querySelector(".anki-md-audio-mode-btn") as HTMLElement;
  if (btn) {
    btn.title = isAutoplay 
      ? "Recording mode: Autoplay ([sound:])" 
      : "Recording mode: Click-to-play (<audio>)";
    btn.classList.toggle("autoplay-active", isAutoplay);
    btn.classList.toggle("clickplay-active", !isAutoplay);
    
    const svgPath = btn.querySelector("svg path");
    if (svgPath) {
      svgPath.setAttribute("fill", isAutoplay ? "currentColor" : "var(--_color-note, #2563eb)");
    }
  }
}
(globalThis as any).updateAudioModeIndicator = updateAudioModeIndicator;

// Automatically initialize indicator state on mount
setTimeout(() => {
  updateAudioModeIndicator();
}, 200);


