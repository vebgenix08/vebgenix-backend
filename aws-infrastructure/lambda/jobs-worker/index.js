'use strict';

/**
 * JobsWorkerLambda — SQS batch consumer for background jobs
 *
 * Current jobs:
 *   - GenerateStudentId      → assigns registration number after admission approval
 *   - ExportAdmissionsReport → produces CSV in S3 and notifies requestor
 *   - PurgeExpiredDraftAdmissions → daily cleanup of old DRAFT applications
 *
 * Pattern: same batch-item-failure reporting as EmailWorker.
 * When DB is available, each job uses withTenant() for tenant isolation.
 */
exports.handler = async (event) => {
  const batchItemFailures = [];

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      const payload = body.detail ?? body;
      const jobType = body['detail-type'] ?? payload.jobType ?? 'Unknown';

      console.log(JSON.stringify({ jobType, payload }));
      await runJob(jobType, payload);

    } catch (err) {
      console.error('Failed job record:', record.messageId, err.message);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};

async function runJob(jobType, payload) {
  switch (jobType) {
    case 'GenerateStudentId': {
      // TODO: assign registration number in DB via withTenant()
      const { admissionId, tenantId } = payload;
      console.log(`GenerateStudentId: admissionId=${admissionId} tenantId=${tenantId} — not yet implemented`);
      break;
    }

    case 'ExportAdmissionsReport': {
      // TODO: query applications, write CSV to S3, send download link via SES
      const { tenantId, requestedByUserId } = payload;
      console.log(`ExportAdmissionsReport: tenantId=${tenantId} — not yet implemented`);
      break;
    }

    case 'PurgeExpiredDraftAdmissions': {
      // TODO: delete DRAFT applications older than 90 days
      console.log('PurgeExpiredDraftAdmissions — not yet implemented');
      break;
    }

    default:
      console.warn(`JobsWorker: unknown jobType "${jobType}" — skipping`);
  }
}
