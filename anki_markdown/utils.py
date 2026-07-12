NOTETYPE = "MD"
NOTETYPE_CLOZE = "MD Cloze"

def is_anki_markdown(notetype) -> bool:
    """Check if a note type is any Anki Markdown Pro variant."""
    return notetype and notetype["name"] in (
        NOTETYPE, 
        NOTETYPE_CLOZE, 
        "Anki Markdown", 
        "Anki Markdown Cloze"
    )
