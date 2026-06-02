import { ensureDB, AcademicsRepo } from '@vebgenix/db';
import { buildRegNumber } from './worker-utils';

type Job = {
  type: 'GENERATE_REG_NUMBER' | 'GENERATE_EMPLOYEE_CODE' | 'GENERATE_INVOICE_NUMBER';
  tenantId: string;
  entityId: string;
  payload?: Record<string, unknown>;
};

async function processJob(job: Job): Promise<void> {
  await ensureDB();
  switch (job.type) {
    case 'GENERATE_REG_NUMBER': {
      const regNumber = buildRegNumber();
      await AcademicsRepo.updateStudent(job.tenantId, job.entityId, { registrationNumber: regNumber });
      console.log(`[jobs-worker] Generated reg number ${regNumber} for student ${job.entityId}`);
      break;
    }
    default:
      console.warn(`[jobs-worker] Unknown job type: ${job.type}`);
  }
}

export async function processJobsWorkerRecord(record: { body: string }): Promise<void> {
  const job: Job = JSON.parse(record.body);
  await processJob(job);
}
