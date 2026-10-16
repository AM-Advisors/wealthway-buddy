/**
 * Passkey (WebAuthn) two-step sign-in is switched off on the hosted sign-in service,
 * so enrolling one always fails. Hide every "add passkey" option until the service
 * supports it; authenticator apps remain the second step. Existing passkeys (if any)
 * can still be used to verify.
 */
export const PASSKEY_ENROLLMENT_AVAILABLE = false;

export const canEnrollPasskey = () =>
  PASSKEY_ENROLLMENT_AVAILABLE && typeof window !== "undefined" && !!window.PublicKeyCredential;
