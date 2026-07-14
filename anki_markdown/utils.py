NOTETYPE = "MD"
NOTETYPE_CLOZE = "MD Cloze"

import re
import urllib.parse

MEDIA_REFS_RE = re.compile(r'\s*<div style="display:\s*none;" class="anki-md-media-refs">.*?</div>', re.DOTALL)

def is_anki_markdown(notetype) -> bool:
    """Check if a note type is any Anki Markdown Pro variant."""
    return notetype and notetype["name"] in (
        NOTETYPE, 
        NOTETYPE_CLOZE, 
        "Anki Markdown", 
        "Anki Markdown Cloze"
    )

def strip_media_refs(text: str) -> str:
    """Strip the hidden media references block from the field text."""
    if not text:
        return text
    return MEDIA_REFS_RE.sub("", text)

def convert_md_to_html_refs(text: str) -> str:
    """Convert standard markdown images/audio links to HTML tags for native Anki compatibility."""
    if not text:
        return text
        
    # Strip any old hidden media reference block from Option A tests
    cleaned = strip_media_refs(text)
    
    # 1. Convert markdown images: ![alt](image.png) or ![](image.png) to <img src="image.png">
    def replace_img(match):
        alt = match.group(1)
        src = urllib.parse.unquote(match.group(2).strip())
        if src.startswith(("http://", "https://", "data:")):
            return match.group(0)
        return f'<img src="{src}">'
        
    cleaned = re.sub(r'!\[(.*?)\]\(([^)]+)\)', replace_img, cleaned)
    
    # 2. Convert legacy [audio:sound.mp3] to <audio src="sound.mp3" class="anki-md-click-play"></audio>
    def replace_audio(match):
        src = match.group(1).strip()
        return f'<audio src="{src}" class="anki-md-click-play"></audio>'
        
    cleaned = re.sub(r'\[audio:([^\]]+)\]', replace_audio, cleaned)
    
    return cleaned
