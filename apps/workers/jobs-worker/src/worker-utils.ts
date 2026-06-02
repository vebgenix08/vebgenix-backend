export function buildRegNumber() {
  return `REG-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
}
