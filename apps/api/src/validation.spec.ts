import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ListDto, ProductDto, UpdateProductDto } from './products';
import { ProfileDto } from './users';

const validation = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const product = {
  name: 'Laptop',
  categoryId: '4c0c903f-9a5b-4d42-bf8e-8762d4439e18',
  purchaseDate: '2026-10-01',
  currency: 'USD',
  warrantyMonths: 12,
};

describe('Product and profile input validation', () => {
  test.each(['brand', 'model', 'notes', 'expiresAt'])(
    'rejects explicit null for non-nullable create field %s',
    async (field) => {
      await expect(
        validation.transform({ ...product, [field]: null }, { type: 'body', metatype: ProductDto }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  test.each([
    'name',
    'categoryId',
    'purchaseDate',
    'currency',
    'warrantyMonths',
    'brand',
    'model',
    'notes',
    'expiresAt',
  ])('rejects explicit null for non-nullable update field %s', async (field) => {
    await expect(
      validation.transform({ [field]: null }, { type: 'body', metatype: UpdateProductDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  test('keeps partial updates and clearing nullable fields valid', async () => {
    await expect(
      validation.transform({}, { type: 'body', metatype: UpdateProductDto }),
    ).resolves.toEqual({});
    const fields = {
      purchasePrice: null,
      warrantyStartDate: null,
      storeName: null,
      serialNumber: null,
    };
    await expect(
      validation.transform(fields, { type: 'body', metatype: UpdateProductDto }),
    ).resolves.toEqual(fields);
    await expect(
      validation.transform({ ...product, ...fields }, { type: 'body', metatype: ProductDto }),
    ).resolves.toMatchObject(fields);
  });
  test('rejects blank product and profile names after trimming', async () => {
    await expect(
      validation.transform({ ...product, name: ' \t ' }, { type: 'body', metatype: ProductDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validation.transform({ name: ' \t ' }, { type: 'body', metatype: ProfileDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validation.transform({ name: ' Amr ' }, { type: 'body', metatype: ProfileDto }),
    ).resolves.toMatchObject({ name: 'Amr' });
  });
  test('rejects pagination that would overflow the database offset', async () => {
    await expect(
      validation.transform({ page: '9007199254740991' }, { type: 'query', metatype: ListDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
