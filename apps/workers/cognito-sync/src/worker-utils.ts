export function getUserAttributes(event: { request: { userAttributes: Record<string, string> } }) {
  return event.request.userAttributes;
}
