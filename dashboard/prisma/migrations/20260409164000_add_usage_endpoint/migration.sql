ALTER TABLE "usage_records"
ADD COLUMN "endpoint" TEXT;

CREATE INDEX "usage_records_endpoint_idx" ON "usage_records"("endpoint");
