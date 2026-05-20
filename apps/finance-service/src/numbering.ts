import { AcademicYear, FeeHead, FinanceSequence, IInvoice } from '@vebgenix/db';
import { Types } from 'mongoose';

const DEFAULT_FEE_PREFIX = 'FEE';

export function normalizeFeePrefix(value: string | undefined, fallbackName = DEFAULT_FEE_PREFIX): string {
  const source = value?.trim() || fallbackName;
  const words = source
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const prefix = words.length > 1
    ? words.map((word) => word[0]).join('')
    : (words[0] ?? DEFAULT_FEE_PREFIX).slice(0, 4);

  return (prefix || DEFAULT_FEE_PREFIX).slice(0, 8);
}

export async function resolveFeeHeadPrefix(tenantId: string, feeHeadId?: string | Types.ObjectId): Promise<string> {
  if (!feeHeadId) return DEFAULT_FEE_PREFIX;

  const id = typeof feeHeadId === 'string' ? new Types.ObjectId(feeHeadId) : feeHeadId;
  const feeHead = await FeeHead.findOne({ tenantId, _id: id }).lean();
  if (!feeHead) return DEFAULT_FEE_PREFIX;

  return normalizeFeePrefix(feeHead.prefix, feeHead.name);
}

export async function resolveAcademicYearCode(tenantId: string, academicYearId: string | Types.ObjectId): Promise<string> {
  const id = typeof academicYearId === 'string' ? new Types.ObjectId(academicYearId) : academicYearId;
  const academicYear = await AcademicYear.findOne({ tenantId, _id: id }).lean();

  if (academicYear?.startDate && academicYear?.endDate) {
    const start = academicYear.startDate.getFullYear() % 100;
    const end = academicYear.endDate.getFullYear() % 100;
    return `${start.toString().padStart(2, '0')}-${end.toString().padStart(2, '0')}`;
  }

  if (academicYear?.name) {
    const match = academicYear.name.match(/(\d{2,4})\D+(\d{2,4})/);
    if (match) {
      const start = Number(match[1]) % 100;
      const end = Number(match[2]) % 100;
      return `${start.toString().padStart(2, '0')}-${end.toString().padStart(2, '0')}`;
    }
  }

  const currentYear = new Date().getFullYear() % 100;
  return `${currentYear.toString().padStart(2, '0')}-${((currentYear + 1) % 100).toString().padStart(2, '0')}`;
}

export async function nextSequenceValue(tenantId: string, key: string): Promise<number> {
  const sequence = await FinanceSequence.findOneAndUpdate(
    { tenantId, scope: 'finance', key },
    { $inc: { value: 1 }, $setOnInsert: { tenantId, scope: 'finance', key } },
    { upsert: true, new: true },
  );
  return sequence.value;
}

export async function generateFinanceNumber(
  tenantId: string,
  prefix: string,
  academicYearCode: string,
  kind: 'ORD' | 'RCP',
): Promise<string> {
  const normalizedPrefix = normalizeFeePrefix(prefix);
  const key = `${kind}:${normalizedPrefix}:${academicYearCode}`;
  const value = await nextSequenceValue(tenantId, key);
  return `${normalizedPrefix}_${academicYearCode}_${kind}_${value.toString().padStart(6, '0')}`;
}

export async function generateFeeOrderId(
  tenantId: string,
  prefix: string,
  academicYearId: string | Types.ObjectId,
): Promise<string> {
  const academicYearCode = await resolveAcademicYearCode(tenantId, academicYearId);
  return generateFinanceNumber(tenantId, prefix, academicYearCode, 'ORD');
}

export async function generateReceiptNumberForInvoice(tenantId: string, invoice: IInvoice): Promise<string> {
  const academicYearCode = await resolveAcademicYearCode(tenantId, invoice.academicYearId);
  const key = `RCP:${academicYearCode}`;
  const value = await nextSequenceValue(tenantId, key);
  return `RCP/${academicYearCode}/${value.toString().padStart(5, '0')}`;
}
