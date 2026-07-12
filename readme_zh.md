# Anki Markdown Pro

[English](readme.md) | [中文](readme_zh.md) | [日本語](readme_ja.md)

> Anki Markdown 笔记插件，语法高亮由 [Shiki](https://shiki.style) 强力驱动

在 Anki 中使用 Markdown 编写闪卡，并享受完整的[语法高亮](docs.md#code-blocks)。支持从 300 多种语言和 60 多款主题中自由选择——且只会下载和同步你选中的部分。全面支持桌面端、移动端和 AnkiWeb 的亮暗色模式。

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="media/back-dark.png">
    <img src="media/back.png" alt="Anki Markdown Pro card example" width="800">
  </picture>
</p>

> [!NOTE]
> 仅支持 [Anki](https://apps.ankiweb.net/) 25.x 及以上版本。请前往 `工具 → 附加组件 → 获取附加组件`，输入 [`1172202975`](https://ankiweb.net/shared/info/1172202975) 进行安装。
> 查看[官方文档](docs.md)了解所有受支持的功能。

- **语法高亮**：300+ 语言和 60+ 主题可选，按需下载和同步，保持轻量
- **高级代码批注**：包括行高亮、词高亮、专注模式以及错误/警告标记
- **全功能 Markdown**：支持加粗、斜体、列表、引用块、表格、直接粘贴图片、警告块等
- **纯净卡片设计**：精心打磨的亮/暗色样式，完美契合 Anki 原生 UI
- **配置面板**：可动态配置你想要的语言和主题
- **跨平台支持**：完美运行于电脑端、AnkiDroid、AnkiMobile 和 AnkiWeb
- **[内置 AI Agent 技能](#ai-agent-skill)**：内置专属技能，允许 AI 编程助手通过 [AnkiConnect](https://foosoft.net/projects/anki-connect/) 直接为你生成 Markdown 闪卡

## 如何使用

安装插件后：

1. 使用 **MD** 模板（添加 → 牌型下拉菜单 → MD）**创建一条新笔记**
2. 在正面（Front）字段使用 Markdown **编写你的问题**
3. 在背面（Back）字段使用 Markdown **编写你的答案**
4. 在复习这张卡片时，Markdown 代码将被自动渲染并加上语法高亮

> [!NOTE]
> 有关所有的 Markdown 支持特性（包括代码块、行高亮、警告块等），请查阅[官方文档](docs.md)。

## AI Agent 技能

Markdown 天生就是为 AI 生成的内容准备的最佳格式，本插件更是将其发挥到了极致。它自带一个联动技能（Skill），让像 Claude Code、Codex 这样的 AI 编程智能体，可以通过 [AnkiConnect](https://foosoft.net/projects/anki-connect/) 直接从你的代码编辑器里创建和管理 Markdown 闪卡。本插件负责渲染 Markdown，而 AI 技能负责生成内容。

**环境要求：** 在后台运行的 Anki 桌面端，并已安装 [AnkiConnect](https://foosoft.net/projects/anki-connect/) 插件。

安装命令：

```bash
npx skills add terkelg/anki-markdown -s anki
```

## 插件设置

从菜单栏打开设置面板：`工具 → 附加组件 → Anki Markdown Pro → Config`。

- **语言 (Languages)** — 选择哪些编程语言需要语法高亮。保存时会自动下载新语言。使用过滤和“仅已选”开关来管理你的列表。
- **主题 (Theme)** — 为亮色和暗色模式分别选择一个 Shiki 主题。
- **界面 (UI)** — 切换“无边框模式 (cardless mode)”，享受无边界的现代卡片设计。

## 开发指南

关于构建、测试和发布说明，请参见 [development.md](development.md)。
