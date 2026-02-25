import serverless from 'serverless-http';
import { app } from './main';

export const handler = serverless(app);
