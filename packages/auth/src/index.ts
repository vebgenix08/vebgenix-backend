export type { AuthContext, AuthMembership, AuthRole } from './AuthContext';
// verifyCognitoToken is the canonical name; verifyJwt kept as alias for compatibility
export { verifyCognitoToken, verifyCognitoToken as verifyJwt, extractBearerToken } from './verifyJwt';
export type { CognitoClaims, CognitoClaims as JwtClaims } from './verifyJwt';
export { buildAuthContext } from './buildContext';
export type { CognitoIdentityClaims } from './buildContext';
export { requireAuth, requirePlatformAdmin, resolveContext } from './requireAuth';
