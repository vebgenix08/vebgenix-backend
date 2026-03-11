import { resolveContext } from '../context';
import { AcademicService } from '../../../domain/settings/academic-service';
import { TemplateService } from '../../../domain/settings/template-service';

export const handler = async (event: any) => {
  const { fieldName, arguments: args, identity } = event;
  const ctx = await resolveContext(identity);

  console.log(`[SettingsResolver] ${fieldName}`);

  switch (fieldName) {
    case 'createAcademicYear':
      return AcademicService.createAcademicYear(ctx, args.input);
    case 'listAcademicYears':
      return AcademicService.listAcademicYears(ctx);
    case 'createTemplate':
      return TemplateService.createTemplate(ctx, args.input);
    case 'publishTemplateVersion':
      return TemplateService.publishVersion(ctx, args.input);
    case 'listTemplates':
      return TemplateService.listTemplates(ctx, args.type);
    default:
      throw new Error(`Unknown field: ${fieldName}`);
  }
};
