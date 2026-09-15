"""Check the fictional browser-generated long invoice with Poppler, not OCR."""
import base64
import json
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET

output = Path("invoice-review-evidence")
pdf = output / "invoice-40-lines.pdf"
assert pdf.is_file(), "The browser did not create the invoice PDF"
text = subprocess.check_output(["pdftotext", "-layout", str(pdf), "-"], text=True)
items = [int(value) for value in re.findall(r"Review service\s+(\d+)\b", text)]
assert sorted(items) == list(range(1, 41)), "Missing, repeated or clipped invoice lines"
assert "Fictional payment note for print regression." in text
assert "Thank you for your business." in text
assert "Save draft" not in text and "Draft options" not in text, "Editor controls printed"
pages = [page for page in text.split("\f") if page.strip()]
assert 2 <= len(pages) <= 8, "Unexpected long-invoice pagination"
assert "Total due" in pages[-1], "Closing totals were separated from notes/footer"
xml = subprocess.check_output(["pdftotext", "-bbox", str(pdf), "-"], text=True)
root = ET.fromstring(xml)
for page in root.iter("{http://www.w3.org/1999/xhtml}page"):
    width, height = float(page.attrib["width"]), float(page.attrib["height"])
    for word in page.iter("{http://www.w3.org/1999/xhtml}word"):
        assert 0 <= float(word.attrib["xMin"]) <= float(word.attrib["xMax"]) <= width
        assert 0 <= float(word.attrib["yMin"]) <= float(word.attrib["yMax"]) <= height
for number in [1, len(pages)]:
    prefix = output / f"pdf-page-{number}"
    subprocess.run(["pdftoppm", "-f", str(number), "-l", str(number), "-singlefile",
                    "-jpeg", "-jpegopt", "quality=30", "-scale-to", "600",
                    str(pdf), str(prefix)], check=True, capture_output=True)
    print(f"PDF_REVIEW_IMAGE_{number} " + base64.b64encode(prefix.with_suffix(".jpg").read_bytes()).decode())
report = {"pages": len(pages), "itemRows": len(items), "textBounds": "passed", "closingGroup": "passed"}
(output / "pdf-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print("PDF_REVIEW_RESULT " + json.dumps(report))
