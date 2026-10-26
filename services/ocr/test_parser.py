import unittest
from parser import extract, parse_date, add_months

def scan(*texts):
    return extract([{'text': text, 'confidence': .98} for text in texts])

class ParserTests(unittest.TestCase):
    def test_english(self):
        result = scan('Product: Studio Headphones', 'Purchase date: 2026-10-15', 'Warranty: 12 months', 'Price: 199.99 USD')
        self.assertEqual(result['fields']['expiresAt']['value'], '2027-10-15')
        self.assertEqual(result['fields']['currency']['value'], 'USD')

    def test_arabic(self):
        result = scan('المنتج: سماعات', 'تاريخ الشراء: ٢٠٢٦-١٠-١٥', 'مدة الضمان: ١٢ شهر', 'السعر: ١٢٥٠٫٥٠ EGP')
        self.assertEqual(result['fields']['expiresAt']['value'], '2027-10-15')
        self.assertEqual(result['fields']['purchasePrice']['value'], 1250.5)

    def test_unknown(self):
        result = scan('Thank you for shopping', 'Total: 100.00', 'Warranty terms apply')
        self.assertEqual(result['fields'], {})

    def test_ambiguous_invalid_dates(self):
        for value in ['01/02/2026', '2026-02-30', '99/99/2026', '2026-13-01']:
            self.assertIsNone(parse_date(value))
        self.assertEqual(parse_date('15/10/2026'), '2026-10-15')
        self.assertEqual(parse_date('10/15/2026'), '2026-10-15')

    def test_clamped_dates(self):
        self.assertEqual(add_months('2024-02-29', 12), '2025-02-28')
        self.assertEqual(add_months('2026-01-31', 1), '2026-02-28')

    def test_date_with_time(self):
        self.assertEqual(parse_date('25/12/2018 8:13:39 PM'), '2018-12-25')
        self.assertEqual(parse_date('٢٠٢٦-١٠-١٥ ١٤:٣٠'), '2026-10-15')
        for value in ['01/02/2026 08:30', '25/12/2018 25:13', '25/12/2018 8:61 PM',
                      '25/12/2018 0:13 PM', '25/12/2018 unknown']:
            self.assertIsNone(parse_date(value))

    def test_spatial_date_label(self):
        label = {'text': 'Date :', 'confidence': .97, 'page': 1, 'box': [10, 100, 60, 120]}
        value = {'text': '25/12/2018 8:13:39 PM', 'confidence': .99, 'page': 1, 'box': [100, 100, 290, 120]}
        fields = extract([value, label])['fields']
        self.assertEqual(fields['purchaseDate']['value'], '2018-12-25')
        self.assertTrue(fields['purchaseDate']['uncertain'])
        self.assertNotIn('expiresAt', fields)
        # Never associate across pages, rows, large gaps, or multiple dates.
        for candidate in [{**value, 'page': 2}, {**value, 'box': [100, 130, 290, 150]},
                          {**value, 'box': [400, 100, 590, 120]}, {**value, 'confidence': .6}]:
            self.assertNotIn('purchaseDate', extract([label, candidate])['fields'])
        self.assertNotIn('purchaseDate', extract([label, value, {**value, 'text': '26/12/2018'}])['fields'])
        self.assertNotIn('purchaseDate', scan('Date :', value['text'])['fields'])

    def test_start_and_conflict(self):
        result = scan('Purchase date: 2026-10-15', 'Warranty start: 2026-11-15', 'Warranty: 2 years')
        self.assertEqual(result['fields']['expiresAt']['value'], '2028-11-15')
        result = scan('Product: One', 'Product: Two')
        self.assertNotIn('name', result['fields'])
        self.assertTrue(result['warnings'])

    def test_low_confidence_not_prefilled(self):
        self.assertEqual(extract([{'text': 'Warranty: 12 months', 'confidence': .6}])['fields'], {})

    def test_no_duration_no_expiration(self):
        self.assertNotIn('expiresAt', scan('Purchase date: 2026-10-15')['fields'])

    def test_conflicting_coverage_dates_need_manual_resolution(self):
        base = ['Purchase date: 2026-10-15', 'Warranty: 12 months']
        for key, labels in [
            ('warrantyStartDate', ['Warranty start: 2026-11-15', 'Warranty start: 2026-12-15']),
            ('expiresAt', ['Warranty expiry: 2027-11-15', 'Warranty expiry: 2027-12-15']),
        ]:
            with self.subTest(key=key):
                result = scan(*base, *labels)
                self.assertNotIn(key, result['fields'])
                self.assertNotIn('expiresAt', result['fields'])
                self.assertEqual(result['unresolvedFields'], [key])
                self.assertTrue(result['warnings'])

    def test_unreadable_coverage_dates_do_not_fall_back_to_purchase(self):
        base = ['Purchase date: 2026-10-15', 'Warranty: 12 months']
        for text, key in [
            ('Warranty start: 01/02/2026', 'warrantyStartDate'),
            ('Warranty start:', 'warrantyStartDate'),
            ('Warranty expiry: 2027-02-30', 'expiresAt'),
            ('Warranty expiry:', 'expiresAt'),
        ]:
            with self.subTest(text=text):
                result = scan(*base, text)
                self.assertNotIn('expiresAt', result['fields'])
                self.assertEqual(result['unresolvedFields'], [key])
        # No explicit coverage dates means the normal purchase-date fallback is safe.
        result = scan(*base)
        self.assertEqual(result['fields']['expiresAt']['value'], '2027-10-15')
        self.assertEqual(result['unresolvedFields'], [])

    def test_detached_coverage_dates_keep_conflicts_visible(self):
        rows = [
            {'text': 'Purchase date: 2026-10-15', 'confidence': .98, 'page': 1, 'box': [10, 20, 300, 40]},
            {'text': 'Warranty: 12 months', 'confidence': .98, 'page': 1, 'box': [10, 50, 300, 70]},
            {'text': 'Warranty start:', 'confidence': .98, 'page': 1, 'box': [10, 100, 150, 120]},
            {'text': '2026-11-15', 'confidence': .98, 'page': 1, 'box': [160, 100, 230, 120]},
            {'text': '2026-12-15', 'confidence': .98, 'page': 1, 'box': [240, 100, 310, 120]},
        ]
        result = extract(rows)
        self.assertNotIn('expiresAt', result['fields'])
        self.assertEqual(result['unresolvedFields'], ['warrantyStartDate'])

    def test_actual_arabic_ocr_layout(self):
        result = scan('المنتج سماعات', 'تاريخ الشراء 15-10-2026', 'EGP 1250.50:السعر', 'مدة الضمان شهر')
        self.assertEqual(result['fields']['name']['value'], 'سماعات')
        self.assertEqual(result['fields']['purchaseDate']['value'], '2026-10-15')
        self.assertEqual(result['fields']['purchasePrice']['value'], 1250.50)
        self.assertNotIn('warrantyMonths', result['fields'])

if __name__ == '__main__':
    unittest.main()
