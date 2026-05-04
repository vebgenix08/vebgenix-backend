/**
 * Migration: drop the old narrow unique index on FeeAssignment.
 *
 * The previous schema enforced { tenantId, studentId, academicYearId } as UNIQUE,
 * which blocked assigning more than one fee structure per student per year.
 * The current schema uses { tenantId, studentId, academicYearId, feeStructureId }
 * as the unique key (allows multiple structures, blocks duplicates of the same one).
 *
 * Mongoose ensureIndexes() creates new indexes but does NOT drop old ones whose
 * uniqueness property changed, so this script must be run once against the live DB
 * after deploying the updated FeeAssignment model.
 *
 * Usage:
 *   MONGODB_URI=<uri> npx ts-node scripts/migrate-fee-assignment-index.ts
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
  const coll = db.collection('feeassignments');

  const indexes = await coll.indexes();

  // The old bad index: unique on exactly (tenantId, studentId, academicYearId) — 3 fields
  const oldUniqueIdx = indexes.find(
    (idx) =>
      idx.unique === true &&
      Object.keys(idx.key).length === 3 &&
      idx.key['tenantId'] === 1 &&
      idx.key['studentId'] === 1 &&
      idx.key['academicYearId'] === 1,
  );

  if (oldUniqueIdx) {
    console.log(`Found old unique index: ${oldUniqueIdx.name}`);
    await coll.dropIndex(oldUniqueIdx.name as string);
    console.log(`Dropped: ${oldUniqueIdx.name}`);
    console.log('Mongoose will recreate it as non-unique on next service start (ensureIndexes).');
  } else {
    console.log('Old unique index not found — already dropped or never existed. Nothing to do.');
  }

  // Verify the wider unique index (correct one) is present
  const correctIdx = indexes.find(
    (idx) =>
      idx.unique === true &&
      Object.keys(idx.key).length === 4 &&
      idx.key['tenantId'] === 1 &&
      idx.key['studentId'] === 1 &&
      idx.key['academicYearId'] === 1 &&
      idx.key['feeStructureId'] === 1,
  );
  if (correctIdx) {
    console.log(`Correct unique index already present: ${correctIdx.name}`);
  } else {
    console.log('Note: the 4-field unique index is not yet present — it will be created by Mongoose on next start.');
  }

  await mongoose.disconnect();
  console.log('\n✅  Migration complete.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
