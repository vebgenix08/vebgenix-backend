import mongoose from 'mongoose';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');

  await mongoose.connect(uri);
  console.log('Connected.');

  const col = mongoose.connection.db!.collection('authusers');

  // Show current indexes
  const indexes = await col.indexes();
  console.log('Current indexes:');
  for (const idx of indexes) {
    console.log(`  ${idx.name}: key=${JSON.stringify(idx.key)} unique=${idx.unique} sparse=${idx.sparse}`);
  }

  // Drop all cognitoSub indexes
  const cognitoIndexes = indexes.filter(i => i.name?.includes('cognitoSub'));
  for (const idx of cognitoIndexes) {
    console.log(`\nDropping index: ${idx.name}`);
    await col.dropIndex(idx.name!);
  }

  // Recreate as sparse + unique
  console.log('\nRecreating cognitoSub index (sparse + unique)...');
  await col.createIndex({ cognitoSub: 1 }, { unique: true, sparse: true, name: 'cognitoSub_sparse_unique' });

  const newIndexes = await col.indexes();
  console.log('\nNew indexes:');
  for (const idx of newIndexes) {
    console.log(`  ${idx.name}: key=${JSON.stringify(idx.key)} unique=${idx.unique} sparse=${idx.sparse}`);
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
