import { resolveContext } from '../context';
import { AdmissionsService } from '../../../domain/admissions/admissions-service';
import { SubmitApplication } from '../../../application/admissions/SubmitApplication';

export const handler = async (event: any) => {
  const { fieldName, arguments: args, identity } = event;
  const ctx = await resolveContext(identity);

  console.log(`[AdmissionsResolver] ${fieldName}`);

  switch (fieldName) {
    case 'createAdmission':
      // Maps to Enquiry creation in new model
      return AdmissionsService.createEnquiry(ctx, {
        ...args.input,
        campusId: 'TODO_RESOLVE_CAMPUS' // Need input.campusId in schema!
      });
    case 'submitAdmission':
      return SubmitApplication.execute(ctx, args.id);
    case 'listAdmissions':
      return {
        edges: (await AdmissionsService.listAdmissions(ctx, args.filter)).map(a => ({
          cursor: a.id,
          node: a
        })),
        pageInfo: { hasNextPage: false } // Simplified pagination
      };
    default:
      throw new Error(`Unknown field: ${fieldName}`);
  }
};
