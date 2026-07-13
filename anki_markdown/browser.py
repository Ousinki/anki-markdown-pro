from aqt import gui_hooks
from aqt.qt import QObject, QEvent, Qt, QApplication, QKeyEvent

_active_browser = None

class _SidebarNavFilter(QObject):
    """Redirect Left/Right arrow keys from sidebar to the card-list table as Up/Down."""

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
    """Redirect Left/Right arrow keys on the card-list table to move Up/Down."""

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
            target_key = Qt.Key.Key_Up if key == Qt.Key.Key_Left else Qt.Key.Key_Down
            fwd = QKeyEvent(QEvent.Type.KeyPress, target_key, event.modifiers())
            QApplication.sendEvent(table_view, fwd)
            return True
        except Exception:
            return False

def _on_browser_open(browser):
    """Install key filters when Browser opens."""
    global _active_browser
    _active_browser = browser
    try:
        sidebar = browser.sidebar
        sidebar_filt = _SidebarNavFilter(browser)
        sidebar.installEventFilter(sidebar_filt)
        browser._anki_md_sidebar_filter = sidebar_filt  # prevent GC

        table_view = browser.table._view
        card_filt = _CardListNavFilter(browser)
        table_view.installEventFilter(card_filt)
        browser._anki_md_card_filter = card_filt  # prevent GC
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
            sidebar = browser.sidebar
            sidebar.setFocus()
            key = Qt.Key.Key_Up if direction == "up" else Qt.Key.Key_Down
            fwd = QKeyEvent(QEvent.Type.KeyPress, key, Qt.KeyboardModifier.NoModifier)
            QApplication.sendEvent(sidebar, fwd)
    except Exception:
        pass

    return (True, None)

def register_browser_hooks():
    gui_hooks.browser_menus_did_init.append(_on_browser_open)
    gui_hooks.webview_did_receive_js_message.append(_on_nav_message)
