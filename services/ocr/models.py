"""Download public model weights during setup only. Never accepts document input."""
from pathlib import Path
import os
import hashlib
import json
import tarfile
import urllib.request
import socket
socket.setdefaulttimeout(120)

ROOT = Path(os.environ.get('OCR_MODEL_DIR', str(Path(os.environ.get('LOCALAPPDATA', str(Path.home() / '.cache'))) / 'WarrantyVault' / 'ocr-models')))
NAMES = ('PP-OCRv5_mobile_det', 'arabic_PP-OCRv5_mobile_rec')

def download():
    ROOT.mkdir(parents=True, exist_ok=True)
    checksums = {}
    for name in NAMES:
        target = ROOT / name
        if all((target / filename).exists() for filename in ('inference.json', 'inference.pdiparams', 'inference.yml')):
            print(f'{name}: already installed')
            continue
        url = f'https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/{name}_infer.tar'
        archive = ROOT / f'{name}.tar'
        print(f'Downloading public model: {name}', flush=True)
        # Resume interrupted setup downloads; model host can be slow on local links.
        offset = archive.stat().st_size if archive.exists() else 0
        request = urllib.request.Request(url, headers={'Range': f'bytes={offset}-'} if offset else {})
        try:
            response = urllib.request.urlopen(request)
        except urllib.error.HTTPError as error:
            if error.code != 416:
                raise
            response = None  # Existing archive may already be complete; tar validation follows.
        if response is not None:
            with response:
                append = offset > 0 and response.status == 206
                expected = int(response.headers.get('Content-Length', 0))
                received = 0
                with archive.open('ab' if append else 'wb') as output:
                    while chunk := response.read(65536):
                        received += len(chunk)
                        output.write(chunk)
                if expected and received != expected:
                    raise RuntimeError('Model download interrupted. Run setup again to resume.')
        checksums[name] = hashlib.sha256(archive.read_bytes()).hexdigest()
        target.mkdir(exist_ok=True)
        with tarfile.open(archive) as tar:
            # Copy regular files only; ignore archive paths and links.
            for member in tar.getmembers():
                if member.isfile() and Path(member.name).name in ('inference.json', 'inference.pdiparams', 'inference.yml'):
                    with tar.extractfile(member) as source:
                        (target / Path(member.name).name).write_bytes(source.read())
        if not (target / 'inference.json').exists():
            raise RuntimeError(f'Incomplete model: {name}')
        archive.unlink()
    if checksums:
        (ROOT / 'download-checksums.json').write_text(json.dumps(checksums, indent=2))

if __name__ == '__main__':
    download()
