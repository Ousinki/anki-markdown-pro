# 技术踩坑与架构文档 (Technical Notes)

本文档记录了 **Anki Markdown Pro** 在开发“直接粘贴图片”功能时遇到的核心技术难题、踩坑过程以及最终的完美解决方案。旨在为未来的插件开发和迭代提供经验参考，避免重蹈覆辙。

## 1. 核心需求与背景
原版 `Anki Markdown` 插件不支持在 Markdown 编辑器中直接粘贴图片。用户必须切换回原生富文本编辑器才能粘贴图片，体验断裂。
我们的目标是：拦截编辑器的粘贴事件，将剪贴板中的图片保存到 Anki 媒体库，并在**当前光标位置**插入 Markdown 图片语法 `![](filename.png)`。

## 2. 遇到的致命 Bug：光标强制跳到末尾
在初版实现中，图片成功保存，Markdown 代码也成功插入，但出现了一个极为顽固的 Bug：**每次插入完成后，编辑器的光标都会不受控制地直接跳到整个文本框的最后面**，迫使用户必须手动把光标移回原来所在的位置才能继续输入。

## 3. 踩坑记录 (Failed Attempts)

为了获取和恢复正确的光标位置，我们尝试了以下多种方案，均宣告失败：

### ❌ 尝试 1：调用 CodeMirror 5 API
试图通过注入 JS 调用 `cm.getCursor()` 和 `cm.getDoc().replaceRange()` 来插入文本。
**失败原因**：报错 `cm.getDoc is not a function`。原因是 Anki 24+ 版本在底层彻底重写了编辑器，将底层的 CodeMirror 5 强行升级为了完全重构的 CodeMirror 6（使用不可变的 state tree 模型），旧版 API 全部失效。

### ❌ 尝试 2：调用 CodeMirror 6 API
试图读取 `cm.state.selection.main.head`，或者从 DOM 中获取 `EditorView`。
**失败原因**：通过遍历 JS 对象的 `Object.keys` 发现，Anki 官方提供给插件开发者的 `CodeMirror` 对象只是一个极度阉割的兼容层（Wrapper），里面只暴露了 `editor` 和 `setOption` 等极少数属性，真正的 CM6 `EditorView` 被深度隐藏。

### ❌ 尝试 3：使用 Shadow DOM 原生选区
试图绕过 CodeMirror，直接使用 `window.getSelection()` 或 `document.activeElement.shadowRoot` 获取光标的 Offset。
**失败原因**：Anki 24+ 的编辑器由于历史包袱和 Svelte 框架的引入，使用了极其复杂的嵌套 Shadow DOM 结构，外层的 `getSelection()` 根本穿透不进去，永远只能拿到错误的焦点或返回 `-1`。

### ❌ 尝试 4：依赖 Python 端重载 (loadNoteKeepingFocus)
原版代码在更新字段内容后，习惯调用 Python 端的 `context.loadNoteKeepingFocus()` 来刷新 UI。
**失败原因**：正是这个官方的刷新函数导致了光标跳动！该函数在重新加载笔记内容时，会粗暴地销毁并重建当前字段的富文本树，导致原生浏览器光标位置丢失，只能默认跳到末尾。

## 4. 终极完美解决方案：Token 替换与原生 API (The Ultimate Solution)

既然从外部获取光标位置这条路被 Anki 的黑盒封装彻底堵死，我们转变了思路：**放弃获取光标位置，让浏览器自己去处理插入动作。**

最终架构如下：

1. **JS 前端拦截 (editor.js)**：
   - 监听 WebView 的原生 `paste` 事件。
   - 发现是图片数据后，生成一个极其罕见的唯一标识符（例如 `[IMG_UPLOAD_xxxx]`）。
   - **核心魔法**：使用浏览器最原生的 `document.execCommand('insertText', false, token)` 命令。因为此时焦点仍在编辑器内，浏览器会自动在真正的光标处插入这个占位符 Token，完全不需要我们知道光标到底在哪！
   - 将图片的 Base64 数据通过 `pycmd` 发送给 Python 后端。

2. **Python 后端保存 (__init__.py)**：
   - 接收到 Base64 数据后，调用 Anki API 将其写入 `collection.media`。
   - 构造出最终的 Markdown 语法字符串 `![](filename.png)`。

3. **JS 前端收尾渲染**：
   - Python 不再调用会重置光标的 `loadNoteKeepingFocus()`。
   - 而是直接通过 `editor.web.eval()` 向 WebView 发送一段 JS 脚本，执行全局字符串替换：
     `document.body.innerHTML = document.body.innerHTML.replace("占位符Token", "Markdown图片语法");`
   - 替换完成后，浏览器的原生光标会非常自然地停留在图片语法之后，没有任何跳动！

## 5. 总结
在处理 Anki 24+ 版本复杂的富文本编辑器时，**永远不要试图去强行解析其内部的 Shadow DOM 结构或 CodeMirror 状态树**。合理利用浏览器原生的 DOM 操作 API（如 `execCommand` 和 DOM 树替换）进行“降维打击”，往往能获得最稳定、最原生级别的用户体验。

## 6. 全键盘流 Browser 导航优化 (Full Keyboard Navigation)

我们在 **Anki 26.05+** 版本的浏览器中，重构并实现了一套完全不依赖鼠标的“全键盘流”卡片与目录切换机制。用户可以通过方向键在左侧目录、中间卡片列表之间进行流畅的双轴导航。

### 6.1 核心需求与按键映射
1. **卡片列表焦点（默认）**：
   - 左右键 (`Left`/`Right`)：用来上下切换选中的卡片（即左右键替代原生的卡片上下选择）。
   - 上下键 (`Up`/`Down`)：将焦点瞬间转移至左侧目录树，并对准当前卡片所在的目录。
2. **侧边栏目录焦点**：
   - 上下键 (`Up`/`Down`)：用来上下移动目录树的选择。并且**移动时立即刷新卡片列表**（原版 Anki 仅移动高亮框，不更新卡片，必须手动敲回车）。
   - 左右键 (`Left`/`Right`)：焦点瞬间转移回中间的卡片列表，并换卡。
3. **免鼠标进入**：打开浏览器窗口时，不要聚焦在最上方的搜索框（防止方向键失效），必须自动聚焦到卡片列表，且在侧边栏高亮定位当前牌组。

### 6.2 技术难点与踩坑

#### ❌ 踩坑 1：Hook 触发时机太早导致组件为 `None`
初版使用 `gui_hooks.browser_menus_did_init` 挂载事件过滤器，由于该钩子在 UI 树建立之前执行，获取 `browser.sidebar` 和 `browser.table` 时均抛出 `AttributeError`，导致逻辑失效。
* **解决**：换用 **`gui_hooks.browser_will_show`**。此钩子触发时，所有 UI 控件已实例化完毕。

#### ❌ 踩坑 2：Anki 26+ 侧边栏为原生 Qt `SidebarTreeView`
部分旧文档声称 Anki 侧边栏是 Svelte 网页容器（需要通过 `.web` 获取 webview）。但在 Anki 26+ 版本中，`browser.sidebar` 属于原生的 `SidebarTreeView`（继承自 `QTreeView`），并无 `.web` 属性。
* **解决**：直接对 `browser.sidebar` 安装 Qt 事件过滤器并发送 Qt 键盘事件。

#### ❌ 踩坑 3：Qt 焦点切入重置 (Focus-in Reset)
在 Qt 的 `QTreeView` 机制中，当控件未获得焦点时调用 `setCurrentIndex()` 设定锚点，一旦随后调用 `setFocus()`，Qt 的 FocusIn 事件会将焦点行强制重置到默认的第一行（"已儲存的搜尋條件"），导致对齐失效。
* **解决**：**必须先调用 `sidebar.setFocus()` 获得焦点，再调用 `sidebar.setCurrentIndex()`** 设定高亮锚点。

#### ❌ 踩坑 4：死循环重定向 (Recursion Loop)
由于我们在“列表过滤器”中拦截 `Up/Down` 发送给“侧边栏”，在“侧边栏过滤器”中拦截 `Left/Right`（转换成 `Up/Down`）发送给“列表”，导致系统级按键重定向产生无线循环套娃，按任意键都会瞬间被吸回侧边栏。
* **解决**：引入全局原子锁 `_navigating`。在代码通过 `QApplication.sendEvent` 主动派发事件时设为 `True`，在事件过滤器入口处拦截：`if _navigating: return False` 允许原生放行。

### 6.3 最终的完美实现方案
1. **初始聚焦与牌组对齐**：
   在 `browser_will_show` 时开启一个 250ms 定时器，首先获取当前选中卡片的 `deck_name`，然后在侧边栏模型（`SidebarModel`）中进行深度树级递归搜索 `_find_deck_index` 找到对应的项，展开其所有父级目录，对其进行选中并调用 `scrollTo()` 滚动可见。最后将焦点切到卡片列表。
2. **列表与目录拦截器**：
   - **`_CardListNavFilter`** 拦截 `Left/Right` 转换成 `Up/Down` 发给自己；拦截 `Up/Down` 时，对准当前卡片牌组，聚焦侧边栏，再发送 `Up/Down` + `Return` 触发搜索。
   - **`_SidebarNavFilter`** 拦截 `Left/Right` 时切换回卡片列表并发送 key；拦截 `Up/Down` 时，先转发 key 移动选中行，紧接着在后台补发一个 `Return`（回车键）事件，从而自动触发 Anki 的搜索请求，联动刷新卡片列表。
3. **搜索栏自动脱离**：
   - 监听搜索栏 `lineEdit` 的 `KeyPress`。按 `Esc` 键直接聚焦到列表；按 `Enter` 键时，利用 100ms 延时定时器在执行完搜索后自动把焦点丢回卡片列表，无缝衔接全键盘流。

## 7. Browser 与 Add 界面一体化融合 (Browser-Add Integration)

我们在 **Anki 26.05+** 中将原生的“新增卡片 (Add Cards)”窗口直接合并到了“浏览 (Browser)”窗口的右侧编辑器中，打造单窗口沉浸式制卡体验。

### 7.1 核心机制与流程
1. **注入入口**：在卡片列表底部注入扁平化 `+ Add Note` 按钮。
2. **状态拦截**：点击 `+` 后启动 **Add Mode**，并解除中间列表的高亮锁定（卡片高亮仍保持，但不响应其更改）。
3. **按钮自适应**：在右侧编辑器底部（Tags 框下方）动态注入 `Save Note` 和 `Cancel` 按钮。按钮样式通过读取 `browser.mw.pm.night_mode()` 自动匹配亮/暗色模式。
4. **快捷保存与连击**：输入过程中按 `Ctrl+Enter` / `Cmd+Enter` 快速触发保存。保存后列表实时刷新展示新卡，且**编辑区自动刷新为下一个新的空白表单**，支持极速连续添加卡片。
5. **智能归属牌组**：向上追溯侧边栏选中的树形节点，自动将新卡分配到当前选中牌组（如 `Coding::Figma`），避免创建在错误分区。

### 7.2 致命踩坑与终极解决方案

#### ❌ 踩坑 1：`AttributeError: 'Table' object has no attribute 'layout'`
Anki 的 `browser.table` 是个自定义的数据逻辑类而非 Qt Widget，因此直接获取其布局会直接崩溃。
* **解决**：由于卡片列表树视图 `browser.table._view` 是真正的 `QTreeView` 控件，我们通过 `table_view.parentWidget().layout()` 成功拿到实际挂载表格的布局管理器，从而将 `+ Add Note` 按钮安全、完美地追加到了列表最下方。

#### ❌ 踩坑 2：弹窗警告 `No such note: '0'`
在 Anki 浏览器机制中，编辑器的加载是与数据库实时绑定的。当我们直接在内存中 `new_note` 并调用 `set_note()` 载入时，因为该 Note 还未持久化，Note ID 为 `0`。Anki 检测到 `0` 后会误以为是数据库存在坏账，直接弹窗阻断。
* **解决（数据库临时草稿机制）**：
  - **创建即入库**：点击 `+ Add Note` 时，先在数据库里执行 `mw.col.add_note()`，为其生成一个合法的数据库 ID（如 `1720849301`）。这样 `set_note` 时 ID 绝对合法，完美避开警告。
  - **撤销即销毁**：如果用户点击 `Cancel` 或鼠标**点击了列表中的其他已有卡片**（触发 note 切换），我们会通过 `gui_hooks.editor_did_load_note` 捕获到这一行为，在后台直接调用 `mw.col.remove_notes([temp_note.id])` 将这个临时空壳卡片从数据库中**完全抹除**，确保数据库干干净净，没有空白脏数据。
  - **保存即保留**：用户编辑后保存，由于它已经在数据库里，直接调用 `browser.search()` 更新界面并开启下一张卡即可。

#### ❌ 踩坑 3：`'Browser' object has no attribute 'onSearch'`
在 Anki 的 Browser 窗口对象中，执行重新搜索和刷新的方法名并不是 `onSearch`。
* **解决**：更正为使用原生方法 **`browser.search()`**，保证列表随动刷新 100% 正确。
