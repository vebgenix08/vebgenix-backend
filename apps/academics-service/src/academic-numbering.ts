import { AcademicYear, AcademicSequence } from '@vebgenix/db';
import { Types } from 'mongoose';

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
    // Handle "25-26" style directly
    if (/^\d{2}-\d{2}$/.test(academicYear.name)) return academicYear.name;
  }

  const y = new Date().getFullYear() % 100;
  return `${y.toString().padStart(2, '0')}-${((y + 1) % 100).toString().padStart(2, '0')}`;
}

async function nextSequence(tenantId: string, scope: string, key: string): Promise<number> {
  const doc = await AcademicSequence.findOneAndUpdate(
    { tenantId, scope, key },
    { $inc: { value: 1 }, $setOnInsert: { tenantId, scope, key } },
    { upsert: true, new: true },
  );
  return doc.value;
}

// Application No: APP/25-26/0001
export async function generateApplicationNo(
  tenantId: string,
  academicYearId: string | Types.ObjectId,
): Promise<string> {
  const yearCode = await resolveAcademicYearCode(tenantId, academicYearId);
  const seq = await nextSequence(tenantId, 'APPLICATION', yearCode);
  return `APP/${yearCode}/${seq.toString().padStart(4, '0')}`;
}

// Admission No: ADM/25-26/0045
export async function generateAdmissionNo(
  tenantId: string,
  academicYearId: string | Types.ObjectId,
): Promise<string> {
  const yearCode = await resolveAcademicYearCode(tenantId, academicYearId);
  const seq = await nextSequence(tenantId, 'ADMISSION', yearCode);
  return `ADM/${yearCode}/${seq.toString().padStart(4, '0')}`;
}

// Formats a numeric sequence as a zero-padded string (e.g. 1 → "001")
export function formatNumberPadded(n: number, width = 3): string {
  return n.toString().padStart(width, '0');
}
