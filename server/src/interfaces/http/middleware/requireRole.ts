import { Request, Response, NextFunction } from 'express';

export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const currentUser: any = (req as any).user;

    if (!currentUser) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthenticated' } });
      return;
    }

    const tenantRole: string = (req as any).auth?.tenant_role ?? '';
    if (tenantRole === 'ORG_OWNER' || tenantRole === 'ORG_ADMIN') {
      return next();
    }

    if (!allowedRoles.includes(currentUser.role)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: `Role '${currentUser.role}' is not authorized for this resource.` },
      });
      return;
    }

    next();
  };
};
