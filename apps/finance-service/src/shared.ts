import { Types } from 'mongoose';

export const safeOid = (id: string | undefined) =>
  Types.ObjectId.isValid(id ?? '') ? new Types.ObjectId(id) : new Types.ObjectId('000000000000000000000000');

export function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}
