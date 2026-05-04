import { AcademicYear, AcademicSequence } from '@vebgenix/db';
import { Types } from 'mongoose';

async function resolveAcademicYearCode(tenantId: string, academicYearId: string | Types.ObjectId): Promise<string> {
  const id = typeof academicYearId === 'string' ? new Types.ObjectId(academicYearId) : academicYearId;
  const academicYear = await AcademicYear.findOne({ tenantId, _id: id }).lean();

  if (academicYear?.startDate && academicYear?.endDate) {
    const start = academicYear.startDate.getFullYear() % 100;
    const end   = academicYear.endDate.getFullYear()   % 100;
    return `${start.toString().padStart(2, '0')}-${end.toString().padStart(2, '0')}`;
  }
  if (academicYear?.name) {
    const match = academicYear.name.match(/(\d{2,4})\D+(\d{2,4})/);
    if (match) {
      const start = Number(match[1]) % 100;
      const end   = Number(match[2]) % 100;
      return `${start.toString().padStart(2, '0')}-${end.toString().padStart(2, '0')}`;
    }
    if (/^\d{2}-\d{2}$/.test(academicYear.name)) return academicYear.name;
  }
  const y = new Date().getFullYear() % 100;
  return `${y.toString().padStart(2, '0')}-${((y + 1) % 100).toString().padStart(2, '0')}`;
}

export async function generateApplicationNo(tenantId: string, academicYearId: string | Types.ObjectId): Promise<string> {
  const yearCode = await resolveAcademicYearCode(tenantId, academicYearId);
  const doc = await AcademicSequence.findOneAndUpdate(
    { tenantId, scope: 'APPLICATION', key: yearCode },
    { $inc: { value: 1 }, $setOnInsert: { tenantId, scope: 'APPLICATION', key: yearCode } },
    { upsert: true, new: true },
  );
  return `APP/${yearCode}/${doc.value.toString().padStart(4, '0')}`;
}
