import { AuthContext } from './entities';
import { AppError } from '../shared/errors';
import { getPrisma, runWithTenantContext } from '../../infrastructure/prisma/client';
import { IdentityService } from './services';
import * as crypto from 'crypto';
import { EmailService } from '../../infrastructure/email/email-service';
import { generateInviteOtp } from './invite-otp';
import bcrypt from "bcryptjs";
import { publishEventBridgeEvent } from "../../infrastructure/aws/eventbridge";

export class InviteService {
  
  static async inviteStaff(
    ctx: AuthContext,
    input: {
      email: string;
      fullName: string;
      roleIds: string[];
      campusIds?: string[];
      allCampuses?: boolean;
    }
  ) {
    IdentityService.authorize(ctx, 'staff.invite');
    const tenantId = ctx.membership!.tenantId;
    const email = input.email.toLowerCase().trim();

    const result = await runWithTenantContext(tenantId, ctx.user.id, async (db) => {
      let authUser = await db.authUser.findUnique({ where: { email } });

      if (!authUser) {
        authUser = await db.authUser.create({
          data: {
            email,
            status: 'ACTIVE',
          }
        });
      }

      const existingMembership = await db.tenantMembership.findFirst({
        where: {
          userId: authUser.id,
          tenantId
        }
      });

      if (existingMembership) {
        if (existingMembership.status === 'ACTIVE') {
          throw new AppError('ALREADY_MEMBER', 'User is already a member of this tenant');
        }
      }

      const profile = await db.profile.create({
        data: {
          tenantId,
          email,
          fullName: input.fullName,
          isActive: true,
          allCampusesAccess: input.allCampuses ?? false,
          campusAccess: {
            create: (input.campusIds || []).map(cid => ({ campusId: cid, tenantId }))
          }
        }
      });

      await db.userProfileLink.create({
        data: { userId: authUser!.id, profileId: profile.id }
      });

      const membership = await db.tenantMembership.create({
        data: {
          userId: authUser!.id,
          tenantId,
          primaryProfileId: profile.id,
          status: 'INVITED',
          invitedByUserId: ctx.user.id,
          invitedAt: new Date(),
          campusScope: input.allCampuses ? 'ALL' : 'SCHOOL',
          memberRoles: {
            create: input.roleIds.map(rid => ({ tenantId, roleId: rid }))
          }
        }
      });

      const { code, tokenHash } = generateInviteOtp(6);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await db.passwordResetToken.updateMany({
        where: {
          userId: authUser!.id,
          membershipId: membership.id,
          purpose: 'INVITE_SET_PASSWORD',
          usedAt: null,
        },
        data: { usedAt: new Date() },
      });

      await db.passwordResetToken.create({
        data: {
          userId: authUser!.id,
          membershipId: membership.id,
          tenantId,
          purpose: 'INVITE_SET_PASSWORD',
          tokenHash,
          expiresAt
        }
      });

      return {
        success: true,
        membershipId: membership.id,
        authUserId: authUser!.id,
        inviteCode: code,
      };
    });

    await EmailService.sendInviteEmail(email, result.inviteCode, "STAFF", {
      userId: result.authUserId,
    });

    try {
      await publishEventBridgeEvent({
        detailType: "CognitoProvisionRequested",
        source: "vebgenix.identity",
        detail: {
          authUserId: result.authUserId,
          membershipId: result.membershipId,
          tenantId,
          email,
          roleIds: input.roleIds,
          invitedByUserId: ctx.user.id,
        },
      });
    } catch (e) {
      console.error("[InviteService] EventBridge publish failed:", e);
    }

    return { success: true, membershipId: result.membershipId };
  }

  static async acceptInvite(token: string, password?: string) {
    const prisma = await getPrisma();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const inviteRecord = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        purpose: 'INVITE_SET_PASSWORD',
        expiresAt: { gt: new Date() },
        usedAt: null
      },
      select: {
        id: true,
        userId: true,
        membershipId: true,
        tenantId: true,
      },
    });

    if (!inviteRecord || !inviteRecord.membershipId) {
      throw new AppError('INVALID_TOKEN', 'Invite token is invalid or expired');
    }

    const membershipId = inviteRecord.membershipId;
    const now = new Date();

    const tenantId =
      inviteRecord.tenantId ??
      (await prisma.tenantMembership.findUnique({
        where: { id: membershipId },
        select: { tenantId: true },
      }))?.tenantId;

    if (!tenantId) {
      throw new AppError('INVALID_TOKEN', 'Invite token is missing tenant context');
    }

    const result = await runWithTenantContext(tenantId, inviteRecord.userId, async (db) => {
      const tokenRow = await db.passwordResetToken.findFirst({
        where: {
          id: inviteRecord.id,
          tokenHash,
          purpose: 'INVITE_SET_PASSWORD',
          expiresAt: { gt: now },
          usedAt: null,
        },
        select: { id: true },
      });

      if (!tokenRow) {
        throw new AppError('INVALID_TOKEN', 'Invite token is invalid or expired');
      }

      const membership = await db.tenantMembership.findUnique({
        where: { id: membershipId },
        select: { id: true, userId: true },
      });

      if (!membership || membership.userId !== inviteRecord.userId) {
        throw new AppError('INVALID_TOKEN', 'Invite token is invalid or expired');
      }

      const user = await db.authUser.findUnique({
        where: { id: inviteRecord.userId },
        select: { id: true, email: true, passwordHash: true },
      });

      if (!user) {
        throw new AppError('INVALID_TOKEN', 'Invite token is invalid or expired');
      }

      if (password && !user.passwordHash) {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        await db.authUser.update({
          where: { id: inviteRecord.userId },
          data: { passwordHash },
        });
      }

      await db.tenantMembership.update({
        where: { id: membershipId },
        data: {
          status: 'ACTIVE',
          activatedAt: now
        }
      });

      await db.passwordResetToken.update({
        where: { id: inviteRecord.id },
        data: { usedAt: now }
      });

      return { email: user.email, isExistingUser: !!user.passwordHash };
    });

    return { success: true, email: result.email, isExistingUser: result.isExistingUser };
  }
}
