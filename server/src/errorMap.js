// Translates AWS SDK v3 error names into the exact reason codes the
// CloudNova frontend already knows how to display (see REASON_TEXT in
// CloudNovaDashboard.jsx — these strings must match those keys exactly).

export function mapAwsError(err) {
  const name = err?.name || "";
  const message = err?.message || "";

  if (name === "UnrecognizedClientException" || name === "InvalidClientTokenId") {
    return "INVALID_ACCESS_KEY";
  }
  if (name === "SignatureDoesNotMatch") {
    return "SECRET_KEY_INCORRECT";
  }
  if (
    name === "ExpiredToken" ||
    name === "ExpiredTokenException" ||
    name === "TokenRefreshRequired" ||
    name === "RequestExpired"
  ) {
    return "SESSION_EXPIRED";
  }
  if (
    name === "OptInRequired" ||
    name === "PendingVerification" ||
    name === "SubscriptionRequiredException"
  ) {
    return "ACCOUNT_PENDING";
  }
  if (
    name === "AccessDenied" ||
    name === "AccessDeniedException" ||
    name === "UnauthorizedOperation" ||
    name === "AuthorizationError"
  ) {
    return "IAM_MISSING_READONLY";
  }
  if (name === "AuthFailure") {
    return "INVALID_ACCESS_KEY";
  }
  if (
    ["ENOTFOUND", "ETIMEDOUT", "ECONNREFUSED", "NetworkingError", "TimeoutError"].includes(name) ||
    /ENOTFOUND|ETIMEDOUT|ECONNREFUSED|network/i.test(message)
  ) {
    return "NETWORK_UNAVAILABLE";
  }
  return "UNKNOWN";
}
