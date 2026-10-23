/**
 * Short, user-safe error for a failed outside-service call: service name, what failed and the
 * status code only. Never include the response body, it can contain tokens, IDs or personal data.
 */
export function serviceError(service: string, action: string, status: number | string): Error {
  return new Error(`${service} ${action} failed (status ${status}).`);
}
