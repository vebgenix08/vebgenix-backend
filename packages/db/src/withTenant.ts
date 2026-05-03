export interface TenantScope {
  tenantId: string;
  userId: string;
  /** Merges { tenantId } into any query object */
  filter: <T extends object>(query?: T) => T & { tenantId: string };
}

export async function withTenant<T>(
  tenantId: string,
  userId: string,
  fn: (scope: TenantScope) => Promise<T>
): Promise<T> {
  const scope: TenantScope = {
    tenantId,
    userId,
    filter: <T extends object>(query: T = {} as T) => ({ ...query, tenantId }),
  };
  return fn(scope);
}
