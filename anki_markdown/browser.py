from aqt import gui_hooks
from aqt.qt import QObject, QEvent, Qt, QApplication, QKeyEvent

_active_browser = None

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
    """Redirect Left/Right arrow keys from sidebar webview to the card-list table as Up/Down."""

    def __init__(self, browser):
        super().__init__(browser)
        self._browser = browser

    def eventFilter(self, obj, event):
        if event.type() != QEvent.Type.KeyPress:
            return False
        key = event.key()
        if key not in (Qt.Key.Key_Left, Qt.Key.Key_Right):
            return False
        try:
            table_view = self._browser.table._view
            table_view.setFocus()
            target_key = Qt.Key.Key_Up if key == Qt.Key.Key_Left else Qt.Key.Key_Down
            fwd = QKeyEvent(QEvent.Type.KeyPress, target_key, event.modifiers())
            QApplication.sendEvent(table_view, fwd)
            return True
        except Exception:
            return False

class _CardListNavFilter(QObject):
    """Redirect keys on card-list: Left/Right to change cards, Up/Down to change sidebar decks."""

    def __init__(self, browser):
        super().__init__(browser)
        self._browser = browser

    def eventFilter(self, obj, event):
        if event.type() != QEvent.Type.KeyPress:
            return False
        key = event.key()
        
        # Left/Right -> Move card selection
        if key in (Qt.Key.Key_Left, Qt.Key.Key_Right):
            try:
                table_view = self._browser.table._view
                target_key = Qt.Key.Key_Up if key == Qt.Key.Key_Left else Qt.Key.Key_Down
                fwd = QKeyEvent(QEvent.Type.KeyPress, target_key, event.modifiers())
                QApplication.sendEvent(table_view, fwd)
                return True
            except Exception:
                pass
        
        # Up/Down -> Move sidebar deck selection
        elif key in (Qt.Key.Key_Up, Qt.Key.Key_Down):
            try:
                sidebar_web = self._browser.sidebar.web
                sidebar_web.setFocus()
                fwd = QKeyEvent(QEvent.Type.KeyPress, key, event.modifiers())
                QApplication.sendEvent(sidebar_web, fwd)
                return True
            except Exception:
                pass
                
        return False

def _on_browser_open(browser):
    """Install key filters on correct widgets when Browser opens."""
    global _active_browser
    _active_browser = browser
    try:
        # 1. Search box filter
        search_edit = browser.form.searchEdit.lineEdit()
        search_filt = _SearchEditFilter(browser)
        search_edit.installEventFilter(search_filt)
        browser._anki_md_search_filter = search_filt

        # 2. Sidebar filter (target the internal web view)
        sidebar_web = browser.sidebar.web
        sidebar_filt = _SidebarNavFilter(browser)
        sidebar_web.installEventFilter(sidebar_filt)
        browser._anki_md_sidebar_filter = sidebar_filt

        # 3. Card list filter
        table_view = browser.table._view
        card_filt = _CardListNavFilter(browser)
        table_view.installEventFilter(card_filt)
        browser._anki_md_card_filter = card_filt
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
            fwd = QKeyEvent(QEvent.Type.KeyPress, key, Qt.KeyboardModifier.NoModifier)
            QApplication.sendEvent(table_view, fwd)
        elif direction in ("up", "down"):
            sidebar_web = browser.sidebar.web
            sidebar_web.setFocus()
            key = Qt.Key.Key_Up if direction == "up" else Qt.Key.Key_Down
            fwd = QKeyEvent(QEvent.Type.KeyPress, key, Qt.KeyboardModifier.NoModifier)
            QApplication.sendEvent(sidebar_web, fwd)
    except Exception:
        pass

    return (True, None)

def register_browser_hooks():
    gui_hooks.browser_menus_did_init.append(_on_browser_open)
    gui_hooks.webview_did_receive_js_message.append(_on_nav_message)
