from aqt import gui_hooks
from aqt.qt import QObject, QEvent, Qt, QApplication, QKeyEvent, QModelIndex, QItemSelectionModel, QPushButton, QWidget, QHBoxLayout, QVBoxLayout, QKeySequence, QShortcut

_active_browser = None
_navigating = False

def _send_fwd_key(widget, key, modifiers=Qt.KeyboardModifier.NoModifier):
    global _navigating
    _navigating = True
    try:
        fwd = QKeyEvent(QEvent.Type.KeyPress, key, modifiers)
        QApplication.sendEvent(widget, fwd)
    finally:
        _navigating = False

def _find_deck_index(model, parent_index, target_deck_name, current_path=""):
    for row in range(model.rowCount(parent_index)):
        index = model.index(row, 0, parent_index)
        name = index.data()
        
        # Determine node path
        if not parent_index.isValid():
            # Root categories ("牌組", "今天", etc.)
            node_path = ""
        elif not parent_index.parent().isValid():
            # Top-level decks under categories (e.g., "Coding")
            node_path = name
        else:
            # Subdecks (e.g., "Figma")
            node_path = f"{current_path}::{name}" if current_path else name
            
        if node_path == target_deck_name:
            return index
            
        # Recurse into children
        child_index = _find_deck_index(model, index, target_deck_name, node_path)
        if child_index.isValid():
            return child_index
            
    return QModelIndex()

class _SearchEditFilter(QObject):
    """Redirect Escape/Enter keys from search box to the card-list table."""

    def __init__(self, browser):
        super().__init__(browser)
        self._browser = browser

    def eventFilter(self, obj, event):
        if event.type() != QEvent.Type.KeyPress:
            return False
        key = event.key()
        if key in (Qt.Key.Key_Escape, Qt.Key.Key_Return, Qt.Key.Key_Enter):
            try:
                table_view = self._browser.table._view
                if key in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
                    from aqt.qt import QTimer
                    QTimer.singleShot(100, lambda: table_view.setFocus())
                    return False
                else:
                    table_view.setFocus()
                    return True
            except Exception:
                pass
        return False

class _SidebarNavFilter(QObject):
    """Redirect Left/Right arrow keys from sidebar to the card-list table as Up/Down."""

    def __init__(self, browser):
        super().__init__(browser)
        self._browser = browser

    def eventFilter(self, obj, event):
        global _navigating
        if _navigating:
            return False
        if event.type() != QEvent.Type.KeyPress:
            return False
        key = event.key()
        
        # Left/Right -> Focus card list and move card selection
        if key in (Qt.Key.Key_Left, Qt.Key.Key_Right):
            try:
                table_view = self._browser.table._view
                table_view.setFocus()
                target_key = Qt.Key.Key_Up if key == Qt.Key.Key_Left else Qt.Key.Key_Down
                _send_fwd_key(table_view, target_key, event.modifiers())
                return True
            except Exception:
                return False
                
        # Up/Down -> Move sidebar selection and auto-activate (Enter)
        elif key in (Qt.Key.Key_Up, Qt.Key.Key_Down):
            try:
                sidebar = self._browser.sidebar
                _send_fwd_key(sidebar, key, event.modifiers())
                _send_fwd_key(sidebar, Qt.Key.Key_Return)
                return True
            except Exception:
                pass
                
        return False

class _CardListNavFilter(QObject):
    """Redirect keys on card-list: Left/Right to change cards, Up/Down to change sidebar decks."""

    def __init__(self, browser):
        super().__init__(browser)
        self._browser = browser

    def eventFilter(self, obj, event):
        global _navigating
        if _navigating:
            return False
        if event.type() != QEvent.Type.KeyPress:
            return False
        key = event.key()
        
        # Left/Right -> Move card selection
        if key in (Qt.Key.Key_Left, Qt.Key.Key_Right):
            try:
                table_view = self._browser.table._view
                target_key = Qt.Key.Key_Up if key == Qt.Key.Key_Left else Qt.Key.Key_Down
                _send_fwd_key(table_view, target_key, event.modifiers())
                return True
            except Exception:
                pass
        
        # Up/Down -> Move sidebar deck selection
        elif key in (Qt.Key.Key_Up, Qt.Key.Key_Down):
            try:
                sidebar = self._browser.sidebar
                model = sidebar.model()
                
                # Try to locate the index of the currently selected card's deck
                target_idx = QModelIndex()
                card_ids = self._browser.selected_cards()
                if card_ids:
                    try:
                        card = self._browser.mw.col.get_card(card_ids[0])
                        deck_name = self._browser.mw.col.decks.name(card.did)
                        target_idx = _find_deck_index(model, QModelIndex(), deck_name)
                    except Exception:
                        pass
                
                # Fallback to current selection if target_idx is invalid
                if not target_idx.isValid():
                    sel = sidebar.selectionModel().selectedIndexes()
                    if sel:
                        target_idx = sel[0]
                
                # Expand parents to make the index visible
                if target_idx.isValid():
                    parent = target_idx.parent()
                    while parent.isValid():
                        sidebar.expand(parent)
                        parent = parent.parent()
                
                # Focus first to prevent Qt from resetting current index on focus-in
                sidebar.setFocus()
                
                if target_idx.isValid():
                    sidebar.setCurrentIndex(target_idx)
                    sidebar.selectionModel().select(target_idx, QItemSelectionModel.SelectionFlag.ClearAndSelect)
                
                # Send the Up/Down key
                _send_fwd_key(sidebar, key, event.modifiers())
                
                # Send Return/Enter to trigger Anki's native search update
                _send_fwd_key(sidebar, Qt.Key.Key_Return)
                
                return True
            except Exception as e:
                import traceback
                try:
                    with open("/Users/ousin/Projects/AnkiMarkdownPro/debug.log", "a") as f:
                        f.write(f"Exception in card list Up/Down: {traceback.format_exc()}\n")
                except Exception:
                    pass
                
        return False

def _get_note_type_model(mw):
    for m in mw.col.models.all():
        if "MD" in m["name"] or "Markdown" in m["name"]:
            return m
    return mw.col.models.current()

def _get_active_deck_id(browser):
    try:
        sidebar = browser.sidebar
        sel = sidebar.selectionModel().selectedIndexes()
        if sel:
            parts = []
            idx = sel[0]
            while idx.isValid() and idx.parent().isValid():
                parts.insert(0, idx.data())
                idx = idx.parent()
            if parts:
                full_name = "::".join(parts)
                did = browser.mw.col.decks.id_for_name(full_name)
                if did:
                    return did
    except Exception:
        pass
    return browser.mw.col.decks.current_id()

def _enter_add_mode(browser):
    browser._anki_md_add_mode = True
    
    # Resolve note type model and active deck
    model = _get_note_type_model(browser.mw)
    deck_id = _get_active_deck_id(browser)
    
    # Instantiate note and add it to database immediately so it has a valid database ID
    note = browser.mw.col.new_note(model)
    try:
        browser.mw.col.add_note(note, deck_id)
    except Exception as e:
        from aqt.utils import tooltip
        tooltip(f"Failed to initialize note: {e}")
        browser._anki_md_add_mode = False
        return
        
    browser._anki_md_current_temp_note = note
    browser.editor.set_note(note)
    
    try:
        browser.editor.widget.show()
    except Exception:
        pass
        
    try:
        browser.editor.focus_field(0)
    except Exception:
        pass
        
    if hasattr(browser, "_anki_md_add_buttons"):
        browser._anki_md_add_buttons.show()

def _save_new_note(browser):
    note = getattr(browser, "_anki_md_current_temp_note", None)
    if not note:
        return
        
    from aqt.utils import tooltip
    
    def on_saved():
        if all(not f.strip() for f in note.fields):
            tooltip("Cannot save empty note.")
            return
            
        try:
            tooltip("Note saved successfully.")
            browser.search()
            _exit_add_mode(browser, restore_selection=False, discard=False)
            _enter_add_mode(browser)
        except Exception as e:
            tooltip(f"Failed to save note: {e}")
            
    browser.editor.saveNow(on_saved)

def _exit_add_mode(browser, restore_selection=True, discard=True):
    browser._anki_md_add_mode = False
    temp_note = getattr(browser, "_anki_md_current_temp_note", None)
    browser._anki_md_current_temp_note = None
    
    if hasattr(browser, "_anki_md_add_buttons"):
        browser._anki_md_add_buttons.hide()
        
    if restore_selection:
        card_ids = browser.selected_cards()
        if card_ids:
            try:
                card = browser.mw.col.get_card(card_ids[0])
                browser.editor.set_note(card.note())
            except Exception:
                pass
                
    if discard and temp_note:
        try:
            browser.mw.col.remove_notes([temp_note.id])
        except Exception:
            pass

def _on_save_shortcut_triggered(browser):
    if getattr(browser, "_anki_md_add_mode", False):
        _save_new_note(browser)

def _on_browser_open(browser):
    """Install key filters on correct widgets when Browser opens and shift focus to card list."""
    global _active_browser
    _active_browser = browser
    
    # Initialize add mode state
    if not hasattr(browser, "_anki_md_add_mode"):
        browser._anki_md_add_mode = False
        browser._anki_md_current_temp_note = None
    
    # Trace log file creation
    try:
        with open("/Users/ousin/Projects/AnkiMarkdownPro/debug.log", "w") as f:
            f.write("_on_browser_open started\n")
    except Exception:
        pass

    try:
        # 1. Search box filter
        search_edit = browser.form.searchEdit.lineEdit()
        search_filt = _SearchEditFilter(browser)
        search_edit.installEventFilter(search_filt)
        browser._anki_md_search_filter = search_filt

        # 2. Sidebar filter (target the native tree view)
        sidebar = browser.sidebar
        sidebar_filt = _SidebarNavFilter(browser)
        sidebar.installEventFilter(sidebar_filt)
        browser._anki_md_sidebar_filter = sidebar_filt

        # 3. Card list filter
        table_view = browser.table._view
        card_filt = _CardListNavFilter(browser)
        table_view.installEventFilter(card_filt)
        browser._anki_md_card_filter = card_filt

        try:
            with open("/Users/ousin/Projects/AnkiMarkdownPro/debug.log", "a") as f:
                f.write("Filters installed successfully\n")
        except Exception:
            pass

        # 4. Programmatically shift initial focus from search box to card list
        # and pre-select the current card's deck in the sidebar
        from aqt.qt import QTimer
        def init_focus():
            try:
                try:
                    with open("/Users/ousin/Projects/AnkiMarkdownPro/debug.log", "a") as f:
                        f.write("init_focus callback started\n")
                except Exception:
                    pass
                
                table_view = browser.table._view
                table_view.setFocus()
                
                card_ids = browser.selected_cards()
                try:
                    with open("/Users/ousin/Projects/AnkiMarkdownPro/debug.log", "a") as f:
                        f.write(f"selected_cards count: {len(card_ids)}\n")
                except Exception:
                    pass
                
                if card_ids:
                    sidebar = browser.sidebar
                    model = sidebar.model()
                    card = browser.mw.col.get_card(card_ids[0])
                    deck_name = browser.mw.col.decks.name(card.did)
                    
                    try:
                        with open("/Users/ousin/Projects/AnkiMarkdownPro/debug.log", "a") as f:
                            f.write(f"deck_name: {deck_name}\n")
                    except Exception:
                        pass
                        
                    target_idx = _find_deck_index(model, QModelIndex(), deck_name)
                    
                    try:
                        with open("/Users/ousin/Projects/AnkiMarkdownPro/debug.log", "a") as f:
                            f.write(f"target_idx valid: {target_idx.isValid()}\n")
                    except Exception:
                        pass
                        
                    if target_idx.isValid():
                        # Expand parents to make it visible in the tree
                        parent = target_idx.parent()
                        while parent.isValid():
                            sidebar.expand(parent)
                            parent = parent.parent()
                        
                        sidebar.setCurrentIndex(target_idx)
                        sidebar.selectionModel().select(target_idx, QItemSelectionModel.SelectionFlag.ClearAndSelect)
                        sidebar.scrollTo(target_idx)
                        
                        try:
                            with open("/Users/ousin/Projects/AnkiMarkdownPro/debug.log", "a") as f:
                                f.write("Sidebar index set and scrolled\n")
                        except Exception:
                            pass
            except Exception as e:
                import traceback
                try:
                    with open("/Users/ousin/Projects/AnkiMarkdownPro/debug.log", "a") as f:
                        f.write(f"Exception in init_focus: {traceback.format_exc()}\n")
                except Exception:
                    pass

        QTimer.singleShot(250, init_focus)

        # 5. Inject "+ Add Note" button below the card list
        if not hasattr(browser, "_anki_md_add_btn"):
            add_btn = QPushButton("+ Add Note")
            is_night = browser.mw.pm.night_mode()
            if is_night:
                add_btn.setStyleSheet("""
                    QPushButton {
                        background-color: #2b2b2b;
                        color: #ffffff;
                        border: 1px solid #3c3f41;
                        border-radius: 4px;
                        padding: 6px;
                        font-weight: bold;
                    }
                    QPushButton:hover {
                        background-color: #353535;
                    }
                    QPushButton:pressed {
                        background-color: #202020;
                    }
                """)
            else:
                add_btn.setStyleSheet("""
                    QPushButton {
                        background-color: #f3f4f6;
                        color: #1f2937;
                        border: 1px solid #d1d5db;
                        border-radius: 4px;
                        padding: 6px;
                        font-weight: bold;
                    }
                    QPushButton:hover {
                        background-color: #e5e7eb;
                    }
                    QPushButton:pressed {
                        background-color: #d1d5db;
                    }
                """)
            add_btn.clicked.connect(lambda: _enter_add_mode(browser))
            
            # Find the parent widget of table_view to add button at the bottom of the table area layout
            table_parent = table_view.parentWidget()
            if table_parent and table_parent.layout():
                table_parent.layout().addWidget(add_btn)
                browser._anki_md_add_btn = add_btn
                try:
                    with open("/Users/ousin/Projects/AnkiMarkdownPro/debug.log", "a") as f:
                        f.write("Add button injected below card list\n")
                except Exception:
                    pass
            else:
                try:
                    with open("/Users/ousin/Projects/AnkiMarkdownPro/debug.log", "a") as f:
                        f.write("Failed to find table parent layout\n")
                except Exception:
                    pass

        # 6. Inject Save/Cancel buttons at the bottom of the editor
        if not hasattr(browser, "_anki_md_add_buttons"):
            from aqt.qt import QWidget, QHBoxLayout
            btn_widget = QWidget()
            btn_layout = QHBoxLayout(btn_widget)
            btn_layout.setContentsMargins(10, 5, 10, 5)
            
            save_btn = QPushButton("Save Note")
            cancel_btn = QPushButton("Cancel")
            
            is_night = browser.mw.pm.night_mode()
            if is_night:
                save_btn.setStyleSheet("""
                    QPushButton {
                        background-color: #318aff;
                        color: #ffffff;
                        border: 1px solid #1a5bb8;
                        border-radius: 5px;
                        padding: 8px 16px;
                        font-size: 13px;
                        font-weight: bold;
                    }
                    QPushButton:hover {
                        background-color: #4c9aff;
                    }
                    QPushButton:pressed {
                        background-color: #1a5bb8;
                    }
                """)
                cancel_btn.setStyleSheet("""
                    QPushButton {
                        background-color: #3c3c3c;
                        color: #dcdcdc;
                        border: 1px solid #555555;
                        border-radius: 5px;
                        padding: 8px 16px;
                        font-size: 13px;
                    }
                    QPushButton:hover {
                        background-color: #4e4e4e;
                    }
                    QPushButton:pressed {
                        background-color: #2b2b2b;
                    }
                """)
            else:
                save_btn.setStyleSheet("""
                    QPushButton {
                        background-color: #2563eb;
                        color: #ffffff;
                        border: 1px solid #1d4ed8;
                        border-radius: 5px;
                        padding: 8px 16px;
                        font-size: 13px;
                        font-weight: bold;
                    }
                    QPushButton:hover {
                        background-color: #3b82f6;
                    }
                    QPushButton:pressed {
                        background-color: #1d4ed8;
                    }
                """)
                cancel_btn.setStyleSheet("""
                    QPushButton {
                        background-color: #f3f4f6;
                        color: #1f2937;
                        border: 1px solid #d1d5db;
                        border-radius: 5px;
                        padding: 8px 16px;
                        font-size: 13px;
                    }
                    QPushButton:hover {
                        background-color: #e5e7eb;
                    }
                    QPushButton:pressed {
                        background-color: #d1d5db;
                    }
                """)
            
            btn_layout.addWidget(save_btn)
            btn_layout.addWidget(cancel_btn)
            btn_widget.hide()
            
            editor_widget = browser.editor.widget
            if editor_widget and editor_widget.layout():
                editor_widget.layout().addWidget(btn_widget)
                browser._anki_md_add_buttons = btn_widget
                browser._anki_md_save_btn = save_btn
                browser._anki_md_cancel_btn = cancel_btn
                
                save_btn.clicked.connect(lambda: _save_new_note(browser))
                cancel_btn.clicked.connect(lambda: _exit_add_mode(browser))
                try:
                    with open("/Users/ousin/Projects/AnkiMarkdownPro/debug.log", "a") as f:
                        f.write("Save/Cancel buttons injected in editor layout\n")
                except Exception:
                    pass
            else:
                try:
                    with open("/Users/ousin/Projects/AnkiMarkdownPro/debug.log", "a") as f:
                        f.write("Failed to find editor widget layout\n")
                except Exception:
                    pass

        # 7. Setup shortcuts for Ctrl+Enter / Cmd+Enter
        if not hasattr(browser, "_anki_md_save_shortcut"):
            from aqt.qt import QShortcut, QKeySequence
            shortcut = QShortcut(QKeySequence("Ctrl+Return"), browser)
            shortcut.activated.connect(lambda: _on_save_shortcut_triggered(browser))
            browser._anki_md_save_shortcut = shortcut
            
            shortcut_mac = QShortcut(QKeySequence("Meta+Return"), browser)
            shortcut_mac.activated.connect(lambda: _on_save_shortcut_triggered(browser))
            browser._anki_md_save_shortcut_mac = shortcut_mac

    except Exception as e:
        import traceback
        try:
            with open("/Users/ousin/Projects/AnkiMarkdownPro/debug.log", "a") as f:
                f.write(f"Exception in _on_browser_open: {traceback.format_exc()}\n")
        except Exception:
            pass

def _on_nav_message(handled, message: str, context) -> tuple:
    """Handle navigation pycmds from editor webview."""
    if not message.startswith("anki-md-nav:"):
        return handled

    direction = message.split(":")[1]
    browser = _active_browser
    if not browser:
        return (True, None)

    try:
        if direction in ("left", "right"):
            table_view = browser.table._view
            table_view.setFocus()
            key = Qt.Key.Key_Up if direction == "left" else Qt.Key.Key_Down
            _send_fwd_key(table_view, key)
        elif direction in ("up", "down"):
            sidebar = browser.sidebar
            sel = sidebar.selectionModel().selectedIndexes()
            sidebar.setFocus()
            if sel:
                sidebar.setCurrentIndex(sel[0])
            key = Qt.Key.Key_Up if direction == "up" else Qt.Key.Key_Down
            _send_fwd_key(sidebar, key)
            _send_fwd_key(sidebar, Qt.Key.Key_Return)
    except Exception:
        pass

    return (True, None)

def register_browser_hooks():
    gui_hooks.browser_will_show.append(_on_browser_open)
    gui_hooks.webview_did_receive_js_message.append(_on_nav_message)
