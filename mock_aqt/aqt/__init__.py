mw = type('MW', (), {'addonManager': type('AM', (), {'addonFromModule': lambda m: m.split('.')[0]})})()
gui_hooks = type('GH', (), {'profile_did_open': [], 'editor_will_munge_html': [], 'webview_will_set_content': [], 'editor_did_load_note': [], 'webview_did_receive_js_message': [], 'browser_menus_did_init': [], 'browser_will_show': []})()
