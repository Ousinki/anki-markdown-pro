from aqt import gui_hooks
from aqt.qt import QObject, QEvent, Qt, QApplication, QKeyEvent

_active_browser = None

class _SidebarNavFilter(QObject):
    """Redirect Up/Down arrow keys from sidebar to the card-list table."""

    def __init__(self, browser):
        super().__init__(browser)
        self._browser = browser

    def eventFilter(self, obj, event):
        if event.type() != QEvent.Type.KeyPress:
            return False
        key = event.key()
        if key not in (Qt.Key.Key_Up, Qt.Key.Key_Down):
            return False
        try:
            table_view = self._browser.table._view
            table_view.setFocus()
            fwd = QKeyEvent(QEvent.Type.KeyPress, key, event.modifiers())
            QApplication.sendEvent(table_view, fwd)
            return True
        except Exception:
            return False

def _on_browser_open(browser):
    """Install sidebar key filter when Browser opens."""
    global _active_browser
    _active_browser = browser
    try:
        sidebar = browser.sidebar
        filt = _SidebarNavFilter(browser)
        sidebar.installEventFilter(filt)
        browser._anki_md_nav_filter = filt  # prevent GC
    except Exception:
        pass

def _on_nav_message(handled, message: str, context) -> tuple:
    """Handle arrow-key navigation pycmd from editor webview."""
    if not message.startswith("anki-md-nav:"):
        return handled

    direction = message.split(":")[1]
    browser = _active_browser
    if not browser:
        return (True, None)

    try:
        table_view = browser.table._view
        index = table_view.currentIndex()
        model = table_view.model()

        if direction == "up" and index.row() > 0:
            new_idx = model.index(index.row() - 1, index.column())
            table_view.setCurrentIndex(new_idx)
        elif direction == "down" and index.row() < model.rowCount() - 1:
            new_idx = model.index(index.row() + 1, index.column())
            table_view.setCurrentIndex(new_idx)
    except Exception:
        pass

    return (True, None)

def register_browser_hooks():
    gui_hooks.browser_menus_did_init.append(_on_browser_open)
    gui_hooks.webview_did_receive_js_message.append(_on_nav_message)
