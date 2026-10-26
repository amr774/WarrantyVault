"""Conservative label-based extraction. No merchant/product or warranty guesses."""
import calendar
import re
import unicodedata
from datetime import date

DIGITS = str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹٫٬', '01234567890123456789.,')
LABELS = {
    'name': r'product(?: name)?|item(?: name)?|اسم المنتج|المنتج|الصنف',
    'brand': r'brand|العلامة التجارية|الماركة',
    'model': r'model|الموديل|الطراز',
    'storeName': r'merchant|store(?: name)?|المتجر|اسم المتجر|البائع',
    'serialNumber': r'serial(?: number| no\.?)?|s/n|الرقم التسلسلي|رقم المسلسل',
    'purchaseDate': r'purchase date|invoice date|date|تاريخ الشراء|تاريخ الفاتورة|التاريخ',
    'purchasePrice': r'purchase price|unit price|price|السعر|سعر المنتج',
    'currency': r'currency|العملة',
    'warrantyMonths': r'warranty(?: duration)?|مدة الضمان|الضمان',
    'warrantyStartDate': r'warranty start(?: date)?|بداية الضمان|تاريخ بداية الضمان',
    'expiresAt': r'warranty expir(?:y|ation)(?: date)?|expires(?: on)?|انتهاء الضمان|تاريخ انتهاء الضمان',
}

def normalize(text):
    text = unicodedata.normalize('NFKC', text).translate(DIGITS)
    return re.sub('[\u0610-\u061a\u064b-\u065f\u0670\u0640\u200e\u200f\u202a-\u202e]', '', text).strip()

def parse_date(value):
    value = normalize(value)
    # A printed timestamp is still a date, but arbitrary trailing text is not.
    timestamp = re.fullmatch(r'(.+?)\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?', value, re.I)
    if timestamp:
        day, hour, minute, second, meridiem = timestamp.groups()
        if not (0 <= int(minute) < 60 and 0 <= int(second or 0) < 60
                and (1 <= int(hour) <= 12 if meridiem else 0 <= int(hour) < 24)):
            return None
        value = day
    match = re.fullmatch(r'(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})', value)
    if match:
        parts = tuple(map(int, match.groups()))
    else:
        match = re.fullmatch(r'(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})', value)
        if not match:
            return None
        a, b, year = map(int, match.groups())
        if a <= 12 and b <= 12 and a != b:
            return None  # Ambiguous day/month order must be entered by the user.
        parts = (year, b, a) if a > 12 else (year, a, b)
    try:
        result = date(*parts)
        return result.isoformat() if 1900 <= result.year <= 2199 else None
    except ValueError:
        return None

def add_months(value, months):
    start = date.fromisoformat(value)
    year, month0 = divmod(start.year * 12 + start.month - 1 + months, 12)
    return date(year, month0 + 1, min(start.day, calendar.monthrange(year, month0 + 1)[1])).isoformat()

def money(value):
    value = normalize(value)
    codes = re.findall(r'\b(?:USD|EUR|GBP|EGP|SAR|AED|KWD|QAR|BHD|OMR|JOD|CAD|AUD)\b', value, re.I)
    for text, code in [('جنيه مصري', 'EGP'), ('ريال سعودي', 'SAR'), ('درهم اماراتي', 'AED')]:
        if text in value:
            codes.append(code)
            value = value.replace(text, '')
    number = re.sub(r'\b[A-Za-z]{3}\b', '', value).strip()
    # Only an unambiguous decimal or correctly grouped thousands amount.
    if not re.fullmatch(r'(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?', number):
        return None, codes[0].upper() if len(set(codes)) == 1 else None
    amount = float(number.replace(',', ''))
    return (amount if 0 <= amount <= 9999999999 else None), (codes[0].upper() if len(set(codes)) == 1 else None)

def date_rows(lines):
    """Join a detached date label only to one nearby date on the same page/row.

    OCR reading order alone cannot safely associate receipt columns. Preserve raw
    lines, require bounding boxes, and flag a spatial association for review.
    """
    labels = '|'.join(LABELS[key] for key in ('purchaseDate', 'warrantyStartDate', 'expiresAt'))
    for row in lines:
        text = normalize(row['text'])
        if not re.fullmatch(rf'(?:{labels})\s*[:：]?', text, re.I):
            yield row
            continue
        box = row.get('box')
        if not box or row['confidence'] < .75:
            yield row
            continue
        x1, y1, x2, y2 = box
        candidates = []
        for other in lines:
            other_box = other.get('box')
            if other is row or not other_box or other.get('page') != row.get('page') or other['confidence'] < .75:
                continue
            a, b, c, d = other_box
            overlap = min(y2, d) - max(y1, b)
            height = min(y2 - y1, d - b)
            gap = max(a - x2, x1 - c)
            if height > 0 and overlap >= .6 * height and 0 <= gap <= 8 * max(y2 - y1, d - b):
                if parse_date(other['text']) is not None:
                    candidates.append(other)
        if len(candidates) == 1:
            other = candidates[0]
            yield {**row, 'text': text.rstrip(':： ') + ': ' + other['text'],
                   'confidence': min(row['confidence'], other['confidence']), 'spatial': True}
        else:
            yield row


def extract(lines):
    candidates = {key: [] for key in LABELS}
    warnings = []
    unresolved = set()
    def offer(key, value, score, evidence, uncertain=False):
        if value is not None:
            candidates[key].append({'value': value, 'confidence': round(score, 3), 'evidence': evidence, 'uncertain': uncertain or score < .9})
    for row in date_rows(lines):
        text, score = normalize(row['text']), float(row['confidence'])
        if score < .75:
            continue
        for key, labels in LABELS.items():
            if key in ('warrantyStartDate', 'expiresAt') and re.fullmatch(rf'(?:{labels})\s*[:：]?', text, re.I):
                # A visible coverage label with no reliable value is different
                # from a document that never states a separate coverage date.
                unresolved.add(key)
                warnings.append(f'Check the date in: {text}')
            # OCR frequently omits Arabic colons. Require a word boundary/space,
            # or an explicit separator; never match arbitrary substrings.
            match = re.fullmatch(rf'(?:{labels})(?:\s*[:：]\s*|\s+)(.+)', text, re.I)
            if not match and re.search('[\u0600-\u06ff]', text):
                # Bidirectional mixed-script receipts may put a value before its label.
                match = re.fullmatch(rf'(.+?)\s*[:：]\s*(?:{labels})', text, re.I)
            if not match:
                continue
            value = match.group(1).strip()
            if key in ('purchaseDate', 'warrantyStartDate', 'expiresAt'):
                parsed = parse_date(value)
                if parsed is None:
                    warnings.append(f'Check the date in: {text}')
                    if key in ('warrantyStartDate', 'expiresAt'):
                        unresolved.add(key)
                offer(key, parsed, score, text, uncertain=row.get('spatial', False))
            elif key == 'warrantyMonths':
                duration = re.fullmatch(r'(\d{1,4})\s*(months?|years?|شهر|شهرا|أشهر|اشهر|شهور|سنة|سنوات|عام|اعوام|أعوام)', value, re.I)
                if duration:
                    n, unit = duration.groups()
                    months = int(n) * (12 if re.fullmatch(r'years?|سنة|سنوات|عام|اعوام|أعوام', unit, re.I) else 1)
                    offer(key, months if months <= 1200 else None, score, text)
            elif key == 'purchasePrice':
                amount, currency = money(value)
                offer(key, amount, score, text)
                offer('currency', currency, score, text)
            elif key == 'currency':
                offer(key, value.upper() if re.fullmatch('[A-Za-z]{3}', value) else None, score, text)
            else:
                offer(key, value if len(value) <= (150 if key in ('name', 'storeName') else 100) else None, score, text)
    fields = {}
    for key, values in candidates.items():
        unique = {str(v['value']) for v in values}
        if len(unique) == 1:
            fields[key] = max(values, key=lambda v: v['confidence'])
        elif len(unique) > 1:
            warnings.append(f'Multiple {key} values found; enter the correct value manually.')
            if key in ('warrantyStartDate', 'expiresAt'):
                unresolved.add(key)
    start = fields.get('warrantyStartDate', fields.get('purchaseDate'))
    duration = fields.get('warrantyMonths')
    if start and duration and not unresolved:
        expiry = add_months(start['value'], duration['value'])
        if 'expiresAt' not in fields:
            fields['expiresAt'] = {'value': expiry, 'confidence': min(start['confidence'], duration['confidence']), 'uncertain': True, 'derived': True, 'evidence': 'Calculated from warranty start (or purchase date) and stated duration. Please verify.'}
        elif fields['expiresAt']['value'] != expiry:
            fields['expiresAt']['uncertain'] = True
            warnings.append('Printed expiration differs from calculated coverage. Check the warranty terms.')
    return {'fields': fields, 'warnings': list(dict.fromkeys(warnings)), 'unresolvedFields': sorted(unresolved)}
