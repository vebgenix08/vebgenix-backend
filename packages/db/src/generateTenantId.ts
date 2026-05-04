/**
 * generateTenantId
 *
 * Produces a human-readable, prefixed, collision-resistant tenant identifier.
 *
 * Format:   <prefix>_<8 random alphanumeric chars>
 * Examples: inst_a3f9k2xb   org_7m1pq4yz
 *
 * Prefix is derived from the institution type:
 *   'school'      → schl_
 *   'college'     → clg_
 *   'university'  → univ_
 *   'institute'   → inst_   (default)
 *   anything else → org_
 *
 * The suffix is 8 characters from a 36-char alphabet (a-z 0-9), giving
 * ~2.8 trillion combinations per prefix — sufficient for a multi-tenant SaaS
 * without a central sequence table.
 *
 * Usage:
 *   const tenantId = generateTenantId('school');  // → "schl_4r7m2kpx"
 *   const tenantId = generateTenantId();           // → "inst_9b3xq1zm"
 */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SUFFIX_LENGTH = 8;

const PREFIX_MAP: Record<string, string> = {
  school:     'schl',
  college:    'clg',
  university: 'univ',
  institute:  'inst',
  org:        'org',
};

function randomSuffix(): string {
  let result = '';
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    result += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return result;
}

export function generateTenantId(type?: string): string {
  const normalized = (type ?? 'institute').toLowerCase().trim();
  const prefix     = PREFIX_MAP[normalized] ?? 'org';
  return `${prefix}_${randomSuffix()}`;
}

/**
 * Validate a tenant ID matches the expected format.
 * Useful in middleware / resolver guards before querying the DB.
 */
export function isValidTenantId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  return /^[a-z]{2,6}_[a-z0-9]{8}$/.test(id);
}
