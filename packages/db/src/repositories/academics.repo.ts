import { Types } from 'mongoose';
import { Student, IStudent } from '../models/academics/Student.model';
import { Attendance } from '../models/academics/Attendance.model';
import { Exam } from '../models/academics/Exam.model';

export const AcademicsRepo = {
  // ── Students ──────────────────────────────────────────────────────

  async listStudents(tenantId: string, filters: Record<string, unknown> = {}) {
    return Student.find({ tenantId: new Types.ObjectId(tenantId), ...filters }).sort({ fullName: 1 });
  },

  async findStudentById(tenantId: string, id: string): Promise<IStudent | null> {
    return Student.findOne({ tenantId: new Types.ObjectId(tenantId), _id: new Types.ObjectId(id) });
  },

  async createStudent(tenantId: string, data: Partial<IStudent>) {
    return Student.create({ ...data, tenantId: new Types.ObjectId(tenantId) });
  },

  async updateStudent(tenantId: string, id: string, update: Partial<IStudent>) {
    return Student.findOneAndUpdate(
      { tenantId: new Types.ObjectId(tenantId), _id: new Types.ObjectId(id) },
      { $set: update },
      { new: true }
    );
  },

  // ── Attendance ────────────────────────────────────────────────────

  async upsertAttendance(tenantId: string, studentId: string, date: Date, data: object) {
    return Attendance.findOneAndUpdate(
      { tenantId: new Types.ObjectId(tenantId), studentId: new Types.ObjectId(studentId), date },
      { $set: data },
      { upsert: true, new: true }
    );
  },

  async listAttendance(tenantId: string, classId: string, date: Date) {
    return Attendance.find({
      tenantId: new Types.ObjectId(tenantId),
      classId: new Types.ObjectId(classId),
      date,
    });
  },

  // ── Exams ─────────────────────────────────────────────────────────

  async listExams(tenantId: string, filters: Record<string, unknown> = {}) {
    return Exam.find({ tenantId: new Types.ObjectId(tenantId), ...filters }).sort({ createdAt: -1 });
  },

  async findExamById(tenantId: string, id: string) {
    return Exam.findOne({ tenantId: new Types.ObjectId(tenantId), _id: new Types.ObjectId(id) });
  },

  async createExam(tenantId: string, data: object) {
    return Exam.create({ ...data, tenantId: new Types.ObjectId(tenantId) });
  },

  async addMarksEntry(tenantId: string, examId: string, entry: object) {
    return Exam.findOneAndUpdate(
      { tenantId: new Types.ObjectId(tenantId), _id: new Types.ObjectId(examId) },
      { $push: { marksEntries: entry } },
      { new: true }
    );
  },

  async publishExam(tenantId: string, examId: string, publishedBy: string) {
    return Exam.findOneAndUpdate(
      { tenantId: new Types.ObjectId(tenantId), _id: new Types.ObjectId(examId) },
      { $set: { status: 'RESULTS_PUBLISHED', publishedAt: new Date(), publishedBy: new Types.ObjectId(publishedBy) } },
      { new: true }
    );
  },
};
