import { addMonthsClamped, warranty } from './warranty';
describe('UTC warranty calculations', () => {
  test.each([
    ['2024-01-31', 1, '2024-02-29'],
    ['2023-01-31', 1, '2023-02-28'],
    ['2024-02-29', 12, '2025-02-28'],
    ['2024-12-31', 2, '2025-02-28'],
    ['2024-05-31', 0, '2024-05-31'],
  ])('%s + %s months = %s', (day, months, result) =>
    expect(addMonthsClamped(day, months).toISOString().slice(0, 10)).toBe(result),
  );
  test('coverage includes expiration day; expired the next UTC day', () => {
    const end = new Date('2026-10-23');
    const start = new Date('2025-10-23');
    expect(warranty(end, start, 30, new Date('2026-10-23T23:59:59Z')).status).toBe('EXPIRING_SOON');
    expect(warranty(end, start, 30, new Date('2026-10-24')).status).toBe('EXPIRED');
  });
  test('threshold boundary and progress clamp', () => {
    expect(
      warranty(new Date('2026-11-22'), new Date('2025-01-01'), 30, new Date('2026-10-23')).status,
    ).toBe('EXPIRING_SOON');
    expect(
      warranty(new Date('2026-11-23'), new Date('2025-01-01'), 30, new Date('2026-10-23')).status,
    ).toBe('ACTIVE');
    expect(warranty(new Date('2020-01-01'), new Date('2019-01-01')).progress).toBe(100);
  });
});
