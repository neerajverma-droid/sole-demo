/**
 * Backend endpoints, as paths relative to API_BASE.
 *
 * Mirrors sole-webapp's config/apiRoutes.js for the auth surface — same paths,
 * same contracts — so the two apps cannot drift on what a sign-in is.
 */
export const apiRoutes = {
  auth: {
    /** Registers this browser. Every auth call is device-bound. */
    registerDevice: "/v1/device/register",

    login: "/auth/login",
    signUp: "/auth/signup",
    logout: "/auth/logout",

    /** Passwordless sign-in: one endpoint sends the code, two redeem it. */
    otpRequest: "/auth/otp/request",
    otpVerify: "/auth/otp/verify",

    setPassword: "/auth/set-password",
    forgotPassword: "/auth/forgot-password",
    validateResetToken: "/auth/password-reset/validate",
    resetPassword: "/auth/reset-password",

    profile: "/auth/profile",
    refresh: "/auth/refresh",
    refreshToken: "/auth/refresh-token",

    verifyEmail: "/auth/verify-email",
    resendVerification: "/auth/resend-verification",
    verificationStatus: "/auth/verification-status",

    /** Full-page redirect; the backend owns the whole OAuth handshake. */
    oauth: (provider: string) => `/auth/oauth/${provider}`,
  },
  businesses: {
    list: "/businesses",
  },
  demo: {
    /** No credentials: takes a free account from the demo pool. */
    login: "/demo/login",
    /** "This tab is still open", once a minute; 401 once the visit is over. */
    heartbeat: "/demo/heartbeat",
  },
} as const;
