"""Loopback-only OCR. Document bytes never leave this process/machine."""
import os
os.environ['PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK'] = 'True'
os.environ['DISABLE_MODEL_SOURCE_CHECK'] = 'True'
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT'] = 'False'
import asyncio
import io
import base64
import socket
from contextlib import asynccontextmanager, closing
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image, ImageOps
import pypdfium2 as pdfium
from fastapi import FastAPI, Request, HTTPException
from models import ROOT, NAMES
from parser import extract

MAX_BYTES = 10 * 1024 * 1024
MAX_PAGES = 5
MAX_PIXELS = 12_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS
executor = ThreadPoolExecutor(max_workers=1)
busy = False
engine = None

def load_engine():
    global engine
    for name in NAMES:
        if not (ROOT / name / 'inference.json').exists():
            raise RuntimeError('OCR models missing. Run python services/ocr/models.py first.')
    from paddleocr import PaddleOCR
    engine = PaddleOCR(device='cpu', cpu_threads=4, enable_mkldnn=False,
        text_detection_model_name=NAMES[0], text_detection_model_dir=str(ROOT / NAMES[0]),
        text_recognition_model_name=NAMES[1], text_recognition_model_dir=str(ROOT / NAMES[1]),
        use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False)
    # Defense in depth: deny outbound socket connections, including library telemetry.
    def deny_connection(*args, **kwargs):
        raise OSError('Outbound connections are disabled in the local OCR service')
    socket.socket.connect = deny_connection
    socket.socket.connect_ex = deny_connection

def pages(data):
    if data.startswith(b'%PDF-'):
        try:
            with closing(pdfium.PdfDocument(data)) as document:
                if not 1 <= len(document) <= MAX_PAGES:
                    raise ValueError('PDF must contain 1 to 5 pages')
                # Validate all page dimensions before allocating rendered images.
                for page in document:
                    with closing(page):
                        width, height = page.get_size()
                        if width <= 0 or height <= 0 or width * height * 4 > MAX_PIXELS:
                            raise ValueError('PDF page is too large (12 megapixel limit at 144 DPI)')
                for page in document:
                    with closing(page):
                        with closing(page.render(scale=2)) as bitmap:
                            yield bitmap.to_pil().convert('RGB')
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError('Unreadable or password-protected PDF') from exc
    else:
        try:
            with Image.open(io.BytesIO(data)) as source:
                if source.format not in ('JPEG', 'PNG', 'WEBP') or getattr(source, 'n_frames', 1) != 1:
                    raise ValueError('Use a single JPG, PNG or WebP image')
                if source.width * source.height > MAX_PIXELS:
                    raise ValueError('Image exceeds 12 megapixels')
                source.load()
                upright = ImageOps.exif_transpose(source)
                if upright.mode in ('RGBA', 'LA') or 'transparency' in upright.info:
                    rgba = upright.convert('RGBA')
                    background = Image.new('RGBA', rgba.size, 'white')
                    yield Image.alpha_composite(background, rgba).convert('RGB')
                else:
                    yield upright.convert('RGB')
        except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
            raise ValueError('Image exceeds pixel limit') from exc
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError('Unreadable image; use JPG, PNG, WebP or PDF') from exc

def process(data, validate_only):
    lines = []
    previews = []
    count = 0
    for page in pages(data):
        count += 1
        try:
            if not validate_only:
                if data.startswith(b'%PDF-'):
                    thumbnail = page.copy()
                    thumbnail.thumbnail((1600, 1600))
                    encoded = io.BytesIO()
                    thumbnail.save(encoded, format='JPEG', quality=85)
                    thumbnail.close()
                    previews.append({'page': count, 'dataUrl': 'data:image/jpeg;base64,' + base64.b64encode(encoded.getvalue()).decode('ascii')})
                for result in engine.predict(np.array(page)[:, :, ::-1]):
                    for text, score, box in zip(result['rec_texts'], result['rec_scores'], result['rec_boxes']):
                        lines.append({'text': str(text)[:1000], 'confidence': float(score), 'page': count,
                                      'box': [float(coordinate) for coordinate in box]})
                        if len(lines) > 2000:
                            raise ValueError('Document contains too much text; scan fewer pages')
        finally:
            page.close()
    return {'pages': count, 'lines': lines, 'previews': previews, **extract(lines)}

@asynccontextmanager
async def lifespan(app):
    await asyncio.get_running_loop().run_in_executor(executor, load_engine)
    yield
    executor.shutdown(wait=False)

app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

@app.middleware('http')
async def local_only(request, call_next):
    from starlette.responses import JSONResponse
    if request.headers.get('origin') or request.headers.get('host') not in ('127.0.0.1:8100', 'localhost:8100') or request.client.host not in ('127.0.0.1', '::1'):
        return JSONResponse({'detail': 'Local backend access only'}, status_code=403)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    return response

@app.get('/health')
def health():
    return {'status': 'ok', 'model': NAMES[1], 'busy': busy}

@app.post('/analyze')
async def analyze(request: Request, validate_only: bool = False):
    global busy
    if busy:
        raise HTTPException(429, 'OCR is busy; try again shortly')
    busy = True
    try:
        chunks = bytearray()
        async for chunk in request.stream():
            chunks.extend(chunk)
            if len(chunks) > MAX_BYTES:
                raise HTTPException(413, 'Document exceeds 10 MB')
        if not chunks:
            raise HTTPException(400, 'Choose a document')
        return await asyncio.get_running_loop().run_in_executor(executor, process, bytes(chunks), validate_only)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    finally:
        busy = False

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8100, access_log=False)
