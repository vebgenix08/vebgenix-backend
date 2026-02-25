import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../../../domain/User';

export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthenticated' } });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: `Role '${req.user.role}' is not authorized for this resource.` },
      });
      return;
    }

    next();
  };

};
