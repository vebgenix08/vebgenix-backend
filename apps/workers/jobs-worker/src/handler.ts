import { SQSEvent, SQSRecord } from 'aws-lambda';
import { bootstrapDB, ensureDB, AcademicsRepo } from '@vebgenix/db';

interface Job {
  type: 'GENERATE_REG_NUMBER' | 'GENERATE_EMPLOYEE_CODE' | 'GENERATE_INVOICE_NUMBER';
  tenantId: string;
  entityId: string;
  payload?: Record<string, unknown>;
}


async function processJob(job: Job): Promise<void> {
  await ensureDB();
  switch (job.type) {
    case 'GENERATE_REG_NUMBER': {
      const regNumber = `REG-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
      await AcademicsRepo.updateStudent(job.tenantId, job.entityId, { registrationNumber: regNumber });
      console.log(`[jobs-worker] Generated reg number ${regNumber} for student ${job.entityId}`);
      break;
    }
    default:
      console.warn(`[jobs-worker] Unknown job type: ${job.type}`);
  }
}

async function processRecord(record: SQSRecord): Promise<void> {
  const job: Job = JSON.parse(record.body);
  await processJob(job);
}

export const handler = async (event: SQSEvent, context: Record<string, unknown>): Promise<void> => {
  bootstrapDB(context);
  const results = await Promise.allSettled(event.Records.map(processRecord));
  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length > 0) {
    console.error(`[jobs-worker] ${failed.length} jobs failed:`, failed);
    throw new Error(`${failed.length} jobs failed`);
  }
};
