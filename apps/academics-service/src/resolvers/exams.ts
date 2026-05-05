import { AcademicsRepo, Exam } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

export async function resolveExams(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listExams':
      return AcademicsRepo.listExams(tenantId, (args.filter ?? {}) as Record<string, unknown>);

    case 'getExam':
      return AcademicsRepo.findExamById(tenantId, args.id as string);

    case 'createExam': {
      authorize(ctx, 'academics.exams.update');
      const input = (args.input as Record<string, unknown>) ?? args;
      return AcademicsRepo.createExam(tenantId, input as object);
    }

    case 'updateExam':
    case 'PATCH:/api/admin/exams/:id': {
      authorize(ctx, 'academics.exams.update');
      const input = (args.input as Record<string, unknown>) ?? args;
      return Exam.findOneAndUpdate({ tenantId, _id: args.id }, { $set: input }, { new: true }).lean();
    }

    case 'deleteExam':
    case 'DELETE:/api/admin/exams/:id':
      authorize(ctx, 'academics.exams.delete');
      return Exam.findOneAndDelete({ tenantId, _id: args.id }).lean();

    case 'enterMarks':
    case 'submitMarks':
      return AcademicsRepo.addMarksEntry(
        tenantId,
        (args.examId ?? args.id) as string,
        args as object,
      );

    case 'publishResults':
      return AcademicsRepo.publishExam(tenantId, args.id as string, ctx.membership!.profileId);

    case 'listResults':
      return AcademicsRepo.listExams(tenantId, {
        status: 'RESULTS_PUBLISHED',
        ...((args.filter as object) ?? {}),
      });

    case 'getExamResults':
    case 'GET:/api/admin/exams/:examId/results': {
      const exam = await AcademicsRepo.findExamById(tenantId, (args.examId ?? args.id) as string);
      if (!exam) throw new AppError('NOT_FOUND', 'Exam not found');
      return exam;
    }

    case 'getExamStats':
    case 'GET:/api/admin/exams/:id/stats': {
      authorize(ctx, 'academics.exams.read');
      const examId = (args.examId ?? args.id) as string;
      const exam   = await AcademicsRepo.findExamById(tenantId, examId);
      if (!exam) throw new AppError('NOT_FOUND', 'Exam not found');
      const e       = exam as unknown as Record<string, unknown>;
      const marks   = (e.marksEntries as Array<Record<string, unknown>>) ?? [];
      const scores  = marks.map(m => Number(m.marksObtained ?? 0)).filter(v => v > 0);
      const passMark  = (e.passMark as number) ?? 35;
      const submitted = marks.filter(m => m.marksObtained != null).length;
      const average   = scores.length
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 0;
      return {
        totalStudents: marks.length,
        submitted,
        pending:   marks.length - submitted,
        average:   Math.round(average * 100) / 100,
        highest:   scores.length ? Math.max(...scores) : 0,
        lowest:    scores.length ? Math.min(...scores) : 0,
        passCount: scores.filter(s => s >= passMark).length,
        failCount: scores.filter(s => s < passMark).length,
      };
    }

    case 'getMarksStatus':
    case 'GET:/api/admin/exams/:id/marks-status': {
      authorize(ctx, 'academics.exams.read');
      const examId = (args.examId ?? args.id) as string;
      const exam   = await AcademicsRepo.findExamById(tenantId, examId);
      if (!exam) throw new AppError('NOT_FOUND', 'Exam not found');
      const marks = ((exam as unknown as Record<string, unknown>).marksEntries as Array<Record<string, unknown>>) ?? [];
      return {
        examId,
        totalEntries: marks.length,
        submitted:    marks.filter(m => m.marksObtained !== undefined).length,
        entries:      marks.map(m => ({
          studentId:     m.studentId,
          marksObtained: m.marksObtained,
          grade:         m.grade,
          isSubmitted:   m.marksObtained != null,
        })),
      };
    }

    default:
      return undefined;
  }
}
