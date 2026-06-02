import { Types } from 'mongoose';

export const safeOid = (id: string | undefined) =>
  Types.ObjectId.isValid(id ?? '') ? new Types.ObjectId(id) : new Types.ObjectId('000000000000000000000000');

export function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}

export function toObjectId(id: string | Types.ObjectId): Types.ObjectId {
  return typeof id === 'string' ? new Types.ObjectId(id) : id;
}

export function isObjectId(value?: string | null): boolean {
  return !!value && Types.ObjectId.isValid(value);
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function normalizeUpper(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toUpperCase() : undefined;
}

export function sumMoney(values: number[]): number {
  return roundMoney(values.reduce((sum, value) => sum + value, 0));
}

export function validatePercentTotal<T extends { percentOfTotal?: number }>(slots: T[]): void {
  const usesPercent = slots.some(slot => slot.percentOfTotal != null);
  if (!usesPercent) return;
  const total = roundMoney(slots.reduce((sum, slot) => sum + (slot.percentOfTotal ?? 0), 0));
  if (Math.abs(total - 100) > 0.01) {
    throw new Error(`Installment percentages must sum to 100 (got ${total.toFixed(2)}%)`);
  }
}

export function toPlain<T>(doc: T): T {
  return JSON.parse(JSON.stringify(doc)) as T;
}

export function buildAmountsByRatio(
  amount: number,
  weights: number[],
): number[] {
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return weights.map(() => 0);

  const rounded: number[] = [];
  let allocated = 0;

  for (let index = 0; index < weights.length; index++) {
    if (index === weights.length - 1) {
      rounded.push(roundMoney(amount - allocated));
      break;
    }
    const share = roundMoney((amount * weights[index]) / total);
    rounded.push(share);
    allocated = roundMoney(allocated + share);
  }

  return rounded;
}
