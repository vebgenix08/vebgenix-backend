import { Types } from 'mongoose';

export function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function exactNameRegex(value: string) {
  return new RegExp(`^${escapeRegex(value.trim())}$`, 'i');
}

export function studentNameConditions(studentName: string) {
  const trimmed = studentName.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? '';
  const lastName = parts.slice(1).join(' ');
  return [
    { fullName: exactNameRegex(trimmed) },
    {
      firstName: exactNameRegex(firstName),
      ...(lastName ? { lastName: exactNameRegex(lastName) } : {}),
    },
  ];
}

export function normalizeDateOnly(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export function sameDate(left: unknown, right: unknown): boolean {
  const a = normalizeDateOnly(left);
  const b = normalizeDateOnly(right);
  return Boolean(a && b && a.getTime() === b.getTime());
}

export function matchedFields(
  input: { studentName?: string; phone?: string; email?: string; dob?: string },
  candidate: { studentName?: string; fullName?: string; phone?: string; email?: string; dateOfBirth?: unknown },
) {
  const fields: string[] = [];
  const normalizedInputName = String(input.studentName ?? '').trim().toLowerCase();
  const candidateName = String(candidate.studentName ?? candidate.fullName ?? '').trim().toLowerCase();
  if (normalizedInputName && candidateName && normalizedInputName === candidateName) {
    fields.push('name');
  }
  if (input.phone && candidate.phone && input.phone.trim() === String(candidate.phone).trim()) {
    fields.push('phone');
  }
  if (input.email && candidate.email && input.email.trim().toLowerCase() === String(candidate.email).trim().toLowerCase()) {
    fields.push('email');
  }
  if (input.dob && candidate.dateOfBirth && sameDate(input.dob, candidate.dateOfBirth)) {
    fields.push('dob');
  }
  return fields;
}

export function makeObjectId(value: string | undefined) {
  return value ? new Types.ObjectId(value) : undefined;
}
