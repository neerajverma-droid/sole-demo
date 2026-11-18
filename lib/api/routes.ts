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
  /** A client arriving from an accountant's (SPM) invite email. */
  spmReferral: {
    /** The signed-in client's own invite details, for the onboarding prefill. */
    me: "/spm-referral/me",
    /** Public sign-up that also records the referral. */
    signup: "/spm-referral/signup",
  },
  /** A client whose accountant set up and paid for their account (integration partner, F6). */
  partnerReferral: {
    /** What the set-password page shows, from the emailed one-time token. */
    activateLookup: "/partner-referral/activate/lookup",
    /** Set the password, verify the email and sign in. */
    activate: "/partner-referral/activate",
  },
  demo: {
    login: "/demo/login",
    heartbeat: "/demo/heartbeat",
  },
} as const;
