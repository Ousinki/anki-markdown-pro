from aqt import mw, gui_hooks
from aqt.editor import Editor
from aqt.webview import WebContent
from .utils import is_anki_markdown

# 1MB limit for pasted images
_MAX_IMAGE_BYTES = 1024 * 1024

def on_webview_set_content(content: WebContent, context):
    """Inject editor JS/CSS."""
    if isinstance(context, Editor):
        addon = mw.addonManager.addonFromModule(__name__)
        
        # Inject a queue to handle race conditions where Python calls activate BEFORE JS is fully loaded
        content.head += """
        <script>
            window.__ankiMdQueue = window.__ankiMdQueue || [];
            if (!window.ankiMdActivate) {
                window.ankiMdActivate = function() { window.__ankiMdQueue.push('activate'); };
                window.ankiMdDeactivate = function() { window.__ankiMdQueue.push('deactivate'); };
            }
        </script>
        """
        
        content.js.append(f"/_addons/{addon}/web/editor.js")
        content.css.append(f"/_addons/{addon}/web/editor.css")
        
        _inject_paste_handler(context)

def _inject_paste_handler(editor: Editor):
    """Inject image paste handler directly into the editor WebView."""
    max_b64_len = int(_MAX_IMAGE_BYTES * 4 / 3) + 4  # base64 overhead
    js_code = r"""
    (function() {
        window.__ankiMdPasteActive = true;
        if (window.__ankiMdPasteInstalled) return;
        window.__ankiMdPasteInstalled = true;
        
        var MAX_B64_LEN = """ + str(max_b64_len) + r""";
        var ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif",
                             "image/webp", "image/svg+xml", "image/bmp"];
                             
        document.addEventListener("paste", function(e) {
            if (!window.__ankiMdPasteActive) return;
            
            var items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                if (item.kind === "file" && ALLOWED_TYPES.indexOf(item.type) !== -1) {
                    var blob = item.getAsFile();
                    if (!blob) continue;
                    
                    var reader = new FileReader();
                    reader.onload = function(evt) {
                        var b64 = evt.target.result;
                        if (b64.length > MAX_B64_LEN) {
                            pycmd("anki-md-toast:Image too large (max 1MB)");
                            return;
                        }
                        pycmd("anki-md-paste:" + b64);
                    };
                    reader.readAsDataURL(blob);
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return;
                }
            }
        }, true);
    })();
    """
    editor.web.eval(js_code)

def on_editor_load_note(editor: Editor):
    """Notify JS when Anki Markdown Pro note is loaded."""
    if not editor.note:
        return
        
    # Auto-exit Add Mode if user selects another note in Browser
    browser = getattr(editor, "parentWindow", None)
    if browser and getattr(browser, "_anki_md_add_mode", False):
        if editor.note != getattr(browser, "_anki_md_current_temp_note", None):
            from .browser import _exit_add_mode
            _exit_add_mode(browser, restore_selection=False, discard=True)
            # Refresh card list to remove the discarded note from search results
            try:
                browser.search()
            except Exception:
                pass
        
    is_md = is_anki_markdown(editor.note.note_type())
    editor.web.eval(f"window.__ankiMdPasteActive = {'true' if is_md else 'false'};")
    
    if is_md:
        editor.web.eval("window.ankiMdActivate && window.ankiMdActivate();")
    else:
        editor.web.eval("window.ankiMdDeactivate && window.ankiMdDeactivate();")

def on_paste_js_message(handled: tuple, message: str, context: object) -> tuple:
    """Handle image paste base64 data from JS."""
    from aqt import mw
    if not isinstance(context, Editor):
        return handled
        
    if message.startswith("anki-md-toast:"):
        import aqt.utils
        aqt.utils.tooltip(message[14:])
        return (True, None)
        
    if message.startswith("anki-md-play-sound:"):
        filename = message.replace("anki-md-play-sound:", "")
        from pathlib import Path
        filepath = Path(mw.col.media.dir()) / filename
        if filepath.exists():
            import aqt.sound
            aqt.sound.av_player.play_file(str(filepath))
        return (True, None)
        
        
    if message.startswith("anki-md-paste:"):
        b64_data = message[14:]
        try:
            import base64
            import time
            header, encoded = b64_data.split(",", 1)
            ext = header.split(";")[0].split("/")[1]
            if ext.startswith("svg"):
                ext = "svg"
            
            data = base64.b64decode(encoded)
            fname = f"paste-{int(time.time()*1000)}.{ext}"
            
            mw.col.media.write_data(fname, data)
            
            context.web.eval(f"document.execCommand('insertText', false, '![]({fname})');")
        except Exception as e:
            print("Error pasting image:", e)
        return (True, None)
        
    return handled

def register_editor_hooks():
    gui_hooks.webview_will_set_content.append(on_webview_set_content)
    gui_hooks.editor_did_load_note.append(on_editor_load_note)
    gui_hooks.webview_did_receive_js_message.append(on_paste_js_message)
