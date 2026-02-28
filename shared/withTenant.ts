export async function withTenant<T>(
  prisma: any,
  tenantId: string,
  userId: string,
  fn: (tx: any) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
    await tx.$executeRawUnsafe(`SET LOCAL app.user_id = '${userId}'`);
    return fn(tx);
  });
}
