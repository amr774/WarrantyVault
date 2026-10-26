import unittest
import io
from pathlib import Path
from PIL import Image
from service import pages, MAX_BYTES

ROOT = Path(__file__).resolve().parents[2] / 'tests' / 'fixtures' / 'ocr'

class DocumentTests(unittest.TestCase):
    def test_valid_formats(self):
        for filename in ['english.png', 'english.jpg', 'english.webp', 'english.pdf', 'arabic.pdf']:
            with self.subTest(filename=filename):
                result = list(pages((ROOT / filename).read_bytes()))
                self.assertEqual(len(result), 1)
                self.assertGreater(result[0].width, 100)
                for page in result:
                    page.close()

    def test_page_limit(self):
        with self.assertRaisesRegex(ValueError, '1 to 5'):
            list(pages((ROOT / 'six-pages.pdf').read_bytes()))

    def test_corrupt(self):
        for data in [b'%PDF-not-valid', b'not an image', b'\x89PNG\r\n\x1a\ninvalid']:
            with self.assertRaises(ValueError):
                list(pages(data))

    def test_pixel_limit(self):
        image = Image.new('RGB', (4000, 3100), 'white')
        data = io.BytesIO()
        image.save(data, format='PNG')
        image.close()
        with self.assertRaisesRegex(ValueError, '12 megapixels'):
            list(pages(data.getvalue()))

if __name__ == '__main__':
    unittest.main()
