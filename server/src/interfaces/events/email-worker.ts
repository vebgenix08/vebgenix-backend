import { SQSEvent } from 'aws-lambda';

export const handler = async (event: SQSEvent) => {
  console.log(`Processing ${event.Records.length} email records`);
  
  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      // EventBridge wraps detail in 'detail'
      const detail = body.detail || body;
      
      console.log('Sending email for:', detail);
      // TODO: Use AWS SES v3 client
    } catch (err) {
      console.error('Failed to process record', record.messageId, err);
      // Throwing error triggers SQS retry/DLQ
      throw err;
    }
  }
};
