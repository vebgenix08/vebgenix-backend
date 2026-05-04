/**
 * Migration: backfill paidAmount + balanceAmount on Invoice.items[]
 *
 * Run once after deploying the fee configuration schema changes.
 *
 * Usage:
 *   MONGODB_URI=<uri> npx ts-node scripts/migrate-invoice-item-balances.ts
 */
import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('MONGODB_URI env var is required');
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGO_URI!);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db!;
  const collection = db.collection('invoices');

  const cursor = collection.find({});
  let processed = 0;
  let skipped = 0;

  for await (const invoice of cursor) {
    // Skip invoices that already have balanceAmount on first item
    if (
      invoice.items?.length > 0 &&
      invoice.items[0].balanceAmount !== undefined
    ) {
      skipped++;
      continue;
    }

    const status: string = invoice.status ?? 'PENDING';
    const netAmount: number = invoice.netAmount ?? 0;
    const paidAmount: number = invoice.paidAmount ?? 0;

    const updatedItems = (invoice.items ?? []).map((item: Record<string, unknown>) => {
      const itemNet = (item.netAmount as number) ?? 0;

      if (status === 'PAID') {
        return { ...item, paidAmount: itemNet, balanceAmount: 0, priorityOrder: item.priorityOrder ?? 0 };
      }

      if (status === 'PARTIALLY_PAID' && netAmount > 0) {
        // Pro-rata backfill from invoice.paidAmount
        const itemPaid = Math.round((paidAmount * itemNet / netAmount) * 100) / 100;
        return {
          ...item,
          paidAmount:    itemPaid,
          balanceAmount: Math.max(0, Math.round((itemNet - itemPaid) * 100) / 100),
          priorityOrder: item.priorityOrder ?? 0,
        };
      }

      // PENDING / ISSUED / OVERDUE / DRAFT
      return { ...item, paidAmount: 0, balanceAmount: itemNet, priorityOrder: item.priorityOrder ?? 0 };
    });

    await collection.updateOne(
      { _id: invoice._id },
      {
        $set: {
          items:               updatedItems,
          allocationMethod:    invoice.allocationMethod    ?? 'PRO_RATA',
          collectionType:      invoice.collectionType      ?? 'PARTIAL_ALLOWED',
          minimumAmount:       invoice.minimumAmount       ?? 0,
          minimumPercentage:   invoice.minimumPercentage   ?? 0,
          allowPartialPayment: invoice.allowPartialPayment ?? true,
          graceDays:           invoice.graceDays           ?? 0,
          invoicePrefix:       invoice.invoicePrefix       ?? '',
          receiptPrefix:       invoice.receiptPrefix       ?? '',
        },
      },
    );

    processed++;
    if (processed % 500 === 0) console.log(`Processed ${processed} invoices...`);
  }

  console.log(`Migration complete. Processed: ${processed}, Skipped (already migrated): ${skipped}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
