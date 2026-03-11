import { resolveContext } from '../context';
import { StudentService } from '../../../domain/students/student-service';
import { ConversionService } from '../../../application/students/ConversionService';

export const handler = async (event: any) => {
  const { fieldName, arguments: args, identity } = event;
  const ctx = await resolveContext(identity);

  console.log(`[StudentResolver] ${fieldName}`);

  switch (fieldName) {
    case 'listStudents':
      return {
        items: await StudentService.listStudents(ctx, args.filter),
        nextToken: null
      };
    case 'convertApplicationToStudent':
      return ConversionService.convertToStudent(ctx, args.applicationId);
    default:
      throw new Error(`Unknown field: ${fieldName}`);
  }
};
