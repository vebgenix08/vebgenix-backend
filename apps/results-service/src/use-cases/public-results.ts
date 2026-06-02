import { PublishedResultBatch } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { buildSignedReceiptUrl, toGql } from '../results-utils';

export async function handlePublicResults(operation: string, args: Record<string, unknown>): Promise<unknown> {
  if (operation !== 'GET:/api/public/results/:token' && operation !== 'getPublicResult') return undefined;
  const token = (args.token ?? args.publicToken) as string;
  if (!token) throw new AppError('BAD_REQUEST', 'Token is required');
  const batch = await PublishedResultBatch.findOne({ publicToken: token, status: 'PUBLISHED' }).lean();
  if (!batch) throw new AppError('NOT_FOUND', 'Result not found or not published');
  const plain = toGql(batch) as Record<string, unknown>;
  const fileUrl = typeof plain.fileKey === 'string' ? await buildSignedReceiptUrl(plain.fileKey) : null;
  return { ...plain, fileUrl };
}
