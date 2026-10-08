# Branch-only integration, removed before promotion. Fail closed on corruption.
import base64, gzip, hashlib, subprocess
from pathlib import Path
encoded = ''.join(Path(f'scripts/nova-surface-patch-{i}.b64').read_text().strip() for i in range(4))
patch = gzip.decompress(base64.b64decode(encoded, validate=True))
assert hashlib.sha256(patch).hexdigest() == '03b63edad6508eb3f3dedf32ae95fb19e966bffcfaf622c45e2299f31a320ad8'
subprocess.run(['git', 'apply', '--check', '-'], input=patch, check=True)
subprocess.run(['git', 'apply', '-'], input=patch, check=True)
