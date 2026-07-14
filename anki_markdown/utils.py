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

def append_media_refs(text: str) -> str:
    """Parse media files from markdown and append a hidden HTML block for Anki's media check."""
    if not text:
        return text
        
    cleaned = strip_media_refs(text)
    
    # Extract references
    files = []
    
    # 1. Markdown images & links to local files: ![](filename.png) or [file](filename.pdf)
    # This matches both image links and regular links. We filter out web URLs and ensure it references a file.
    for match in re.findall(r'\[.*?\]\(([^)]+)\)', cleaned):
        decoded = urllib.parse.unquote(match.strip())
        if not decoded.startswith(("http://", "https://", "data:", "#")):
            # Ensure it looks like a filename (contains a dot for file extension)
            filename = decoded.split("/")[-1]
            if "." in filename:
                files.append(decoded)
            
    # 2. Audio tags: [audio:filename] or [sound:filename]
    for match in re.findall(r'\[(?:sound|audio):([^\]]+)\]', cleaned):
        files.append(match.strip())
        
    if not files:
        return cleaned
        
    # Remove duplicates preserving order
    seen = set()
    unique_files = [x for x in files if x and not (x in seen or seen.add(x))]
    
    if not unique_files:
        return cleaned
        
    # Generate hidden HTML block
    html_parts = []
    for f in unique_files:
        html_parts.append(f'<img src="{f}">')
        
    refs_block = f'\n\n<div style="display: none;" class="anki-md-media-refs">{"".join(html_parts)}</div>'
    return cleaned + refs_block
