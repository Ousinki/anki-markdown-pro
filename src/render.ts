import "./style.css";
import { md, renderWithLatex } from "./markdown-core";
import { createHighlighterCore } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import type { HighlighterCore } from "@shikijs/core";
import type { ShikiTransformer } from "shiki";
import type { Element } from "hast";
import {
  transformerMetaHighlight,
  transformerMetaWordHighlight,
  transformerNotationErrorLevel,
  transformerNotationFocus,
} from "@shikijs/transformers";
import { processCloze, postProcessCloze, type Side } from "./cloze";

// Config from inline JSON (injected by Python)
interface Config {
  languages: string[];
  themes: { light: string; dark: string };
  cardless: boolean;
}

function getConfig(): Config {
  const el = document.getElementById("anki-md-config");
  if (!el?.textContent) {
    return {
      languages: ["text"],
      themes: { light: "vitesse-light", dark: "vitesse-dark" },
      cardless: false,
    };
  }
  return JSON.parse(el.textContent);
}

const config = getConfig();
const themes = config.themes;

async function loadLanguages() {
  const results = await Promise.allSettled(
    config.languages.map((name) => import(/* @vite-ignore */ `./_lang-${name}.js`)),
  );
  return results.flatMap((r, i) => {
    if (r.status === "fulfilled") return [r.value.default].flat();
    console.log(`[anki-md] Failed to load language: ${config.languages[i]}`);
    return [];
  });
}

async function loadThemes() {
  const names = [...new Set([config.themes.light, config.themes.dark])];
  const results = await Promise.allSettled(names.map((name) => import(/* @vite-ignore */ `./_theme-${name}.js`)));
  return results.flatMap((r, i) => {
    if (r.status === "fulfilled") return [r.value.default];
    console.log(`[anki-md] Failed to load theme: ${names[i]}`);
    return [];
  });
}

const baseTransformers = [
  transformerMetaHighlight(),
  transformerMetaWordHighlight(),
  transformerNotationErrorLevel({ matchAlgorithm: "v3" }),
  transformerNotationFocus({ matchAlgorithm: "v3" }),
];

let highlighter: HighlighterCore;
const warned = new Set<string>();

async function initHighlighter(): Promise<HighlighterCore> {
  const [langs, themeList] = await Promise.all([loadLanguages(), loadThemes()]);
  return createHighlighterCore({
    langs,
    themes: themeList,
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
}

function classes(node: Element): string[] {
  const value = node.properties.class;
  if (Array.isArray(value)) return value.filter((value) => typeof value === "string");
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  return [];
}

function lang(node: Element): string {
  const child = node.children[0];
  if (child?.type !== "element") return "text";
  const value = classes(child).find((value) => value.startsWith("language-"));
  return value?.slice("language-".length) || "text";
}

const codeBlock: ShikiTransformer = {
  name: "code-block",
  pre(node) {
    const name = typeof this.options.lang === "string" ? this.options.lang : lang(node);
    const style = node.properties.style;
    const figure: Element = {
      type: "element",
      tagName: "figure",
      properties: { class: ["code-block", ...classes(node)], style },
      children: [
        { ...node } as Element,
        {
          type: "element",
          tagName: "figcaption",
          properties: { class: "toolbar" },
          children: [
            {
              type: "element",
              tagName: "span",
              properties: { class: "lang" },
              children: [{ type: "text", value: name }],
            },
            {
              type: "element",
              tagName: "span",
              properties: { class: "actions" },
              children: [
                {
                  type: "element",
                  tagName: "button",
                  properties: { type: "button", class: "toggle" },
                  children: [{ type: "text", value: "Reveal" }],
                },
                {
                  type: "element",
                  tagName: "button",
                  properties: { type: "button", class: "copy" },
                  children: [{ type: "text", value: "Copy" }],
                },
              ],
            },
          ],
        },
      ],
    };

    node.properties = {};
    Object.assign(node, figure);
  },
};

const codeInline: ShikiTransformer = {
  name: "code-inline",
  pre(node) {
    const value = classes(node);
    node.tagName = "code";
    node.properties.class = ["code-inline", ...value];
    // Flatten: move inner <code> children up
    const inner = node.children[0] as Element;
    if (inner?.tagName === "code") {
      node.children = inner.children;
    }
  },
};

/** Parse an HTML string and return its root element. */
function parse(html: string): HTMLElement | null {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  return tpl.content.firstElementChild as HTMLElement;
}

// Fallback skeleton for code blocks rendered before Shiki is ready.
// Cloned per block — textContent/dataset fills are inherently XSS-safe.
const skeleton = parse(
  `<figure class="code-block" data-pending>` +
    `<pre><code></code></pre>` +
    `<figcaption class="toolbar"><span class="lang"></span>` +
    `<span class="actions">` +
    `<button type="button" class="toggle">Reveal</button>` +
    `<button type="button" class="copy">Copy</button>` +
    `</span></figcaption></figure>`,
)!;

function warn(name: string) {
  if (!name || name === "text" || warned.has(name)) return;
  warned.add(name);
  console.log(
    `[anki-md] Language not loaded: ${name}. Falling back to plain text. Open Anki Markdown Pro settings to enable and download it.`,
  );
}

function plain(code: string, name: string, meta?: string, pending = false) {
  const el = skeleton.cloneNode(true) as HTMLElement;
  el.querySelector("code")!.textContent = code;
  el.querySelector(".lang")!.textContent = name;
  if (meta) el.dataset.meta = meta;
  if (!pending) el.removeAttribute("data-pending");
  return el.outerHTML;
}

function highlight(code: string, name: string, meta?: string) {
  if (!highlighter) {
    return plain(code, name, meta, true);
  }

  if (!highlighter.getLoadedLanguages().includes(name)) {
    warn(name);
    return plain(code, name, meta);
  }

  try {
    return highlighter.codeToHtml(code, {
      lang: name,
      themes,
      meta: { __raw: meta },
      defaultColor: false,
      transformers: [...baseTransformers, codeBlock],
    });
  } catch {
    warn(name);
    return plain(code, name, meta);
  }
}

const ready = initHighlighter().then((value) => (highlighter = value));
md.renderer.rules.fence = (tokens, idx) => {
  const { content, info } = tokens[idx];
  const [lang, ...rest] = info.split(/\s+/);
  return highlight(content.trimEnd(), lang || "text", rest.join(" "));
};

// Inline code: `code`{lang}
md.core.ruler.after("inline", "inline-code-lang", (state) => {
  for (const token of state.tokens) {
    if (token.type !== "inline" || !token.children) continue;
    for (let i = 0; i < token.children.length; i++) {
      if (token.children[i].type !== "code_inline") continue;
      const next = token.children[i + 1];
      if (next?.type !== "text") continue;
      const match = next.content.match(/^\{\.?([^{}\s]+)\}(.*)$/);
      if (!match) continue;
      const [, lang, rest] = match;
      token.children[i].meta = { lang };
      next.content = rest;
      if (!rest) token.children.splice(i + 1, 1);
    }
  }
});

md.renderer.rules.code_inline = (tokens, idx) => {
  const { content, meta } = tokens[idx];
  const escaped = md.utils.escapeHtml(content);
  if (!meta?.lang) return `<code>${escaped}</code>`;
  if (!highlighter) return `<code data-pending data-lang="${md.utils.escapeHtml(meta.lang)}">${escaped}</code>`;
  if (!highlighter.getLoadedLanguages().includes(meta.lang)) {
    warn(meta.lang);
    return `<code>${escaped}</code>`;
  }
  try {
    return highlighter.codeToHtml(content, {
      lang: meta.lang,
      themes,
      defaultColor: false,
      transformers: [codeInline],
    });
  } catch {
    warn(meta.lang);
    return `<code>${escaped}</code>`;
  }
};

// Event delegation for toolbar
const card = document.querySelector(".card");
if (navigator.clipboard) card?.classList.add("clipboard");

card?.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const block = target.closest(".code-block");
  if (!block) return;

  const toggle = target.closest(".toggle") as HTMLElement;
  if (toggle) {
    const revealed = block.classList.toggle("revealed");
    toggle.textContent = revealed ? "Hide" : "Reveal";
  }
  const copy = target.closest(".copy") as HTMLElement;
  if (copy) {
    navigator.clipboard.writeText(block.querySelector("code")?.textContent || "");
    copy.textContent = "Copied";
    setTimeout(() => (copy.textContent = "Copy"), 1500);
  }
});

// Textarea trick: browser decodes all HTML entities when parsing innerHTML
const decoder = document.createElement("textarea");

function decode(text: string): string {
  decoder.innerHTML = text.replace(/<br\s*\/?>/gi, "\n");
  return decoder.value;
}

/**
 * Re-highlight code rendered before Shiki was ready.
 * Swaps content and copies attributes in-place so layout never shifts.
 */
function upgrade(container: HTMLElement) {
  for (const fig of container.querySelectorAll<HTMLElement>(".code-block[data-pending]")) {
    const code = fig.querySelector("code");
    if (!code) continue;
    const lang = fig.querySelector(".lang")?.textContent || "text";
    const fresh = parse(highlight(code.textContent?.replace(/\n$/, "") || "", lang, fig.dataset.meta));
    if (!fresh) continue;
    const inner = fresh.querySelector("code");
    if (inner) code.innerHTML = inner.innerHTML;
    fig.className = fresh.className;
    if (fresh.style.cssText) fig.style.cssText = fresh.style.cssText;
    fig.removeAttribute("data-pending");
    fig.removeAttribute("data-meta");
  }

  for (const el of container.querySelectorAll<HTMLElement>("code[data-pending]")) {
    const lang = el.dataset.lang || "text";
    el.removeAttribute("data-pending");
    el.removeAttribute("data-lang");
    if (!highlighter.getLoadedLanguages().includes(lang)) {
      warn(lang);
      continue;
    }
    try {
      const fresh = parse(
        highlighter.codeToHtml(el.textContent || "", {
          lang,
          themes,
          defaultColor: false,
          transformers: [codeInline],
        }),
      );
      if (!fresh) continue;
      el.innerHTML = fresh.innerHTML;
      el.className = fresh.className;
      if (fresh.style.cssText) el.style.cssText = fresh.style.cssText;
    } catch {
      warn(lang);
      console.log(`[anki-md] Failed to highlight inline code for language: ${lang}`);
    }
  }
}

// Mirror the host's dark-mode class onto our wrapper so theming stays scoped.
// - Desktop: nightMode + night_mode on <body> (qt/aqt/theme.py body_classes_for_card_ord)
//   https://github.com/ankitects/anki/blob/main/qt/aqt/theme.py
// - AnkiDroid: night_mode on <body>
//   https://github.com/ankidroid/Anki-Android/wiki/Advanced-formatting
// - AnkiMobile: nightMode on card element
//   https://docs.ankimobile.net/night-mode.html
// - AnkiWeb: no class — always light
function normalizeDarkMode(wrapper: HTMLElement | null) {
  if (!wrapper) return;
  const card = document.querySelector(".card");
  const dark =
    document.body.classList.contains("nightMode") ||
    document.body.classList.contains("night_mode") ||
    card?.classList.contains("nightMode");
  if (dark) wrapper.classList.add("night-mode");
}

async function upgradeHighlighter(...els: (HTMLElement | null)[]) {
  if (!highlighter) {
    try {
      await ready;
      for (const el of els) if (el) upgrade(el);
    } catch {
      console.log("[anki-md] Failed to load highlighter");
    }
  }
}

function replaceReplayButtons(container: HTMLElement | null) {
  if (!container) return;
  const buttons = container.querySelectorAll(".replay-button");
  for (const btn of Array.from(buttons)) {
    if (btn.querySelector("svg.play-button")) continue;
    btn.innerHTML = `<svg class="play-button" viewBox="0 0 24 24">
  <path class="speaker-body" d="M11 5L6 9H2v6h4l5 4V5z" />
  <path class="wave-1" d="M15.54 8.46a5 5 0 0 1 0 7.07" />
  <path class="wave-2" d="M19.07 4.93a10 10 0 0 1 0 14.14" />
</svg>`;
  }
}

/** Render front/back fields to card DOM. */
export async function render(front: string, back: string) {
  const wrapper = document.querySelector<HTMLElement>(".anki-md-wrapper");
  normalizeDarkMode(wrapper);

  const frontEl = document.querySelector<HTMLElement>(".front");
  const backEl = document.querySelector<HTMLElement>(".back");

  wrapper?.setAttribute("data-state", "loading");
  if (config.cardless) wrapper?.classList.add("cardless");

  if (frontEl) frontEl.innerHTML = renderWithLatex(decode(front));
  if (backEl) backEl.innerHTML = renderWithLatex(decode(back));
  replaceReplayButtons(frontEl);
  replaceReplayButtons(backEl);

  wrapper?.classList.add("ready");
  // @ts-ignore
  if (typeof MathJax !== "undefined" && MathJax.typesetPromise) MathJax.typesetPromise();

  await upgradeHighlighter(frontEl, backEl);

  wrapper?.setAttribute("data-state", "ready");
  wrapper?.classList.add("ready");
  // @ts-ignore
  if (typeof MathJax !== "undefined" && MathJax.typesetPromise) MathJax.typesetPromise();
}

/** Render cloze deletion card to DOM. */
export async function renderCloze(text: string, extra: string, ordinal: number, side: Side) {
  const wrapper = document.querySelector<HTMLElement>(".anki-md-wrapper");
  normalizeDarkMode(wrapper);

  const frontEl = document.querySelector<HTMLElement>(".front");
  const backEl = document.querySelector<HTMLElement>(".back");
  const raw = decode(text);

  wrapper?.setAttribute("data-state", "loading");
  if (config.cardless) wrapper?.classList.add("cardless");

  const processed = processCloze(raw, ordinal, side);
  if (frontEl) frontEl.innerHTML = postProcessCloze(renderWithLatex(processed));

  const extraText = decode(extra);
  if (backEl && extraText.trim()) backEl.innerHTML = renderWithLatex(extraText);

  replaceReplayButtons(frontEl);
  replaceReplayButtons(backEl);

  wrapper?.classList.add("ready");
  // @ts-ignore
  if (typeof MathJax !== "undefined" && MathJax.typesetPromise) MathJax.typesetPromise();
  await upgradeHighlighter(frontEl, backEl);

  wrapper?.setAttribute("data-state", "ready");
  wrapper?.classList.add("ready");
  // @ts-ignore
  if (typeof MathJax !== "undefined" && MathJax.typesetPromise) MathJax.typesetPromise();
}

function playPreviewAudio(e: Event, el: HTMLElement, filename: string) {
  e.preventDefault();
  let audio = (el as any)._localAudio;
  if (!audio) {
    audio = new Audio(filename);
    (el as any)._localAudio = audio;
  }
  audio.currentTime = 0;
  audio.play();
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
      // Reviewer play has no localAudio object on DOM node, so animate for 2 seconds
      setTimeout(() => {
        btn.classList.remove("playing");
      }, 2000);
    }
  });
}

