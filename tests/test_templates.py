from html.parser import HTMLParser
from pathlib import Path

import pytest

ROOT = Path(__file__).parent.parent
SAMPLE = """1. 短期
   - NAT
   - L4, L7 反向代理
1. 中/长期
   - 逐步重新规划 IP"""


class Scripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.out = {}
        self.key = None

    def handle_starttag(self, tag, attrs):
        vals = dict(attrs)
        if tag == "script" and vals.get("type") == "text/plain":
            self.key = vals.get("id")
            self.out[self.key] = []

    def handle_data(self, data):
        if self.key:
            self.out[self.key].append(data)

    def handle_endtag(self, tag):
        if tag == "script":
            self.key = None


def read(file, vals):
    text = (ROOT / "anki_markdown" / "templates" / file).read_text(encoding="utf-8")
    for raw, val in vals.items():
        text = text.replace(raw, val)
    parser = Scripts()
    parser.feed(text)
    return {key: "".join(val) for key, val in parser.out.items()}


@pytest.mark.parametrize(
    ("file", "vals", "keys"),
    [
        ("front.html", {"{{Front}}": SAMPLE, "{{Back}}": SAMPLE}, ("data-front", "data-back")),
        ("back.html", {"{{Front}}": SAMPLE, "{{Back}}": SAMPLE}, ("data-front", "data-back")),
        ("cloze-front.html", {"{{Text}}": SAMPLE, "{{Extra}}": SAMPLE}, ("data-text", "data-extra")),
        ("cloze-back.html", {"{{Text}}": SAMPLE, "{{Extra}}": SAMPLE}, ("data-text", "data-extra")),
    ],
)
def test_field_scripts_keep_raw_text(file, vals, keys):
    out = read(file, vals)

    for key in keys:
        assert out[key] == SAMPLE
