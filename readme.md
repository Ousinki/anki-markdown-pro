# Anki Markdown Pro

[English](readme.md) | [中文](readme_zh.md) | [日本語](readme_ja.md)
> Anki add-on for Markdown notes with syntax highlighting powered by [Shiki](https://shiki.style)

Write flashcards in Markdown with full [syntax highlighting](docs.md#code-blocks). Pick from 300+ languages and 60+ themes — only your selections are downloaded and synced. Supports light and dark mode across desktop, mobile, and AnkiWeb.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="media/back-dark.png">
    <img src="media/back.png" alt="Anki Markdown Pro card example" width="800">
  </picture>
</p>

> [!NOTE]
> Requires [Anki](https://apps.ankiweb.net/) 25.x or later. Go to `Tools → Add-ons → Get Add-ons` and enter [`1172202975`](https://ankiweb.net/shared/info/1172202975) to install.
> See the [documentation](docs.md) for all supported features.

- **Syntax highlighting** with 300+ languages and 60+ themes, only your selections are downloaded and synced
- **Advanced code annotations** including line highlighting, word highlighting, focus mode, and error/warning markers
- **Formula Support (MathJax & mhchem)**: Built-in native MathJax formula rendering supporting standard `$` and `$$` delimiters, with zero-configuration out-of-the-box support for `mhchem` chemical equations (`\ce{...}`)
- **Full Markdown** with bold, italic, lists, blockquotes, tables, images, alerts, **highlight text marking (`==highlight==`)**, **premium `<kbd>` 3D keycap styling**, and more
- **Abbreviations & Tooltips (`[text]{tooltip}`)**: Native inline tooltip syntax. Displays an elegant glassmorphism floating card on hover or tap, featuring smart edge boundary collision detection.
- **Dual-Mode Audio Playback**: Supports pasted or recorded audio with standard autoplay or click-to-play mode (renders as an inline speaker icon while automatically hiding native HTML5 player spacers on iOS/mobile). Includes a toolbar selector to toggle the insertion mode.
- **Markdown Cloze Deletion**: Native support for Markdown cloze deletion cards (`Anki Markdown Cloze` note type), featuring seamlessly integrated cloze shortcuts (`Cmd/Ctrl+Shift+C`) and toolbar buttons inside the CodeMirror editor with smart index incrementing and same-index cloze support
- **Full keyboard browser navigation**: Card browser supports dual-axis direction keys. Left/Right to change cards, Up/Down to change decks/tags. Sidebar selection updates the card list automatically without manual mouse clicks.
- **Browser-Add Integration (Inline Card Addition)**: Appends a modern "+ Add Note" button below the card list, allowing card creation directly in the right-hand editor pane with `Cmd+Enter` saving and auto-cycling. Supports smart deck targeting based on sidebar selections.
- **Clean card design** with polished light/dark styling that matches Anki's native UI
- **Settings panel** to dynamically pick languages and themes
- **Cross-platform** works on desktop, AnkiDroid, AnkiMobile, and AnkiWeb
- **[AI agent skill](#ai-agent-skill)** built-in skill that lets AI agents create markdown flashcards via [AnkiConnect](https://foosoft.net/projects/anki-connect/)

## Usage

After installing the add-on:

1. **Create a new note** using the **MD** note type (Add → Note Type dropdown → Anki Markdown Pro)
2. **Write your question** in the Front field using markdown
3. **Write your answer** in the Back field using markdown
4. The markdown will be automatically rendered with syntax highlighting when you review the card

> [!NOTE]
> See the [documentation](docs.md) for all supported markdown features including code blocks, line highlighting, alerts, and more.

## Browser Keyboard Navigation

This add-on implements a seamless **full-keyboard navigation flow** for the Anki Card Browser, allowing you to completely ditch the mouse:

- **Mouse-Free Open**: When you open the Browser, focus is automatically directed to the card list table view. Meanwhile, the left sidebar tree expands and highlights the active deck of the selected card automatically.
- **In Card List View**:
  - Press **Left / Right arrow keys (`Left` / `Right`)**: Move the card selection up and down (`Left` goes up, `Right` goes down).
  - Press **Up / Down arrow keys (`Up` / `Down`)**: Focus shifts instantly to the left sidebar tree view, focusing and highlighting the active deck with a blue focus frame.
- **In Left Sidebar Tree**:
  - Press **Up / Down arrow keys (`Up` / `Down`)**: Move the sidebar selection (decks/tags/saved searches). **The card list is automatically refreshed** in real time as the selection moves.
  - Press **Left / Right arrow keys (`Left` / `Right`)**: Focus shifts instantly back to the card list, allowing you to resume card scrolling with Left/Right keys.
- When typing in the search box, press **`Esc`** to focus back to the card list.
  - Press **`Enter`** to search, and the focus will **automatically shift back to the card list within 100ms** after search execution, allowing you to browse results immediately with keys.

## Browser-Add Integration (Inline Card Addition)

This add-on integrates the native "Add Cards" panel directly into the Browser window's right-hand editor pane:

- **Quick Trigger**: Click the **`+ Add Note`** button at the bottom of the card list. The editor panel clears immediately and displays `Save Note` and `Cancel` buttons.
- **Smart Deck Targeting**: Newly created notes are automatically bound to the deck currently selected in the left sidebar (e.g., `Coding::Figma`), preventing cards from being created in the wrong deck.
- **Save and Auto-Cycle**:
  - Click `Save Note` or press **`Ctrl+Enter`** / **`Cmd+Enter`** to save the note.
  - Once saved, the card list refreshes immediately, and the **editor panel automatically prepares a new blank form** so you can continue adding notes consecutively.
- **Zero-Clutter Draft Cleanup**: If you click `Cancel` or **click any existing card in the table view** while in add mode, the addon automatically exits Add Mode and deletes the temporary empty draft note from the collection, keeping your database completely clean.

## AI Agent Skill

Markdown is a perfect format for AI-generated content, and this add-on leans into that. It ships with a companion skill that lets AI coding agents (Claude Code, Codex, etc.) create and manage markdown flashcards directly from your editor via [AnkiConnect](https://foosoft.net/projects/anki-connect/). The add-on renders the markdown, the skill creates it.

**Prerequisites:** Anki desktop running with [AnkiConnect](https://foosoft.net/projects/anki-connect/) installed.

Install:

```bash
npx skills add terkelg/anki-markdown -s anki
```

## Settings

Open the settings panel from `Tools → Add-ons → Anki Markdown Pro → Config`.

- **Languages** — pick which languages are available for syntax highlighting. New languages are downloaded on save. Use the filter and "Selected only" toggle to manage your list.
- **Theme** — choose separate Shiki themes for light and dark mode.
- **UI** — toggle cardless mode for a borderless card design.

## Development

See [development.md](development.md) for build, test, and release instructions.
