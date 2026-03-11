import { AuthContext } from '../../domain/identity/entities';
import { AdmissionsService } from '../../domain/admissions/admissions-service';

export class SubmitApplication {
  static async execute(ctx: AuthContext, id: string) {
    // 1. Submit (Domain Logic enforces rules)
    const result = await AdmissionsService.submitApplication(ctx, id);
    
    // 2. Async Notification
    // emitEvent('Admissions.ApplicationSubmitted', { id, tenantId: ctx.membership!.tenantId });
    
    return result;
  }
}
