/**
 * wipe-finance-data.ts
 *
 * Deletes ALL finance data from the dev MongoDB database.
 * Non-finance collections (students, settings, etc.) are preserved.
 *
 * Run: npx tsx --env-file=.env scripts/wipe-finance-data.ts
 */

import mongoose from 'mongoose';
import { FeeHead } from '../packages/db/src/models/finance/FeeHead.model';
import { FeeStructure } from '../packages/db/src/models/finance/FeeStructure.model';
import { FeeStructureClassMapping } from '../packages/db/src/models/finance/FeeStructureClassMapping.model';
import { FeeAssignment } from '../packages/db/src/models/finance/FeeAssignment.model';
import { FeeSchedule } from '../packages/db/src/models/finance/FeeSchedule.model';
import { InstallmentPlan } from '../packages/db/src/models/finance/InstallmentPlan.model';
import { FeeRevision } from '../packages/db/src/models/finance/FeeRevision.model';
import { Invoice } from '../packages/db/src/models/finance/Invoice.model';
import { Payment } from '../packages/db/src/models/finance/Payment.model';
import { FinanceSequence } from '../packages/db/src/models/finance/FinanceSequence.model';
import { PaymentAllocation } from '../packages/db/src/models/finance/PaymentAllocation.model';
import StudentFeeOrder from '../packages/db/src/models/finance/StudentFeeOrders.model';
import { StudentTransaction } from '../packages/db/src/models/finance/StudentTransaction.model';

const FINANCE_COLLECTIONS = [
  { model: FeeHead,                  name: 'FeeHead' },
  { model: FeeStructure,             name: 'FeeStructure' },
  { model: FeeStructureClassMapping, name: 'FeeStructureClassMapping' },
  { model: FeeAssignment,            name: 'FeeAssignment' },
  { model: FeeSchedule,              name: 'FeeSchedule' },
  { model: InstallmentPlan,          name: 'InstallmentPlan' },
  { model: FeeRevision,              name: 'FeeRevision' },
  { model: Invoice,                  name: 'Invoice' },
  { model: Payment,                  name: 'Payment' },
  { model: FinanceSequence,          name: 'FinanceSequence' },
  { model: PaymentAllocation,        name: 'PaymentAllocation' },
  { model: StudentFeeOrder,          name: 'StudentFeeOrder' },
  { model: StudentTransaction,       name: 'StudentTransaction' },
] as const;

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set in environment');

  console.log('\nConnecting to MongoDB...');
  await mongoose.connect(uri, { bufferCommands: false });
  console.log('Connected.\n');

  console.log('── Finance wipe ─────────────────────────────────────────────');
  let total = 0;
  for (const { model, name } of FINANCE_COLLECTIONS) {
    const { deletedCount } = await (model as mongoose.Model<mongoose.Document>).deleteMany({});
    console.log(`  ${name.padEnd(28)}deleted: ${deletedCount}`);
    total += deletedCount ?? 0;
  }

  console.log(`\n  Total documents deleted: ${total}`);
  await mongoose.disconnect();
  console.log('\nDone. Finance data wiped.');
}

main().catch(err => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
