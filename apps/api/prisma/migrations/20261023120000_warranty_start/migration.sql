-- Additive only: existing products and receipts remain unchanged.
ALTER TABLE "Product" ADD COLUMN "warrantyStartDate" DATE;
