import { Types, ClientSession } from 'mongoose';
import { Student, IStudent } from '../models/academics/Student.model';
import { Attendance } from '../models/academics/Attendance.model';
import { Exam } from '../models/academics/Exam.model';
import { Section } from '../models/academics/Section.model';
import { StudentAcademicEnrollment, IStudentAcademicEnrollment } from '../models/academics/StudentAcademicEnrollment.model';
import { AcademicRegistrationBatch, IAcademicRegistrationBatch } from '../models/academics/AcademicRegistrationBatch.model';
import { AcademicRollNoBatch, IAcademicRollNoBatch } from '../models/academics/AcademicRollNoBatch.model';
import { AcademicSequence } from '../models/academics/AcademicSequence.model';
import { StudentPromotionBatch, IStudentPromotionBatch } from '../models/academics/StudentPromotionBatch.model';
import { StudentPromotionBatchItem, IStudentPromotionBatchItem } from '../models/academics/StudentPromotionBatchItem.model';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const AcademicsRepo: any = {
  // ── Students ──────────────────────────────────────────────────────

  async listStudents(tenantId: string, filters: Record<string, unknown> = {}) {
    return Student.find({ tenantId, ...filters }).sort({ fullName: 1 });
  },

  async findStudentById(tenantId: string, id: string): Promise<IStudent | null> {
    return Student.findOne({ tenantId, _id: new Types.ObjectId(id) });
  },

  async createStudent(tenantId: string, data: Partial<IStudent>) {
    return Student.create({ ...data, tenantId });
  },

  async updateStudent(tenantId: string, id: string, update: Partial<IStudent>, session?: ClientSession) {
    return Student.findOneAndUpdate(
      { tenantId, _id: new Types.ObjectId(id) },
      { $set: update },
      { new: true, session },
    );
  },

  // ── Attendance ────────────────────────────────────────────────────

  async upsertAttendance(tenantId: string, studentId: string, date: Date, data: object) {
    return Attendance.findOneAndUpdate(
      { tenantId, studentId: new Types.ObjectId(studentId), date },
      { $set: data },
      { upsert: true, new: true },
    );
  },

  async listAttendance(tenantId: string, filters: { classId?: string; sectionId?: string; studentId?: string }, date: Date) {
    const query: Record<string, unknown> = { tenantId, date };
    if (filters.classId) query.classId = new Types.ObjectId(filters.classId);
    if (filters.sectionId) query.sectionId = new Types.ObjectId(filters.sectionId);
    if (filters.studentId) query.studentId = new Types.ObjectId(filters.studentId);
    return Attendance.find(query);
  },

  // ── Exams ─────────────────────────────────────────────────────────

  async listExams(tenantId: string, filters: Record<string, unknown> = {}) {
    return Exam.find({ tenantId, ...filters }).sort({ createdAt: -1 });
  },

  async findExamById(tenantId: string, id: string) {
    return Exam.findOne({ tenantId, _id: new Types.ObjectId(id) });
  },

  async createExam(tenantId: string, data: object) {
    return Exam.create({ ...data, tenantId });
  },

  async addMarksEntry(tenantId: string, examId: string, entry: object) {
    return Exam.findOneAndUpdate(
      { tenantId, _id: new Types.ObjectId(examId) },
      { $push: { marksEntries: entry } },
      { new: true },
    );
  },

  async publishExam(tenantId: string, examId: string, publishedBy: string) {
    return Exam.findOneAndUpdate(
      { tenantId, _id: new Types.ObjectId(examId) },
      { $set: { status: 'RESULTS_PUBLISHED', publishedAt: new Date(), publishedBy } },
      { new: true },
    );
  },

  // ── AcademicSequence ──────────────────────────────────────────────

  async nextAcademicSequence(tenantId: string, scope: string, key: string): Promise<number> {
    const doc = await AcademicSequence.findOneAndUpdate(
      { tenantId, scope, key },
      { $inc: { value: 1 } },
      { upsert: true, new: true },
    );
    return doc.value;
  },

  // ── StudentAcademicEnrollment ─────────────────────────────────────

  async createEnrollment(tenantId: string, data: Partial<IStudentAcademicEnrollment>, session?: ClientSession) {
    const docs = await StudentAcademicEnrollment.create([{ ...data, tenantId }], { session });
    return docs[0];
  },

  async findEnrollment(tenantId: string, studentId: string, academicYearId: string) {
    return StudentAcademicEnrollment.findOne({
      tenantId,
      studentId:      new Types.ObjectId(studentId),
      academicYearId: new Types.ObjectId(academicYearId),
      status:         'ACTIVE',
    });
  },

  async updateEnrollment(tenantId: string, enrollmentId: string, update: Partial<IStudentAcademicEnrollment>, session?: ClientSession) {
    return StudentAcademicEnrollment.findOneAndUpdate(
      { tenantId, _id: new Types.ObjectId(enrollmentId) },
      { $set: update },
      { new: true, session },
    );
  },

  async bulkSetPromotionEligibility(
    tenantId: string,
    updates: Array<{ studentId: string; academicYearId: string; eligibility: 'ELIGIBLE' | 'DETAINED' | 'ON_HOLD' }>,
  ) {
    const ops = updates.map(u => ({
      updateOne: {
        filter: {
          tenantId,
          studentId:      new Types.ObjectId(u.studentId),
          academicYearId: new Types.ObjectId(u.academicYearId),
          status:         'ACTIVE',
        },
        update: { $set: { promotionEligibility: u.eligibility } },
      },
    }));
    return StudentAcademicEnrollment.bulkWrite(ops);
  },

  async listEnrollments(tenantId: string, filters: Record<string, unknown> = {}) {
    const query: Record<string, unknown> = { tenantId };
    if (filters.academicYearId) query.academicYearId = new Types.ObjectId(filters.academicYearId as string);
    if (filters.campusId)       query.campusId       = new Types.ObjectId(filters.campusId as string);
    if (filters.gradeId)        query.gradeId        = new Types.ObjectId(filters.gradeId as string);
    if (filters.sectionId)      query.sectionId      = new Types.ObjectId(filters.sectionId as string);
    if (filters.status)         query.status         = filters.status;
    return StudentAcademicEnrollment.find(query).sort({ createdAt: 1 });
  },

  // ── AcademicRegistrationBatch ─────────────────────────────────────

  async findOrCreateRegistrationBatch(
    tenantId: string,
    academicYearId: string,
    campusId: string,
    gradeId: string,
  ): Promise<IAcademicRegistrationBatch> {
    const existing = await AcademicRegistrationBatch.findOne({
      tenantId,
      academicYearId: new Types.ObjectId(academicYearId),
      campusId:       new Types.ObjectId(campusId),
      gradeId:        new Types.ObjectId(gradeId),
    });
    if (existing) return existing;
    return AcademicRegistrationBatch.create({
      tenantId,
      academicYearId: new Types.ObjectId(academicYearId),
      campusId:       new Types.ObjectId(campusId),
      gradeId:        new Types.ObjectId(gradeId),
    });
  },

  async updateRegistrationBatch(
    tenantId: string,
    batchId: string,
    update: Partial<IAcademicRegistrationBatch>,
  ) {
    return AcademicRegistrationBatch.findOneAndUpdate(
      { tenantId, _id: new Types.ObjectId(batchId) },
      { $set: update },
      { new: true },
    );
  },

  async listRegistrationBatches(tenantId: string, filters: Record<string, unknown> = {}) {
    const query: Record<string, unknown> = { tenantId };
    if (filters.academicYearId) query.academicYearId = new Types.ObjectId(filters.academicYearId as string);
    if (filters.campusId)       query.campusId       = new Types.ObjectId(filters.campusId as string);
    if (filters.gradeId)        query.gradeId        = new Types.ObjectId(filters.gradeId as string);
    return AcademicRegistrationBatch.find(query);
  },

  // ── AcademicRollNoBatch ───────────────────────────────────────────

  async findOrCreateRollNoBatch(
    tenantId: string,
    academicYearId: string,
    campusId: string,
    gradeId: string,
    sectionId: string,
  ): Promise<IAcademicRollNoBatch> {
    const existing = await AcademicRollNoBatch.findOne({
      tenantId,
      academicYearId: new Types.ObjectId(academicYearId),
      campusId:       new Types.ObjectId(campusId),
      gradeId:        new Types.ObjectId(gradeId),
      sectionId:      new Types.ObjectId(sectionId),
    });
    if (existing) return existing;
    return AcademicRollNoBatch.create({
      tenantId,
      academicYearId: new Types.ObjectId(academicYearId),
      campusId:       new Types.ObjectId(campusId),
      gradeId:        new Types.ObjectId(gradeId),
      sectionId:      new Types.ObjectId(sectionId),
    });
  },

  async updateRollNoBatch(
    tenantId: string,
    batchId: string,
    update: Partial<IAcademicRollNoBatch>,
  ) {
    return AcademicRollNoBatch.findOneAndUpdate(
      { tenantId, _id: new Types.ObjectId(batchId) },
      { $set: update },
      { new: true },
    );
  },

  async listRollNoBatches(tenantId: string, filters: Record<string, unknown> = {}) {
    const query: Record<string, unknown> = { tenantId };
    if (filters.academicYearId) query.academicYearId = new Types.ObjectId(filters.academicYearId as string);
    if (filters.campusId)       query.campusId       = new Types.ObjectId(filters.campusId as string);
    if (filters.gradeId)        query.gradeId        = new Types.ObjectId(filters.gradeId as string);
    if (filters.sectionId)      query.sectionId      = new Types.ObjectId(filters.sectionId as string);
    return AcademicRollNoBatch.find(query);
  },

  // ── Section lookup ────────────────────────────────────────────────

  async findSectionByName(tenantId: string, classId: string, academicYearId: string, name: string) {
    return Section.findOne({ tenantId, classId, academicYearId, name, isActive: true }).lean();
  },

  async listSectionsByGrade(tenantId: string, classId: string, academicYearId: string) {
    return Section.find({ tenantId, classId, academicYearId, isActive: true }).lean();
  },

  async getSectionById(tenantId: string, sectionId: string) {
    return Section.findOne({ tenantId, _id: new Types.ObjectId(sectionId) }).lean();
  },

  // ── StudentPromotionBatch ─────────────────────────────────────────

  async createPromotionBatch(tenantId: string, data: Partial<IStudentPromotionBatch>) {
    return StudentPromotionBatch.create({ ...data, tenantId });
  },

  async findPromotionBatchById(tenantId: string, id: string) {
    return StudentPromotionBatch.findOne({ tenantId, _id: new Types.ObjectId(id) });
  },

  async updatePromotionBatch(tenantId: string, id: string, update: Partial<IStudentPromotionBatch>) {
    return StudentPromotionBatch.findOneAndUpdate(
      { tenantId, _id: new Types.ObjectId(id) },
      { $set: update },
      { new: true },
    );
  },

  async listPromotionBatches(tenantId: string, filters: Record<string, unknown> = {}) {
    const query: Record<string, unknown> = { tenantId };
    if (filters.fromAcademicYearId) query.fromAcademicYearId = new Types.ObjectId(filters.fromAcademicYearId as string);
    if (filters.toAcademicYearId)   query.toAcademicYearId   = new Types.ObjectId(filters.toAcademicYearId as string);
    if (filters.campusId)           query.campusId           = new Types.ObjectId(filters.campusId as string);
    if (filters.fromGradeId)        query.fromGradeId        = new Types.ObjectId(filters.fromGradeId as string);
    if (filters.status)             query.status             = filters.status;
    return StudentPromotionBatch.find(query).sort({ createdAt: -1 });
  },

  // ── StudentPromotionBatchItem ─────────────────────────────────────

  async createPromotionBatchItems(tenantId: string, items: Partial<IStudentPromotionBatchItem>[]) {
    return StudentPromotionBatchItem.insertMany(items.map(i => ({ ...i, tenantId })));
  },

  async updatePromotionBatchItem(tenantId: string, itemId: string, update: Partial<IStudentPromotionBatchItem>) {
    return StudentPromotionBatchItem.findOneAndUpdate(
      { tenantId, _id: new Types.ObjectId(itemId) },
      { $set: update },
      { new: true },
    );
  },

  async listPromotionBatchItems(tenantId: string, batchId: string) {
    return StudentPromotionBatchItem.find({ tenantId, promotionBatchId: new Types.ObjectId(batchId) });
  },

  async listPendingFeeItems(tenantId: string, batchId: string) {
    return StudentPromotionBatchItem.find({
      tenantId,
      promotionBatchId:    new Types.ObjectId(batchId),
      action:              'PROMOTE',
      feeAssignmentStatus: 'PENDING',
    });
  },
};
