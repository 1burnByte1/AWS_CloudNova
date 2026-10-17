// Decides where AWS credentials for a request come from.
//
// SECURE MODE (recommended): if AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are
// set in this server's own environment (.env), we always use those and
// IGNORE whatever the browser sent — your keys never have to touch
// frontend JavaScript at all.
//
// FALLBACK MODE: if no server-side credentials are configured, we use
// whatever the CloudNova login screen sent in the request body. Fine for
// local, single-user testing; not something to expose beyond your own
// machine, since it means the secret key passes through browser JS.
export function resolveCredentials(reqBody = {}) {
  const hasServerCreds = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;

  if (hasServerCreds) {
    return {
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN || undefined,
      },
      region: process.env.AWS_REGION || reqBody.region,
      source: "server-env",
    };
  }

  return {
    credentials: {
      accessKeyId: reqBody.accessKeyId,
      secretAccessKey: reqBody.secretAccessKey,
      sessionToken: reqBody.sessionToken || undefined,
    },
    region: reqBody.region,
    source: "request-body",
  };
}
