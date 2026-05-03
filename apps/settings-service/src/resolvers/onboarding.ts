import { Tenant, Profile } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { Types } from 'mongoose';
import type { AuthContext } from '@vebgenix/auth';

export async function resolveOnboarding(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  _tenantId: string,
): Promise<unknown> {
  switch (operation) {

    case 'createFirstAdmin':
    case 'POST:/api/platform/tenants/:id/first-admin': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const tid    = (args.id ?? args.tenantId) as string;
      const tenant = await Tenant.findById(tid).lean();
      if (!tenant) throw new AppError('NOT_FOUND', 'Tenant not found');
      // Create Cognito user with ADMIN group
      const { AdminCreateUserCommand, AdminAddUserToGroupCommand, CognitoIdentityProviderClient } =
        await import('@aws-sdk/client-cognito-identity-provider');
      const cognito = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION });
      const email   = args.email as string;
      const name    = args.name  as string;
      await cognito.send(new AdminCreateUserCommand({
        UserPoolId:             process.env.COGNITO_USER_POOL_ID,
        Username:               email,
        DesiredDeliveryMediums: ['EMAIL'],
        UserAttributes: [
          { Name: 'email',           Value: email   },
          { Name: 'name',            Value: name    },
          { Name: 'custom:tenantId', Value: tid     },
          { Name: 'custom:role',     Value: 'ADMIN' },
          { Name: 'email_verified',  Value: 'true'  },
        ],
      }));
      await cognito.send(new AdminAddUserToGroupCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username:   email,
        GroupName:  'ADMIN',
      }));
      // Create Profile in MongoDB
      const profile = await Profile.create({
        tenantId:    tid,
        email,
        firstName:   (args.firstName as string) ?? name.split(' ')[0],
        lastName:    (args.lastName  as string) ?? name.split(' ').slice(1).join(' '),
        personaRole: 'ADMIN',
        isActive:    true,
        roleAssignments: [{ role: 'ADMIN', assignedAt: new Date() }],
      });
      return { success: true, profileId: profile._id, message: `Admin created. Invite sent to ${email}` };
    }

    case 'finalizeOnboarding':
    case 'finalizeTenant':
    case 'POST:/api/platform/tenants/:id/finalize': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const id = (args.id ?? args.tenantId) as string;
      return Tenant.findByIdAndUpdate(
        id,
        { $set: { onboardingComplete: true, isActive: true, finalizedAt: new Date(), finalizedBy: ctx.userId } },
        { new: true }
      ).lean();
    }

    case 'listTenantUsers':
    case 'GET:/api/platform/tenants/:id/users': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const tid    = (args.id ?? args.tenantId) as string;
      const limit  = Math.min((args.limit as number) ?? 50, 200);
      const offset = (args.offset as number) ?? 0;
      return Profile.find({ tenantId: tid, isActive: true })
        .sort({ createdAt: -1 }).skip(offset).limit(limit).lean();
    }

    case 'provisionTenantUser':
    case 'POST:/api/platform/tenants/:id/users': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const tid   = (args.id ?? args.tenantId) as string;
      const { AdminCreateUserCommand, CognitoIdentityProviderClient } =
        await import('@aws-sdk/client-cognito-identity-provider');
      const cognito = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION });
      const email   = args.email as string;
      const role    = (args.role as string) ?? 'STAFF';
      const name    = (args.name as string) ?? email;
      await cognito.send(new AdminCreateUserCommand({
        UserPoolId:             process.env.COGNITO_USER_POOL_ID,
        Username:               email,
        DesiredDeliveryMediums: ['EMAIL'],
        UserAttributes: [
          { Name: 'email',           Value: email },
          { Name: 'name',            Value: name  },
          { Name: 'custom:tenantId', Value: tid   },
          { Name: 'custom:role',     Value: role  },
          { Name: 'email_verified',  Value: 'true' },
        ],
      }));
      const profile = await Profile.create({
        tenantId:    tid,
        email,
        firstName:   name.split(' ')[0],
        lastName:    name.split(' ').slice(1).join(' '),
        personaRole: role,
        isActive:    true,
      });
      return { success: true, profileId: profile._id };
    }

    case 'deleteTenantUser':
    case 'DELETE:/api/platform/tenants/:tenantId/users/:userId': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const tid    = args.tenantId as string;
      const userId = args.userId   as string;
      const profile = await Profile.findOneAndUpdate(
        { tenantId: tid, _id: new Types.ObjectId(userId) },
        { $set: { isActive: false } },
        { new: true }
      ).lean();
      if (!profile) throw new AppError('NOT_FOUND', 'User not found in this tenant');
      return { success: true, message: 'User deactivated from tenant' };
    }

    case 'resendTenantInvite':
    case 'POST:/api/platform/tenants/:id/resend-invite': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const email = args.email as string;
      const { AdminCreateUserCommand, CognitoIdentityProviderClient } =
        await import('@aws-sdk/client-cognito-identity-provider');
      const cognito = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION });
      await cognito.send(new AdminCreateUserCommand({
        UserPoolId:    process.env.COGNITO_USER_POOL_ID,
        Username:      email,
        MessageAction: 'RESEND',
      }));
      return { success: true, message: `Invitation resent to ${email}` };
    }

    default:
      return undefined;
  }
}
