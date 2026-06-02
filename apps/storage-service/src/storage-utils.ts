export function parseEvent(event: Record<string, unknown>) {
  if (event.info) {
    const info = event.info as Record<string, string>;
    return { operation: info.fieldName, args: (event.arguments ?? {}) as Record<string, unknown> };
  }
  const method = event.httpMethod as string;
  const path = event.path as string;
  const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body ?? {}) as Record<string, unknown>;
  const params = (event.pathParameters ?? {}) as Record<string, string>;
  return { operation: `${method}:${path}`, args: { ...body, ...params } };
}

export function buildKey(tenantId: string, folder: string, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${tenantId}/${folder}/${Date.now()}-${safeName}`;
}

export function ensureTenantPrefix(key: string, tenantId: string) {
  if (!key.startsWith(`${tenantId}/`)) {
    throw new Error('FORBIDDEN');
  }
}
