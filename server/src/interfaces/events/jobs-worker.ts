import { SQSEvent } from 'aws-lambda';

export const handler = async (event: SQSEvent) => {
  console.log(`Processing ${event.Records.length} job records`);
  
  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      const detail = body.detail || body;
      const type = body['detail-type'];

      if (type === 'GenerateStudentId') {
        // Logic to generate ID
        console.log('Generating ID for student', detail.studentId);
      }
    } catch (err) {
      console.error('Failed to process job', record.messageId, err);
      throw err;
    }
  }
};
