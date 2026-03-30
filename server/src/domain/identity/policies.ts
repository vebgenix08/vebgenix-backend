import { AuthContext, Membership } from './entities';

export const Policies = {
  Identity: {
    /**
     * Can the actor manage (create/update/delete) the target role definition?
     */
    canManageRoleDefinition(ctx: AuthContext, targetRoleIsSystem: boolean): boolean {
      // Only Primary Owner can touch System roles (like "Admin")
      if (targetRoleIsSystem && !ctx.membership?.isPrimaryOwner) return false;
      return true;
    },

    /**
     * Can the actor remove the target member from the tenant?
     */
    canRemoveMember(_ctx: AuthContext, targetMember: Membership): boolean {
      // Primary Owner cannot be removed via normal flows
      if (targetMember.isPrimaryOwner) return false;
      return true;
    }
  }
};
