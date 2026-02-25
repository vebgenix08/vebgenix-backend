
import { Request, Response, NextFunction } from 'express';
import { supabase } from '../../../infrastructure/supabase/client';

export interface PlatformUser {
  id: string;
  email: string;
  role: 'SUPER_ADMIN';
}

declare global {
  namespace Express {
    interface Request {
      platformUser?: PlatformUser;
    }
  }
}

export const requireSuperAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // 1. Verify User with Supabase Auth
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // 2. Verify Platform User (Super Admin)
    const { data: platformUser, error: platformError } = await supabase
      .from('platform_users')
      .select('*')
      .eq('id', user.id)
      .eq('role', 'SUPER_ADMIN')
      .eq('is_active', true)
      .single();

    if (platformError || !platformUser) {
      console.warn(`Unauthorized platform access attempt by user: ${user.id}`);
      return res.status(403).json({ error: 'Forbidden: Super Admin access required' });
    }

    // 3. Attach to request
    req.platformUser = {
      id: platformUser.id,
      email: platformUser.email,
      role: 'SUPER_ADMIN'
    };

    next();
    return;
  } catch (err) {
    console.error('Platform Auth Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
    return; 
  }
};
