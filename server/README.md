# CloudNova backend

This is what makes CloudNova's connection pipeline actually real. It's a
small Express server that holds AWS credentials and makes real AWS SDK v3
calls — the frontend used to simulate all of this; now it calls here.

## What it does for each pipeline step

| Frontend step | Endpoint | Real AWS calls made |
|---|---|---|
| Verify Credentials | `POST /api/aws/verify-credentials` | `STS.GetCallerIdentity` |
| Verify AWS Services | `POST /api/aws/verify-services` | `EC2.DescribeInstances`, `CloudWatch.ListMetrics`, `CloudTrail.DescribeTrails`, `GuardDuty.ListDetectors`, `S3.ListBuckets`, `IAM.GetUser` |
| Fetch Live Data | `POST /api/aws/fetch-data` | `EC2.DescribeInstances`, `EC2.DescribeSecurityGroups`, `CloudWatch.GetMetricStatistics`, `CloudWatchLogs.DescribeLogGroups`, `CloudTrail.LookupEvents`, `GuardDuty.ListFindings`, `S3.ListBuckets`, `AutoScaling.DescribeAutoScalingGroups`, `RDS.DescribeDBInstances` |
| Remediation Agent | `POST /api/aws/remediate` | `EC2.RebootInstances` — **only when `confirm: true`** |

Everything except remediation is read-only. Remediation is the one endpoint
that can change something in your AWS account, so it's built as a two-phase
call: the first call (or any call without `confirm: true`) only returns a
preview of the CLI command and changes nothing. The frontend only sends
`confirm: true` after a human clicks "Confirm & Execute" on the Remediation
Agent card — there is no path in this code where an AWS resource gets
modified without that explicit click.

## Setup

```bash
cd server
npm install
cp .env.example .env
```

Then edit `.env`. You have two options:

### Option A — Secure (recommended)

Put your real AWS credentials directly in `server/.env`:

```
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
```

When these are set, the backend **always uses them** and ignores whatever
the browser's login form sends — your secret key never has to pass through
frontend JavaScript. The login screen's fields become mostly cosmetic in
this mode (you can type anything into them); the backend is the actual
source of truth for which AWS account gets used.

### Option B — Quick local testing

Leave the `AWS_*` variables in `.env` unset. The backend will fall back to
using whatever credentials the CloudNova login screen sends with each
request. This is simpler to get running, but it means your secret key
travels through browser JS and a network request on every check. Only do
this on your own machine, never on anything internet-facing.

## Running it

```bash
npm run dev
```

This starts the API on `http://localhost:4000` (change with `PORT` in
`.env`). Leave it running in its own terminal tab alongside your Vite dev
server.

## Connecting the frontend to it

In your `cloudnova-app` project (not this `server` folder), create/edit
`.env`:

```
VITE_API_BASE_URL=http://localhost:4000
```

Restart the Vite dev server after adding this. With it set, CloudNova will
call this backend for real checks; without it, CloudNova falls back to its
built-in simulation exactly as before — so nothing breaks if you haven't
set the backend up yet.

## IAM permissions you'll need

For the checks to report accurately (not just "AWS SDK works" but genuinely
reflect your account), the credentials you use need at least read access to
EC2, CloudWatch, CloudWatch Logs, CloudTrail, GuardDuty, S3, and IAM
(`GetUser` specifically — if you're using an assumed role rather than an
IAM user, `GetUser` naturally fails with `ValidationError` and CloudNova
treats that as fine, not a permissions problem).

For remediation, the credentials additionally need `ec2:RebootInstances`.
**Scope this narrowly** — don't hand this app admin credentials. A policy
scoped to just `ec2:RebootInstances` on specifically-tagged instances is a
reasonable starting point for anything beyond your own sandbox account.

## What's still not implemented

- Only one remediation action exists for real: `reboot_instance`. The
  Decision Agent's other narrated actions (scaling, killing a process) are
  still descriptive text only — extend `SUPPORTED_ACTIONS` and add a
  matching AWS SDK call in `src/index.js` to wire up more.
- No auth on this API itself — anyone who can reach `http://localhost:4000`
  can call it. Fine for local use; add an auth middleware before deploying
  this anywhere reachable over a network you don't fully trust.
- No rate limiting or request logging beyond method+path (credentials are
  deliberately never logged).
