const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const col = mongoose.connection.db.collection('fee_heads');

  // Drop the old bad sparse unique index
  await col.dropIndex('tenantId_1_feeCategoryId_1_code_1').catch(e => console.log('drop result:', e.message));

  // Create corrected partial-filter index (only enforces uniqueness when both feeCategoryId and code are set)
  await col.createIndex(
    { tenantId: 1, feeCategoryId: 1, code: 1 },
    {
      unique: true,
      partialFilterExpression: {
        feeCategoryId: { $exists: true },
        code: { $exists: true, $type: 'string' }
      },
      name: 'tenantId_1_feeCategoryId_1_code_1'
    }
  );

  const idx = await col.indexes();
  idx.forEach(i => console.log('IDX:', i.name, '| unique:', i.unique, '| partial:', JSON.stringify(i.partialFilterExpression)));
  await mongoose.disconnect();
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
