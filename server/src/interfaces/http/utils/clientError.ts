export function toClientErrorMessage(
  error: unknown,
  fallbackMessage = "Request failed",
): string {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as any).message || "")
      : "";

  if (!message) {
    return fallbackMessage;
  }

  if (
    message.includes("Invalid `prisma.") ||
    message.includes("Raw query failed") ||
    message.includes("PrismaClient") ||
    message.includes("premature end of input") ||
    message.includes("syntax error at or near")
  ) {
    return fallbackMessage;
  }

  return message;
}
