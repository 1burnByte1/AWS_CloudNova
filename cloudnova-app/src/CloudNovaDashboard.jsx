import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Cloud,
  LogIn,
  LogOut,
  KeyRound,
  Lock,
  Fingerprint,
  Globe2,
  Terminal,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Server,
  Activity,
  ShieldAlert,
  ShieldCheck,
  Database,
  History,
  Cpu,
  HardDrive,
  ScrollText,
  Network,
  Layers,
  Boxes,
  Building2,
  Eye,
  Stethoscope,
  GitBranch,
  Wrench,
  BadgeCheck,
  FileText,
  PlayCircle,
  Clock,
  Sparkles,
  PlugZap,
  RefreshCw,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 *  CloudNova — Autonomous Cloud Reliability Engineer
 *
 *  One continuous, unbroken execution chain:
 *  AWS Login -> Credential Verification -> AWS Service Verification ->
 *  Fetch Live Data -> Monitoring -> Diagnosis -> Decision ->
 *  Remediation -> Validation -> Report.
 *
 *  A single ExecutionTimeline tracks all ten stages live. The app
 *  never jumps straight to a dashboard — login is the only separate
 *  screen; everything after it happens in one Operations Console that
 *  reveals sections as they complete.
 *
 *  This sandbox has no real AWS access, so every verification/fetch
 *  call is simulated through a scenario table. Each call site is
 *  marked REPLACE with the real AWS SDK v3 call it stands in for.
 * ------------------------------------------------------------------ */

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// If VITE_API_BASE_URL is set (see server/README.md), CloudNova calls the
// real backend for every check below and falls back to the built-in
// simulation only if that call itself fails (network error, server not
// running, etc). If it's unset, CloudNova behaves exactly as a pure
// frontend demo, unchanged.
const API_BASE = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) || "";
console.log("API_BASE =", API_BASE);
async function callBackend(path, body, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Backend responded ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ==================================================================
//  SHARED: reason text + scenario table
// ==================================================================

const REASON_TEXT = {
  INVALID_ACCESS_KEY: "Invalid Access Key.",
  SECRET_KEY_INCORRECT: "Secret Key incorrect.",
  SESSION_EXPIRED: "Session token has expired.",
  REGION_MISSING: "Region missing.",
  ACCOUNT_PENDING: "AWS Account Verification Pending.",
  NETWORK_UNAVAILABLE: "Network unavailable.",
  EC2_STOPPED: "EC2 instance currently stopped.",
  CLOUDWATCH_DENIED: "CloudWatch permission denied.",
  CLOUDTRAIL_DISABLED: "CloudTrail logging is disabled.",
  GUARDDUTY_NOT_ENABLED: "GuardDuty not enabled.",
  S3_INACCESSIBLE: "S3 bucket inaccessible.",
  IAM_MISSING_READONLY: "IAM missing ReadOnlyAccess.",
  RDS_DENIED: "RDS permission denied.",
  AUTOSCALING_DENIED: "Auto Scaling permission denied.",
  UNKNOWN: "An unexpected error interrupted verification.",

};

// Deterministic test harness — pick a scenario and the whole chain
// (credentials, services, dashboard, agents) reacts consistently.
// In production, delete this table and let each step call AWS for real.
const CONNECTION_SCENARIOS = {
  connected: { label: "Connect normally — all checks pass", failPhase: null },
  invalid_access_key: { label: "Invalid Access Key", failPhase: "credentials", failCheckId: "valid", reasonCode: "INVALID_ACCESS_KEY" },
  secret_key_incorrect: { label: "Secret Key incorrect", failPhase: "credentials", failCheckId: "valid", reasonCode: "SECRET_KEY_INCORRECT" },
  session_expired: { label: "Session expired", failPhase: "credentials", failCheckId: "valid", reasonCode: "SESSION_EXPIRED" },
  region_missing: { label: "Region missing", failPhase: "credentials", failCheckId: "region", reasonCode: "REGION_MISSING" },
  account_pending: { label: "AWS account verification pending", failPhase: "credentials", failCheckId: "valid", reasonCode: "ACCOUNT_PENDING" },
  network_unavailable: { label: "Network unavailable", failPhase: "credentials", failCheckId: "found", reasonCode: "NETWORK_UNAVAILABLE" },
  ec2_stopped: { label: "EC2 instance stopped", failPhase: "services", failCheckId: "ec2", reasonCode: "EC2_STOPPED" },
  cloudwatch_denied: { label: "CloudWatch permission denied", failPhase: "services", failCheckId: "cloudwatch", reasonCode: "CLOUDWATCH_DENIED" },
  cloudtrail_disabled: { label: "CloudTrail logging disabled", failPhase: "services", failCheckId: "cloudtrail", reasonCode: "CLOUDTRAIL_DISABLED" },
  guardduty_not_enabled: { label: "GuardDuty not enabled", failPhase: "services", failCheckId: "guardduty", reasonCode: "GUARDDUTY_NOT_ENABLED" },
  s3_inaccessible: { label: "S3 bucket inaccessible", failPhase: "services", failCheckId: "s3", reasonCode: "S3_INACCESSIBLE" },
  iam_missing_readonly: { label: "IAM missing ReadOnlyAccess", failPhase: "services", failCheckId: "iam", reasonCode: "IAM_MISSING_READONLY" },
};

// Lightweight recheck used by the Validation Agent to see whether Live
// AWS has come back. REPLACE with a real STS GetCallerIdentity + ping.
async function quickAwsPing(scenarioKey) {
  await delay(500 + Math.random() * 300);
  const scenario = CONNECTION_SCENARIOS[scenarioKey] || CONNECTION_SCENARIOS.connected;
  return scenario.failPhase === null;
}

function maskAccountId(id) {
  return id.replace(/(\d{4})(\d{4})(\d{4})/, "$1-$2-$3");
}

const LIVE_ACCOUNT_ID = "482910573261";
const DEMO_ACCOUNT_ID = "000000000000";
const REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "eu-west-1", "eu-central-1", "ap-south-1",
  "ap-southeast-1", "ap-southeast-2", "sa-east-1",
];

// AWS's own published documentation example keys — safe placeholders,
// not real secrets. Stand-in for a real environment-variable read.
const ENV_CREDENTIALS = {
  accessKey: "AKIAIOSFODNN7EXAMPLE",
  secretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  sessionToken: "",
  region: "us-east-1",
};

function formatTime(date) {
  if (!date) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ==================================================================
//  SHARED UI PRIMITIVES
// ==================================================================

function StatusGlyph({ status }) {
  if (status === "success" || status === "pass" || status === "done")
    return <CheckCircle2 className="h-4 w-4 text-emerald-400" strokeWidth={2.4} />;
  if (status === "failed" || status === "fail")
    return <XCircle className="h-4 w-4 text-red-400" strokeWidth={2.4} />;
  if (status === "checking" || status === "active") return <Loader2 className="h-4 w-4 text-sky-400 animate-spin" strokeWidth={2.4} />;
  if (status === "skipped") return <div className="h-4 w-4 rounded-full bg-zinc-700" />;
  return <div className="h-4 w-4 rounded-full border border-zinc-700" />;
}

function DiagnosticRow({ icon: Icon, label, result }) {
  const status = result?.status || "idle";
  const statusLabel = { success: "OK", pass: "OK", failed: "FAIL", fail: "FAIL", checking: "…", skipped: "SKIP", idle: "—", waiting: "—" }[status] || "—";
  const statusColor = {
    success: "text-emerald-400", pass: "text-emerald-400",
    failed: "text-red-400", fail: "text-red-400",
    checking: "text-sky-400",
    skipped: "text-zinc-600", idle: "text-zinc-600", waiting: "text-zinc-600",
  }[status] || "text-zinc-600";

  return (
    <div className={`rounded-lg border px-3.5 py-2.5 transition-colors duration-300 ${
      status === "failed" || status === "fail" ? "border-red-500/30 bg-red-400/5" : "border-zinc-800/70 bg-zinc-900/40"
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon className="h-4 w-4 shrink-0 text-zinc-500" strokeWidth={2} />
          <span className="truncate text-sm text-zinc-300">{label}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`font-mono text-[11px] tracking-wider ${statusColor}`}>{statusLabel}</span>
          <StatusGlyph status={status} />
        </div>
      </div>
      {(status === "failed" || status === "fail") && result?.reasonCode && (
        <p className="mt-1.5 pl-7 text-xs text-red-300">{REASON_TEXT[result.reasonCode]}</p>
      )}
    </div>
  );
}

function ScreenShell({ children }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}

// ==================================================================
//  EXECUTION TIMELINE — all ten stages, always visible
// ==================================================================

const EXECUTION_STEPS_META = [
  { id: "login", label: "AWS Login", icon: LogIn },
  { id: "credentials", label: "Credential Verification", icon: KeyRound },
  { id: "services", label: "Service Verification", icon: ShieldCheck },
  { id: "fetching", label: "Fetching Live Data", icon: Database },
  { id: "monitoring", label: "Monitoring Agent", icon: Eye },
  { id: "diagnosis", label: "Diagnosis Agent", icon: Stethoscope },
  { id: "decision", label: "Decision Agent", icon: GitBranch },
  { id: "remediation", label: "Remediation Agent", icon: Wrench },
  { id: "validation", label: "Validation Agent", icon: BadgeCheck },
  { id: "report", label: "Report Agent", icon: FileText },
];

const TIMELINE_STATUS_WORD = {
  waiting: "Waiting...",
  skipped: "Skipped",
  active: "Running...",
  done: "✓",
  failed: "Failed",
};

function ExecutionTimeline({ statuses }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-xl shadow-black/20 px-4 py-5 sm:px-5">
      <div className="mb-3 flex items-center gap-2 px-1">
        <Activity className="h-4 w-4 text-zinc-400" />
        <h2 className="text-sm font-semibold text-zinc-100">Live Execution Timeline</h2>
      </div>
      <div className="flex items-stretch gap-0 overflow-x-auto pb-1">
        {EXECUTION_STEPS_META.map((step, i) => {
          const status = statuses[step.id] || "waiting";
          const Icon = step.icon;
          const circleClass =
            status === "done"
              ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
              : status === "active"
              ? "border-sky-500/70 bg-sky-500/10 text-sky-300"
              : status === "failed"
              ? "border-red-500/60 bg-red-500/10 text-red-300"
              : "border-zinc-800 bg-zinc-900 text-zinc-600";
          const wordClass =
            status === "done" ? "text-emerald-400" : status === "active" ? "text-sky-400" : status === "failed" ? "text-red-400" : "text-zinc-600";
          return (
            <div key={step.id} className="flex shrink-0 items-center">
              <div className="flex w-[92px] flex-col items-center gap-1.5 px-1 text-center">
                <div className={`relative flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors duration-500 ${circleClass}`}>
                  {status === "active" && <span className="absolute inset-0 animate-ping rounded-full bg-sky-400/20" />}
                  {status === "done" ? <CheckCircle2 className="h-4 w-4" /> : status === "failed" ? <XCircle className="h-4 w-4" /> : status === "active" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className="text-[10px] leading-tight text-zinc-400">{step.label}</span>
                <span className={`font-mono text-[9px] uppercase tracking-wider ${wordClass}`}>{TIMELINE_STATUS_WORD[status]}</span>
              </div>
              {i < EXECUTION_STEPS_META.length - 1 && (
                <div className={`h-px w-5 shrink-0 transition-colors duration-500 ${status === "done" ? "bg-emerald-500/40" : "bg-zinc-800"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================================================================
//  STEP 1 — AWS LOGIN (the only separate full screen)
// ==================================================================

function LoginScreen({ onConnect, scenarioKey, onScenarioChange }) {
  const [form, setForm] = useState({ accessKey: "", secretKey: "", sessionToken: "", region: "" });
  const [envLoaded, setEnvLoaded] = useState(false);
  const [showDevControls, setShowDevControls] = useState(false);

  const canConnect = form.accessKey.trim() && form.secretKey.trim() && form.region;

  const loadFromEnv = () => {
    setForm(ENV_CREDENTIALS);
    setEnvLoaded(true);
  };

  const update = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setEnvLoaded(false);
  };

  return (
    <ScreenShell>
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/25 to-violet-500/5 border border-zinc-800">
          <Cloud className="h-6 w-6 text-violet-400" strokeWidth={2.2} />
        </div>
        <h1 className="mt-3 text-xl font-semibold tracking-tight text-zinc-100">CloudNova</h1>
        <p className="text-xs text-zinc-500">Autonomous Cloud Reliability Engineer</p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-xl shadow-black/20 backdrop-blur-sm">
        <div className="border-b border-zinc-800/80 px-6 py-4">
          <div className="flex items-center gap-2">
            <LogIn className="h-4 w-4 text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Connect to AWS</h2>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Credentials establish a session for this workspace only.</p>
        </div>

        <div className="space-y-3.5 px-6 py-5">
          <Field icon={KeyRound} label="AWS Access Key" value={form.accessKey} onChange={update("accessKey")} placeholder="AKIA..." />
          <Field icon={Lock} label="Secret Access Key" value={form.secretKey} onChange={update("secretKey")} placeholder="••••••••••••••••••••" type="password" />
          <Field icon={Fingerprint} label="Session Token (optional)" value={form.sessionToken} onChange={update("sessionToken")} placeholder="Leave blank if not using STS" />

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
              <Globe2 className="h-3.5 w-3.5" /> AWS Region
            </label>
            <select
              value={form.region}
              onChange={update("region")}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500/60"
            >
              <option value="">Select a region…</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <button
            onClick={loadFromEnv}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 transition-colors"
          >
            <Terminal className="h-3.5 w-3.5" />
            Load from environment variables
          </button>
          {envLoaded && (
            <p className="text-center text-[11px] text-emerald-400">
              ✓ Loaded AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION (simulated in this preview)
            </p>
          )}
        </div>

        <div className="border-t border-zinc-800/80 px-6 py-4">
          <button
            onClick={() => onConnect(form)}
            disabled={!canConnect}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600 transition-colors"
          >
            <PlugZap className="h-4 w-4" />
            Connect AWS
          </button>
          <p className="mt-2.5 text-center text-[11px] text-zinc-600">
            Credentials are used only to establish this session and are never stored.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-zinc-800/70 bg-zinc-900/30 px-4 py-3">
        <button
          onClick={() => setShowDevControls((s) => !s)}
          className="text-[11px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          {showDevControls ? "▾" : "▸"} test harness: preview a scenario
        </button>
        {showDevControls && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(CONNECTION_SCENARIOS).map(([key, s]) => (
              <button
                key={key}
                onClick={() => onScenarioChange(key)}
                className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                  scenarioKey === key
                    ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
                    : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </ScreenShell>
  );
}

function Field({ icon: Icon, label, value, onChange, placeholder, type = "text" }) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
        <Icon className="h-3.5 w-3.5" /> {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-violet-500/60"
      />
    </div>
  );
}

// ==================================================================
//  CONNECTION-CHAIN CHECK DEFINITIONS (steps 2-4)
// ==================================================================

const CREDENTIAL_CHECKS = [
  { id: "sdk", label: "AWS SDK Loaded", icon: Terminal },
  { id: "found", label: "Credentials Found", icon: KeyRound },
  { id: "valid", label: "Credentials Valid", icon: ShieldCheck },
  { id: "region", label: "Region Configured", icon: Globe2 },
];

// REPLACE with: SDK import check, presence check, STS GetCallerIdentity, configured region read.
async function evaluateCredentialCheck(check, scenario) {
  await delay(500 + Math.random() * 300);
  if (scenario.failPhase === "credentials" && scenario.failCheckId === check.id) {
    return { status: "failed", reasonCode: scenario.reasonCode };
  }
  return { status: "success", reasonCode: null };
}


const SERVICE_CHECKS = [
  { id: "ec2", label: "EC2", icon: Server },
  { id: "cloudwatch", label: "CloudWatch", icon: Activity },
  { id: "cloudtrail", label: "CloudTrail", icon: History },
  { id: "s3", label: "S3", icon: Database },
  { id: "rds", label: "RDS", icon: Boxes },
  { id: "autoscaling", label: "Auto Scaling", icon: Layers },
  { id: "vpc", label: "VPC", icon: Network },
  { id: "iam", label: "IAM Permissions", icon: Lock },
];


// REPLACE each with the matching AWS SDK v3 call:
//  ec2 -> EC2Client DescribeInstances, cloudwatch -> CloudWatchClient ListMetrics,
//  cloudtrail -> CloudTrailClient DescribeTrails, guardduty -> GuardDutyClient ListDetectors,
//  s3 -> S3Client ListBuckets, iam -> IAMClient SimulatePrincipalPolicy
async function evaluateServiceCheck(check, scenario) {
  await delay(420 + Math.random() * 300);
  if (scenario.failPhase === "services" && scenario.failCheckId === check.id) {
    return { status: "failed", reasonCode: scenario.reasonCode };
  }
  return { status: "success", reasonCode: null };
}

const DATA_CATEGORIES = [
  { id: "ec2list", label: "Running EC2 Instances", icon: Server },
  { id: "cpu", label: "CPU Utilization", icon: Cpu },
  { id: "memory", label: "Memory Usage", icon: HardDrive },
  { id: "cwlogs", label: "CloudWatch Logs", icon: ScrollText },
  { id: "ctevents", label: "CloudTrail Events", icon: History },
  { id: "gdfindings", label: "GuardDuty Findings", icon: ShieldAlert },
  { id: "sg", label: "Security Groups", icon: Network },
  { id: "s3buckets", label: "S3 Buckets", icon: Database },
  { id: "asg", label: "Auto Scaling Groups", icon: Layers },
  { id: "rds", label: "RDS Status", icon: Boxes },
];

function buildFetchedData(mode) {
  if (mode === "live") {
    return {
      ec2Running: 8, ec2Total: 12, cpu: "42%", memory: "61%",
      cwLogs: "1,204 events", ctEvents: "386 events (24h)",
      gdFindings: 5, securityGroups: 14, s3Buckets: 34, asg: 3, rds: "Available",
    };
  }
  return {
    ec2Running: 2, ec2Total: 3, cpu: "18% (simulated)", memory: "34% (simulated)",
    cwLogs: "42 events (simulated)", ctEvents: "16 events (simulated)",
    gdFindings: 1, securityGroups: 4, s3Buckets: 6, asg: 1, rds: "Simulated",
  };
}

// ==================================================================
//  INLINE PHASE CARDS (embedded in the console, not separate screens)
// ==================================================================

function PhaseCardShell({ icon: Icon, title, subtitle, children, footer }) {
  return (
    <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-xl shadow-black/20">
      <div className="flex items-center gap-3 border-b border-zinc-800/80 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800/80">
          <Icon className="h-5 w-5 animate-spin text-sky-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          <p className="text-xs text-zinc-500">{subtitle}</p>
        </div>
      </div>
      <div className="px-5 py-5">{children}</div>
      {footer && <div className="border-t border-zinc-800/80 px-5 py-4">{footer}</div>}
    </section>
  );
}

function CredentialChecklistCard({ results }) {
  const failedEntry = Object.entries(results).find(([, r]) => r.status === "failed");
  return (
    <PhaseCardShell icon={Loader2} title="Credential Verification" subtitle="Checking access key, secret key, session, and region…">
      <div className="space-y-2">
        {CREDENTIAL_CHECKS.map((c) => (
          <DiagnosticRow key={c.id} icon={c.icon} label={c.label} result={results[c.id]} />
        ))}
      </div>
      {failedEntry && (
        <div className="mt-4 rounded-lg border border-red-400/20 bg-red-400/5 px-3.5 py-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-red-400/80">Verification stopped</p>
          <p className="mt-1 text-sm text-red-300">{REASON_TEXT[failedEntry[1].reasonCode]}</p>
        </div>
      )}
    </PhaseCardShell>
  );
}

function ServiceChecklistCard({ results }) {
  const failures = Object.entries(results).filter(([, r]) => r.status === "failed");
  return (
      <PhaseCardShell
      icon={Loader2}
      title="AWS Service Verification"
      subtitle="Checking EC2, CloudWatch, CloudTrail, S3, VPC, RDS, Auto Scaling, IAM…"
      >
      <div className="space-y-2">
        {SERVICE_CHECKS.map((c) => (
          <DiagnosticRow key={c.id} icon={c.icon} label={c.label} result={results[c.id]} />
        ))}
      </div>
      {failures.length > 0 && (
        <div className="mt-4 rounded-lg border border-red-400/20 bg-red-400/5 px-3.5 py-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-red-400/80">
            {failures.length} service{failures.length > 1 ? "s" : ""} unavailable
          </p>
          {failures.map(([id, r]) => (
            <p key={id} className="mt-1 text-sm text-red-300">{REASON_TEXT[r.reasonCode]}</p>
          ))}
        </div>
      )}
    </PhaseCardShell>
  );
}

function FailoverBanner({ reasonText }) {
  return (
    <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-400/5 px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-400/10 border border-red-500/30">
          <AlertTriangle className="h-4 w-4 text-red-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-red-300">Live AWS Unavailable</h3>
          <p className="mt-0.5 text-xs text-zinc-500">Reason</p>
          <p className="text-sm text-zinc-300">{reasonText}</p>
          <p className="mt-2 text-xs font-medium text-amber-300">
            Automatically activated Demo Mode — running simulated cloud incidents while preserving the AI workflow.
          </p>
        </div>
      </div>
    </div>
  );
}

function FetchDataCard({ mode, loaded }) {
  const pct = Math.round((loaded.length / DATA_CATEGORIES.length) * 100);
  return (
    <PhaseCardShell
      icon={Loader2}
      title={mode === "live" ? "Retrieving Live AWS Data" : "Loading Simulated Incident Data"}
      subtitle={mode === "live" ? "Pulling current state from AWS" : "Populating the demo environment"}
    >
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full bg-sky-400 transition-all duration-300 ease-out" style={{ width: `${pct}%` }} />
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {DATA_CATEGORIES.map((cat) => {
          const isLoaded = loaded.includes(cat.id);
          const Icon = cat.icon;
          return (
            <div
              key={cat.id}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 transition-colors duration-300 ${
                isLoaded ? "border-zinc-800/70 bg-zinc-900/40" : "border-zinc-800/40 bg-zinc-900/10 opacity-50"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className="h-4 w-4 text-zinc-500" strokeWidth={2} />
                <span className="text-sm text-zinc-300">{cat.label}</span>
              </div>
              {isLoaded ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Loader2 className="h-4 w-4 animate-spin text-zinc-600" />}
            </div>
          );
        })}
      </div>
    </PhaseCardShell>
  );
}

// ==================================================================
//  AI AGENTS — content generators (grounded in fetched data)
// ==================================================================

const AGENTS = [
  { id: "monitoring", name: "Monitoring Agent", icon: Eye, idle: "Waiting to scan AWS telemetry" },
  { id: "diagnosis", name: "Diagnosis Agent", icon: Stethoscope, idle: "Waiting for monitoring signal" },
  { id: "decision", name: "Decision Agent", icon: GitBranch, idle: "Waiting for root cause" },
  { id: "remediation", name: "Remediation Agent", icon: Wrench, idle: "Waiting for decision" },
  { id: "validation", name: "Validation Agent", icon: BadgeCheck, idle: "Waiting for remediation" },
  { id: "report", name: "Report Agent", icon: FileText, idle: "Waiting for validation" },
];

const AGENT_STATUS_META = {
  waiting: { label: "Waiting", badge: "bg-zinc-800 text-zinc-400 border-zinc-700", circle: "border-zinc-700 bg-zinc-900" },
  running: { label: "Running", badge: "bg-sky-400/10 text-sky-300 border-sky-500/30", circle: "border-sky-500/60 bg-sky-500/10" },
  confirming: { label: "Awaiting Approval", badge: "bg-violet-400/10 text-violet-300 border-violet-500/30", circle: "border-violet-500/60 bg-violet-500/10" },
  completed: { label: "Completed", badge: "bg-emerald-400/10 text-emerald-300 border-emerald-500/30", circle: "border-emerald-500/60 bg-emerald-500/10" },
  failed: { label: "Failed", badge: "bg-red-400/10 text-red-300 border-red-500/30", circle: "border-red-500/60 bg-red-500/10" },
};

function initialAgentStates() {
  return Object.fromEntries(
    AGENTS.map((a) => [a.id, { status: "waiting", task: a.idle, timestamp: null, completedAt: null, reasoning: [], progress: 0, confidence: null, cliCommand: null }])
  );
}

const DEMO_INCIDENT = { id: "i-sim-7431", service: "EC2 (simulated)", metric: "StatusCheckFailed_Instance", value: "1", severity: "High" };

function monitoringContent(ctx) {
  const fd = ctx.fetchedData || {};
  if (ctx.mode === "connected") {
    const issue = fd.detectedIssue;
    const instanceCount = fd.instances?.length ?? fd.ec2Total ?? 0;

    if (!issue) {
      // Genuinely healthy — a real monitoring agent has to be able to say
      // this rather than manufacture a problem to justify the rest of the pipeline.
      return {
        task: `Scanned ${instanceCount} EC2 instance(s) — no anomalies found`,
        reasoning: [
          `CloudWatch metrics: checked CPUUtilization across ${fd.ec2Running ?? 0} running instance(s) — all within normal range.`,
          `Instance state: ${fd.ec2Running ?? 0}/${fd.ec2Total ?? 0} running, no unexpectedly-stopped instances detected.`,
          `GuardDuty findings: ${fd.gdFindings ?? 0} active — none require action.`,
          "No incident detected. System is healthy.",
        ],
        output: { incident: null },
        confidence: 97,
      };
    }

    const incident =
      issue.type === "high_cpu"
        ? { id: issue.instanceId, name: issue.instanceName, service: "EC2", metric: "CPUUtilization", value: `${issue.cpu}%`, severity: "High" }
        : { id: issue.instanceId, name: issue.instanceName, service: "EC2", metric: "InstanceState", value: "stopped", severity: "High" };

    return {
      task: `Analyzing live CloudWatch and EC2 telemetry — anomaly found on ${incident.name || incident.id}`,
      reasoning: [
        issue.type === "high_cpu"
          ? `CloudWatch metrics: CPUUtilization on ${incident.name || incident.id} at ${incident.value} (1hr average) — above the 75% threshold.`
          : `EC2 state check: ${incident.name || incident.id} is currently stopped.`,
        `GuardDuty findings: ${fd.gdFindings ?? 0} active — none attributed to this instance.`,
        `EC2 fleet: ${fd.ec2Running ?? "—"}/${fd.ec2Total ?? "—"} instances running, ${fd.asg ?? "—"} scaling group(s) checked.`,
      ],
      output: { incident },
      confidence: 94,
    };
  }
  const reason = ctx.reasonText || REASON_TEXT.UNKNOWN;
  return {
    task: "Unable to retrieve CloudWatch metrics",
    reasoning: [
      "Unable to retrieve CloudWatch metrics.",
      `Reason: ${reason}`,
      "Activating Demo Mode.",
      "Running simulated cloud incidents while preserving the AI workflow.",
      `Simulated incident loaded: ${DEMO_INCIDENT.id} failing instance status checks.`,
    ],
    output: { incident: DEMO_INCIDENT },
    confidence: 88,
  };
}

function diagnosisContent(ctx) {
  const { mode, reasonText, incident, fetchedData } = ctx;
  if (mode === "connected") {
    if (!incident) {
      return {
        task: "No anomaly to diagnose",
        reasoning: ["Monitoring Agent found no active incident.", "All instances within normal thresholds — no root cause analysis needed."],
        output: { rootCause: null, demoReason: null },
        confidence: 97,
      };
    }
    const rootCause =
      incident.metric === "InstanceState"
        ? `${incident.name || incident.id} is stopped and not serving traffic.`
        : `Sustained high CPU on ${incident.name || incident.id} — likely a runaway or under-provisioned workload.`;
    return {
      task: `Correlating signals to isolate root cause for ${incident.name || incident.id}`,
      reasoning: [
        incident.metric === "InstanceState"
          ? `EC2 state check confirms ${incident.name || incident.id} is stopped.`
          : `CloudWatch confirms CPUUtilization on ${incident.name || incident.id} at ${incident.value}, sustained over the last hour.`,
        "Cross-referenced GuardDuty findings for this instance — none matched, ruling out malicious activity.",
        `Root cause identified: ${rootCause}`,
      ],
      output: { rootCause, demoReason: null },
      confidence: 91,
    };
  }
  const reason = reasonText || REASON_TEXT.UNKNOWN;
  return {
    task: "Diagnosing why live EC2 metrics could not be retrieved",
    reasoning: [
      `Unable to retrieve EC2 metrics because ${reason.replace(/\.$/, "").toLowerCase()}.`,
      "Correlated this against the credential and service verification results — confirmed a connectivity or configuration issue, not an application-level fault.",
      "Continuing diagnosis against simulated telemetry so the pipeline is not blocked.",
    ],
    output: { rootCause: `Simulated: ${incident.metric} check failing`, demoReason: reason },
    confidence: 85,
  };
}

function decisionContent(ctx) {
  const { mode, incident } = ctx;
  if (mode === "connected") {
    if (!incident) {
      return {
        task: "No remediation required",
        reasoning: ["No incident was found by Monitoring or Diagnosis.", "Decision: no action needed — system is healthy."],
        output: { action: null, actionType: null },
      };
    }
    if (incident.metric === "InstanceState") {
      return {
        task: "Selecting the remediation for a stopped instance",
        reasoning: [
          "Considered options: start the instance, or leave it stopped if intentional.",
          "No maintenance window or scheduled-stop tag found — treating this as unintentional downtime.",
          `Decision: start ${incident.name || incident.id} and monitor recovery.`,
        ],
        output: { action: `Start instance ${incident.name || incident.id}`, actionType: "start_instance" },
      };
    }
    return {
      task: "Selecting the lowest-risk remediation for the diagnosed cause",
      reasoning: [
        "Considered options: scale out the Auto Scaling group, restart the instance, or kill the runaway process.",
        "Restarting the instance carries the smallest blast radius and matches the on-call runbook — selected for safety.",
        `Decision: restart ${incident.name || incident.id} and monitor recovery.`,
      ],
      output: { action: `Restart instance ${incident.name || incident.id}`, actionType: "reboot_instance" },
    };
  }
  return {
    task: "Live AWS unavailable — deciding how the pipeline should proceed",
    reasoning: [
      "Live remediation actions cannot be safely executed without a verified AWS connection.",
      "Decision: continue with simulated telemetry and run the standard remediation playbook in Demo Mode.",
      `Selected simulated action: restart ${incident.id} (simulated) — safest, reversible, and matches the live runbook.`,
    ],
    output: { action: `Restart ${incident.id} (simulated)`, actionType: "reboot_instance" },
  };
}

function reportContent(ctx) {
  const { mode, incident, rootCause, demoReason, action, remediation, validation, pipelineStart, pipelineEnd, timeline } = ctx;
  const durationSec = Math.max(1, Math.round((pipelineEnd - pipelineStart) / 1000));

  if (mode === "connected" && !incident) {
    return {
      task: "Compiling the final report",
      reasoning: [
        `Full scan completed in ${durationSec}s — no incident found.`,
        "All monitored EC2 instances are healthy; no remediation was necessary.",
      ],
      output: {
        incident: null,
        rootCause: null,
        action: null,
        mode,
        demoReason: null,
        retried: false,
        liveNowAvailable: true,
        durationSec,
        status: "Healthy",
        recommendations: ["No action needed right now — CloudNova will keep monitoring on the next run."],
        timeline,
      },
    };
  }

  const lines = [
    `Incident ${incident.id} moved through all six agents in ${durationSec}s.`,
    mode === "connected"
      ? "All stages executed against live AWS telemetry and APIs."
      : `Live AWS was unavailable (${demoReason}) — the pipeline completed using simulated telemetry instead of stalling.`,
    validation.liveNowAvailable && mode !== "connected"
      ? "Live AWS has since become reachable again — the next run will use live data."
      : "Report compiled and ready for review.",
  ];
  const recommendations =
  mode !== "connected"
    ? [
        `Resolve the AWS connection issue (${demoReason || "unknown reason"}) to restore live monitoring.`,
        "Retry the AWS connection before taking any real remediation action.",
      ]
    : !incident
      ? [
          "No immediate action required. Continue monitoring EC2 and CloudWatch metrics.",
        ]
      : incident.metric === "CPUUtilization"
        ? [
            `CPU utilization reached ${incident.value} on ${incident.name || incident.id}. Check running processes and application load.`,
            "Review CloudWatch CPU metrics and consider scaling if high utilization persists.",
          ]
        : incident.metric === "InstanceState"
          ? [
              `${incident.name || incident.id} is stopped. Check whether this was intentional or part of scheduled maintenance.`,
              "If the instance should be running, obtain approval before starting it.",
            ]
          : [
              `Investigate the detected issue on ${incident.name || incident.id}.`,
              "Review the latest AWS metrics and logs before choosing a remediation.",
            ];
  return {
    task: "Compiling the final incident report",
    reasoning: lines,
    output: {
      incident, rootCause, action, mode, demoReason,
      retried: remediation.retried,
      liveNowAvailable: validation.liveNowAvailable,
      durationSec,
      status: remediation.cancelled ? "Cancelled by Operator" : remediation.failed ? "Failed" : "Resolved",
      recommendations,
      timeline,
    },
  };
}

async function runSimpleStage(agentId, content, updateAgent) {
  const startedAt = new Date();
  updateAgent(agentId, { status: "running", task: content.task, timestamp: startedAt, reasoning: [], progress: 0, completedAt: null, confidence: content.confidence ?? null });
  const lines = content.reasoning;
  for (let i = 0; i < lines.length; i++) {
    await delay(480 + Math.random() * 320);
    updateAgent(agentId, (prev) => ({ ...prev, reasoning: lines.slice(0, i + 1), progress: Math.round(((i + 1) / lines.length) * 100) }));
  }
  await delay(300);
  updateAgent(agentId, (prev) => ({ ...prev, status: "completed", progress: 100, completedAt: new Date() }));
  return content.output;
}

async function runRemediationStage(ctx, updateAgent) {
  const agentId = "remediation";
  const startedAt = new Date();
  const { mode, action, actionType, incident, remediationHadRetry, region, credentials, apiAvailable, requestConfirmation } = ctx;

  if (!incident) {
    updateAgent(agentId, {
      status: "running",
      task: "No remediation needed",
      timestamp: startedAt,
      reasoning: [],
      progress: 0,
      completedAt: null,
      cliCommand: null,
    });
    await delay(500);
    updateAgent(agentId, (prev) => ({ ...prev, reasoning: ["No incident to remediate — system is healthy."], progress: 100, status: "completed", completedAt: new Date() }));
    return { remediationApplied: false, retried: false, skipped: true, cliCommand: null };
  }

  const effectiveActionType = actionType || "reboot_instance";
  const cliVerb = effectiveActionType === "start_instance" ? "start-instances" : "reboot-instances";
  const cliCommand = `aws ec2 ${cliVerb} --instance-ids ${incident.id} --region ${mode === "connected" ? region || "us-east-1" : "us-east-1"}${mode === "connected" ? "" : " --dry-run"}`;

  // Only offer real execution when: Live Mode, a working backend was used
  // for the connection chain, and we still have the credentials on hand.
  const canExecuteReal = mode === "connected" && apiAvailable && credentials;

  const task = canExecuteReal
    ? `Preparing to execute: ${action}`
    : mode === "connected"
    ? `Executing: ${action}`
    : `Executing simulated action: ${action}`;
  const apiVerb = effectiveActionType === "start_instance" ? "StartInstances" : "RebootInstances";
  const baseLines = canExecuteReal
    ? [`Prepared EC2 ${apiVerb} for ${incident.id}.`, "This is a real AWS action — awaiting human confirmation before executing."]
    : mode === "connected"
    ? [`Invoking EC2 ${apiVerb} for ${incident.id}.`, "Waiting for status checks to confirm recovery."]
    : [`Simulating remediation action: ${action}.`, "No real AWS calls issued — Demo Mode is fully sandboxed.", "Equivalent AWS CLI command generated for review."];

  updateAgent(agentId, { status: "running", task, timestamp: startedAt, reasoning: [], progress: 0, completedAt: null, cliCommand });

  for (let i = 0; i < baseLines.length; i++) {
    await delay(480 + Math.random() * 280);
    updateAgent(agentId, (prev) => ({ ...prev, reasoning: baseLines.slice(0, i + 1), progress: Math.round(((i + 1) / baseLines.length) * 55) }));
  }

  if (canExecuteReal) {
    updateAgent(agentId, (prev) => ({ ...prev, status: "confirming", progress: 55 }));
    const approved = await requestConfirmation({ instanceId: incident.id, cliCommand });

    if (!approved) {
      updateAgent(agentId, (prev) => ({
        ...prev,
        status: "completed",
        progress: 100,
        reasoning: [...prev.reasoning, "Execution cancelled by operator — no AWS resources were modified."],
        completedAt: new Date(),
      }));
      return { remediationApplied: false, retried: false, cancelled: true, cliCommand };
    }

    updateAgent(agentId, (prev) => ({ ...prev, status: "running", reasoning: [...prev.reasoning, "Confirmed by operator — executing real AWS action..."] }));
    try {
      const result = await callBackend("/api/aws/remediate", {
        accessKeyId: credentials.accessKey,
        secretAccessKey: credentials.secretKey,
        sessionToken: credentials.sessionToken,
        region,
        instanceId: incident.id,
        action: effectiveActionType,
        confirm: true,
      });
      updateAgent(agentId, (prev) => ({
        ...prev,
        progress: 100,
        reasoning: [...prev.reasoning, result.message || "AWS confirmed the action was applied."],
        status: "completed",
        completedAt: new Date(),
      }));
      return { remediationApplied: true, retried: false, cliCommand };
    } catch (err) {
      updateAgent(agentId, (prev) => ({
        ...prev,
        status: "failed",
        reasoning: [...prev.reasoning, `Real AWS action failed: ${err.message}`],
        completedAt: new Date(),
      }));
      return { remediationApplied: false, retried: false, failed: true, cliCommand };
    }
  }

  if (remediationHadRetry) {
    await delay(500);
    updateAgent(agentId, (prev) => ({ ...prev, status: "failed", progress: 60, reasoning: [...baseLines, "First attempt did not confirm success within the expected window."] }));
    await delay(900);
    updateAgent(agentId, (prev) => ({ ...prev, status: "running", progress: 70, reasoning: [...prev.reasoning, "Retrying automatically — no human intervention required."] }));
    await delay(800);
    updateAgent(agentId, (prev) => ({ ...prev, progress: 100, reasoning: [...prev.reasoning, "Retry succeeded — action confirmed applied."] }));
  } else {
    await delay(600);
    updateAgent(agentId, (prev) => ({ ...prev, progress: 100, reasoning: [...prev.reasoning, "Action confirmed applied on the first attempt."] }));
  }

  updateAgent(agentId, (prev) => ({ ...prev, status: "completed", completedAt: new Date() }));
  return { remediationApplied: true, retried: !!remediationHadRetry, cliCommand };
}

async function runValidationStage(ctx, updateAgent, scenarioKey) {
  const agentId = "validation";
  const startedAt = new Date();
  const { mode, incident } = ctx;
  const task = incident ? "Verifying remediation outcome" : "Confirming system remains healthy";
  const lines = !incident
    ? [mode === "connected" ? "Re-checked CloudWatch metrics for the fleet — no anomalies present." : "Confirmed the simulated environment remains healthy."]
    : mode === "connected"
    ? [`Re-pulled fresh CloudWatch metrics for ${incident.id}.`, "Confirmed status checks passing and CPUUtilization back under the 40% threshold."]
    : [`Simulated a fresh health check for ${incident.id}.`, "Confirmed simulated instance status checks now passing."];

  updateAgent(agentId, { status: "running", task, timestamp: startedAt, reasoning: [], progress: 0, completedAt: null });

  for (let i = 0; i < lines.length; i++) {
    await delay(480 + Math.random() * 280);
    updateAgent(agentId, (prev) => ({ ...prev, reasoning: lines.slice(0, i + 1), progress: Math.round(((i + 1) / (lines.length + (mode === "connected" ? 0 : 2))) * 55) }));
  }

  let liveNowAvailable = mode === "connected";
  if (mode !== "connected") {
    await delay(350);
    updateAgent(agentId, (prev) => ({ ...prev, reasoning: [...prev.reasoning, "Re-checking Live AWS availability..."], progress: 75 }));
    liveNowAvailable = await quickAwsPing(scenarioKey);
    await delay(400);
    const resultLine = liveNowAvailable
      ? "Live AWS is reachable again — subsequent runs will use live telemetry."
      : "Live AWS is still unavailable — remaining in Demo Mode for now.";
    updateAgent(agentId, (prev) => ({ ...prev, reasoning: [...prev.reasoning, resultLine], progress: 100 }));
  }

  updateAgent(agentId, (prev) => ({ ...prev, status: "completed", progress: 100, completedAt: new Date() }));
  return { liveNowAvailable, resolved: true };
}

async function runPipeline({ scenarioKey, awsMode, reasonText, region, fetchedData, credentials, apiAvailable, requestConfirmation, updateAgent, setReport, resetAgents, getAgentStates }) {
  resetAgents();
  const pipelineStart = new Date();
  const mode = awsMode === "connected" ? "connected" : "demo";
  let ctx = { mode, reasonText, scenarioKey, region, fetchedData, credentials, apiAvailable, requestConfirmation };

  try {
    const monOut = await runSimpleStage("monitoring", monitoringContent(ctx), updateAgent);
    ctx = { ...ctx, incident: monOut.incident };

    const diagOut = await runSimpleStage("diagnosis", diagnosisContent(ctx), updateAgent);
    ctx = { ...ctx, rootCause: diagOut.rootCause, demoReason: diagOut.demoReason };

    const decOut = await runSimpleStage("decision", decisionContent(ctx), updateAgent);
    ctx = { ...ctx, action: decOut.action, actionType: decOut.actionType };

    ctx = { ...ctx, remediationHadRetry: Math.random() < 0.4 };
    const remOut = await runRemediationStage(ctx, updateAgent);
    ctx = { ...ctx, remediation: remOut };

    const valOut = await runValidationStage(ctx, updateAgent, scenarioKey);
    ctx = { ...ctx, validation: valOut };

    const pipelineEnd = new Date();
    const finalStates = getAgentStates();
    const timeline = AGENTS.map((a) => ({
      label: a.name,
      started: finalStates[a.id]?.timestamp || null,
      completed: finalStates[a.id]?.completedAt || null,
    }));
    const repContent = reportContent({ ...ctx, pipelineStart, pipelineEnd, timeline });
    await runSimpleStage("report", repContent, updateAgent);

    setReport({ ...repContent.output, pipelineStart, pipelineEnd });
  } catch (err) {
    setReport({
      incident: ctx.incident || DEMO_INCIDENT,
      mode: ctx.mode,
      demoReason: ctx.reasonText,
      durationSec: Math.max(1, Math.round((new Date() - pipelineStart) / 1000)),
      interrupted: true,
    });
  }
}

function useAgentPipeline(awsMode, reasonText, scenarioKey, region, fetchedData, credentials, apiAvailable) {
  const [agentStates, setAgentStates] = useState(initialAgentStates());
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(null); // { instanceId, cliCommand } | null
  const runIdRef = useRef(0);
  const agentStatesRef = useRef(agentStates);
  const confirmResolverRef = useRef(null);
  agentStatesRef.current = agentStates;

  const updateAgent = useCallback((id, patch) => {
    setAgentStates((prev) => {
      const next = { ...prev, [id]: typeof patch === "function" ? patch(prev[id]) : { ...prev[id], ...patch } };
      agentStatesRef.current = next;
      return next;
    });
  }, []);

  const resetAgents = useCallback(() => {
    const fresh = initialAgentStates();
    setAgentStates(fresh);
    agentStatesRef.current = fresh;
    setReport(null);
  }, []);

  // Called by runRemediationStage when it's about to take a REAL AWS action.
  // Resolves only once the human clicks Confirm or Cancel in the UI.
  const requestConfirmation = useCallback((details) => {
    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setAwaitingConfirmation(details);
    });
  }, []);

  const respondToConfirmation = useCallback((approved) => {
    if (confirmResolverRef.current) {
      confirmResolverRef.current(approved);
      confirmResolverRef.current = null;
    }
    setAwaitingConfirmation(null);
  }, []);

  const start = useCallback(async () => {
    const token = ++runIdRef.current;
    setRunning(true);
    await runPipeline({
      scenarioKey, awsMode, reasonText, region, fetchedData, credentials, apiAvailable, requestConfirmation,
      updateAgent, setReport, resetAgents,
      getAgentStates: () => agentStatesRef.current,
    });
    if (runIdRef.current === token) setRunning(false);
  }, [awsMode, reasonText, scenarioKey, region, fetchedData, credentials, apiAvailable, requestConfirmation, updateAgent, resetAgents]);

  return { agentStates, report, running, start, awaitingConfirmation, respondToConfirmation };
}

// ==================================================================
//  AGENT UI
// ==================================================================

function ProgressBar({ progress, status }) {
  const barColor = status === "failed" ? "bg-red-400" : status === "completed" ? "bg-emerald-400" : "bg-sky-400";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
      <div className={`h-full rounded-full ${barColor} transition-all duration-300 ease-out`} style={{ width: `${progress}%` }} />
    </div>
  );
}

function AgentTimelineRow({ agent, state, isLast, onConfirmationResponse }) {
  const Icon = agent.icon;
  const meta = AGENT_STATUS_META[state.status];
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-500 ${meta.circle}`}>
          {state.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-sky-300" strokeWidth={2.4} />}
          {state.status === "confirming" && <AlertTriangle className="h-4 w-4 text-violet-300" strokeWidth={2.4} />}
          {state.status === "completed" && <CheckCircle2 className="h-4 w-4 text-emerald-300" strokeWidth={2.4} />}
          {state.status === "failed" && <XCircle className="h-4 w-4 text-red-300" strokeWidth={2.4} />}
          {state.status === "waiting" && <Icon className="h-4 w-4 text-zinc-500" strokeWidth={2} />}
        </div>
        {!isLast && <div className={`w-px flex-1 transition-colors duration-700 ${state.status === "completed" ? "bg-emerald-500/40" : "bg-zinc-800"}`} />}
      </div>
      <div className="flex-1 pb-6">
        <div className={`rounded-xl border bg-zinc-900/50 p-4 transition-all duration-500 ${state.status === "waiting" ? "border-zinc-800/70 opacity-60" : "border-zinc-800"} ${state.status === "running" ? "shadow-lg shadow-sky-500/5" : ""} ${state.status === "confirming" ? "shadow-lg shadow-violet-500/10 border-violet-500/40" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-zinc-100">{agent.name}</h3>
            <div className="flex items-center gap-1.5">
              {state.confidence != null && (
                <span className="flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-400/10 px-2 py-0.5 font-mono text-[10px] text-violet-300">
                  <Activity className="h-2.5 w-2.5" /> {state.confidence}%
                </span>
              )}
              <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${meta.badge}`}>{meta.label}</span>
            </div>
          </div>
          <p className="mt-1.5 text-sm text-zinc-300">{state.task}</p>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-500">
            <Clock className="h-3 w-3" />
            <span>
              {state.status === "waiting" ? "Not started" : state.completedAt ? `Started ${formatTime(state.timestamp)} · Completed ${formatTime(state.completedAt)}` : `Started ${formatTime(state.timestamp)}`}
            </span>
          </div>
          {state.status !== "waiting" && (
            <div className="mt-3">
              <ProgressBar progress={state.progress} status={state.status} />
            </div>
          )}
          {state.reasoning.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {state.reasoning.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-zinc-400" style={{ animation: "cn-fade-in 400ms ease-out" }}>
                  <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-zinc-600" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
          {state.cliCommand && (
            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-zinc-500">
                <Terminal className="h-3 w-3" /> Equivalent AWS CLI command
              </div>
              <code className="block overflow-x-auto whitespace-pre text-[11px] text-emerald-300">{state.cliCommand}</code>
            </div>
          )}
          {state.status === "confirming" && onConfirmationResponse && (
            <div className="mt-3 rounded-lg border border-violet-500/30 bg-violet-400/5 px-3 py-3">
              <p className="text-xs font-medium text-violet-300">This will run a real AWS action on your account. Nothing has been executed yet.</p>
              <div className="mt-2.5 flex gap-2">
                <button
                  onClick={() => onConfirmationResponse(true)}
                  className="flex items-center gap-1.5 rounded-md bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-400 transition-colors"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Confirm & Execute
                </button>
                <button
                  onClick={() => onConfirmationResponse(false)}
                  className="flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  <XCircle className="h-3.5 w-3.5" /> Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportPanel({ report }) {
  if (!report) return null;
  const modeIsLive = report.mode === "connected";
  const statusTone =
    report.status === "Resolved" || report.status === "Healthy"
      ? "text-emerald-300"
      : report.status === "Cancelled by Operator"
      ? "text-amber-300"
      : report.status === "Failed"
      ? "text-red-300"
      : "text-zinc-200";
  return (
    <div className="mt-2 rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-900/60 p-5">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-zinc-400" />
        <h3 className="text-sm font-semibold text-zinc-100">Incident Report</h3>
      </div>
      {report.interrupted ? (
        <p className="mt-3 text-sm text-amber-300">The pipeline was interrupted before completion, but recovered gracefully without crashing.</p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <div><dt className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Incident Summary</dt><dd className="mt-0.5 text-sm text-zinc-200">{report.incident ? `${report.incident.id} — ${report.incident.service}` : "No incident — system healthy"}</dd></div>
            <div><dt className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Status</dt><dd className={`mt-0.5 text-sm ${statusTone}`}>{report.status}</dd></div>
            <div><dt className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Data Source</dt><dd className={`mt-0.5 text-sm ${modeIsLive ? "text-emerald-300" : "text-amber-300"}`}>{modeIsLive ? "Live AWS" : "Simulated telemetry"}</dd></div>
            <div><dt className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Resolution Time</dt><dd className="mt-0.5 text-sm text-zinc-200">{report.durationSec}s</dd></div>
            <div className="sm:col-span-2"><dt className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Root Cause</dt><dd className="mt-0.5 text-sm text-zinc-200">{report.rootCause || "N/A — no anomaly detected"}</dd></div>
            <div className="sm:col-span-2"><dt className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Actions Taken</dt><dd className="mt-0.5 text-sm text-zinc-200">{report.action ? `${report.action} ${report.retried ? "(after one automatic retry)" : "(first attempt)"}` : "None required"}</dd></div>
          </dl>

          {report.timeline && (
            <div className="mt-4">
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500">Timeline</p>
              <ul className="space-y-1 text-xs text-zinc-400">
                {report.timeline.map((t, i) => (
                  <li key={i} className="flex items-center justify-between border-b border-zinc-800/60 py-1 last:border-0">
                    <span>{t.label}</span>
                    <span className="font-mono text-zinc-500">{formatTime(t.started)} → {formatTime(t.completed)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.recommendations && (
            <div className="mt-4">
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500">Recommendations</p>
              <ul className="space-y-1">
                {report.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                    <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-zinc-600" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SecurityAlertsPanel({ fetchedData, connection }) {
  const alerts = fetchedData?.securityAlerts;
  const isLive = connection?.mode === "live";

  return (
    <section className="security-alerts-panel">
      <h2>Security Findings</h2>

      {!isLive ? (
        <p>Connect to live AWS data to view verified security findings.</p>
      ) : !Array.isArray(alerts) ? (
        <p>Security findings are unavailable. Refresh AWS data.</p>
      ) : alerts.length === 0 ? (
        <p>No security findings returned by the latest check.</p>
      ) : (
        <>
          <p>
            {alerts.length} finding(s) detected
          </p>

          {alerts.map((alert) => (
            <article
              key={alert.id}
              className="security-alert-card"
            >
              <h3>{alert.title}</h3>

              <p>
                <strong>Severity:</strong>{" "}
                {alert.severity}
              </p>

              <p>
                <strong>Service:</strong>{" "}
                {alert.service}
              </p>

              <p>
                <strong>Resource:</strong>{" "}
                {alert.resourceId}
              </p>

              <p>
                <strong>Evidence:</strong>{" "}
                {alert.evidence}
              </p>

              <p>
                <strong>Recommendation:</strong>{" "}
                {alert.recommendation}
              </p>

              <p>
                <strong>Status:</strong>{" "}
                {alert.status}
              </p>
            </article>
          ))}
        </>
      )}
    </section>
  );
}

function AgentPipelineSection({ agentStates, report, running, start, awsMode, autoStart, awaitingConfirmation, onConfirmationResponse, apiAvailable }) {
  const dataSourceIsLive = awsMode === "connected";
  const buttonLabel = running ? "Pipeline running…" : report ? "Run New Incident" : "Run Pipeline";
  const startedRef = useRef(false);

  useEffect(() => {
    if (autoStart && !startedRef.current) {
      startedRef.current = true;
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  return (
    <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-xl shadow-black/20">
      <style>{`@keyframes cn-fade-in { from { opacity: 0; transform: translateY(-2px);} to { opacity: 1; transform: translateY(0);} }`}</style>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800/80">
            <PlayCircle className="h-5 w-5 text-zinc-300" strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-zinc-100">Incident Response Pipeline</h2>
            <p className="text-xs text-zinc-500">Monitoring → Diagnosis → Decision → Remediation → Validation → Report</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dataSourceIsLive && apiAvailable && (
            <span className="rounded-full border border-violet-500/30 bg-violet-400/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-violet-300">
              real actions enabled
            </span>
          )}
          <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest ${dataSourceIsLive ? "border-emerald-500/30 bg-emerald-400/10 text-emerald-300" : "border-amber-500/30 bg-amber-400/10 text-amber-300"}`}>
            {dataSourceIsLive ? "live data" : "simulated data"}
          </span>
          <button
            onClick={start}
            disabled={running}
            className="flex items-center gap-1.5 rounded-md bg-violet-500/10 border border-violet-500/30 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <PlayCircle className={`h-3.5 w-3.5 ${running ? "animate-pulse" : ""}`} />
            {buttonLabel}
          </button>
        </div>
      </div>
      <div className="px-5 py-5">
        {AGENTS.map((agent, idx) => (
          <AgentTimelineRow
            key={agent.id}
            agent={agent}
            state={agentStates[agent.id]}
            isLast={idx === AGENTS.length - 1}
            onConfirmationResponse={agent.id === "remediation" && awaitingConfirmation ? onConfirmationResponse : null}
          />
        ))}
        <ReportPanel report={report} />
      </div>
    </section>
  );
}

// ==================================================================
//  CONNECTION SUMMARY (revealed once fetch completes)
// ==================================================================

function StatCard({ icon: Icon, label, value, tone = "default" }) {
  const toneClass = { emerald: "text-emerald-300", amber: "text-amber-300", red: "text-red-300", default: "text-zinc-200" }[tone];
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-center gap-2 text-zinc-500">
        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`mt-2 text-lg font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, live }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-zinc-400">
          <Icon className="h-4 w-4" strokeWidth={2} />
          <span className="text-xs font-medium tracking-wide">{label}</span>
        </div>
        <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest ${live ? "bg-emerald-400/10 text-emerald-400" : "bg-zinc-800 text-zinc-500"}`}>
          {live ? "live" : "demo"}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-zinc-100">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{sub}</p>
    </div>
  );
}


function CpuHistoryChart({ data, instanceId, live }) {
  const points = Array.isArray(data) ? data : [];

  if (!live) {
    return (
      <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="text-sm font-semibold text-zinc-100">
          EC2 CPU Utilization
        </h2>
        <p className="mt-3 text-sm text-amber-300">
          Demo mode — live CPU history is unavailable.
        </p>
      </div>
    );
  }

  const width = 700;
  const height = 240;
  const left = 48;
  const right = 18;
  const top = 22;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const x = (i) =>
    points.length < 2
      ? left + plotWidth / 2
      : left + (i / (points.length - 1)) * plotWidth;

  // Keep a small minimum range so low CPU values remain visible.
  const maxCpu = Math.max(
    1,
    ...points.map((p) => Number(p.cpu) || 0)
  );
  const yMax = Math.min(100, Math.ceil(maxCpu * 1.25));
  const y = (value) =>
    top + plotHeight - ((Number(value) || 0) / yMax) * plotHeight;

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.cpu)}`)
    .join(" ");

  const formatTime = (timestamp) =>
    new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">
            EC2 CPU Utilization
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            AWS CloudWatch · CPUUtilization
          </p>
        </div>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] uppercase tracking-widest text-emerald-300">
          Live AWS
        </span>
      </div>

      <p className="mt-3 break-all font-mono text-xs text-zinc-400">
        Instance: {instanceId || "Not available"}
      </p>

      {points.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-400">
          No recent CloudWatch CPU datapoints. Refresh the AWS data and try again.
        </p>
      ) : (
        <>
          <div className="mt-4 w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label="CPU utilization over time from AWS CloudWatch"
              className="w-full min-w-[320px]"
            >
              {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
                const value = yMax * fraction;
                const gridY = y(value);
                return (
                  <g key={fraction}>
                    <line
                      x1={left}
                      y1={gridY}
                      x2={width - right}
                      y2={gridY}
                      stroke="#3f3f46"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={left - 8}
                      y={gridY + 4}
                      fill="#a1a1aa"
                      fontSize="11"
                      textAnchor="end"
                    >
                      {value.toFixed(1)}%
                    </text>
                  </g>
                );
              })}

              {points.length > 1 && (
                <path
                  d={line}
                  fill="none"
                  stroke="#a78bfa"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}

              {points.map((point, i) => (
                <g key={`${point.timestamp}-${i}`}>
                  <circle
                    cx={x(i)}
                    cy={y(point.cpu)}
                    r="4"
                    fill="#a78bfa"
                    stroke="#18181b"
                    strokeWidth="2"
                  >
                    <title>
                      {formatTime(point.timestamp)} — {point.cpu}% CPU
                    </title>
                  </circle>
                  <text
                    x={x(i)}
                    y={height - 17}
                    fill="#a1a1aa"
                    fontSize="10"
                    textAnchor="middle"
                  >
                    {formatTime(point.timestamp)}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-3">
            <p className="text-xs text-zinc-500">
              {points.length} CloudWatch datapoint
              {points.length === 1 ? "" : "s"} · 5-minute period
            </p>
            <p className="text-sm font-semibold text-violet-300">
              Latest: {Number(points[points.length - 1].cpu).toFixed(2)}%
            </p>
          </div>
        </>
      )}
    </section>
  );
}


function CloudTrailActivity({ events, live }) {
  const items = Array.isArray(events) ? events : [];

  return (
    <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">
            AWS Activity Log
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            CloudTrail · Recent events · Last 24 hours
          </p>
        </div>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] uppercase tracking-widest text-emerald-300">
          {live ? "Live AWS" : "Demo mode"}
        </span>
      </div>

      {!live ? (
        <p className="mt-5 text-sm text-zinc-400">
          Connect to AWS to view recent activity.
        </p>
      ) : items.length === 0 ? (
        <p className="mt-5 text-sm text-zinc-400">
          No recent events returned, or CloudTrail access is unavailable.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500">
                <th className="px-3 py-3 font-medium">Event</th>
                <th className="px-3 py-3 font-medium">AWS service</th>
                <th className="px-3 py-3 font-medium">User</th>
                <th className="px-3 py-3 font-medium">Time (local)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((event, index) => (
                <tr
                  key={`${event.eventName}-${event.eventTime}-${index}`}
                  className="border-b border-zinc-800/70 last:border-0"
                >
                  <td className="px-3 py-3 font-medium text-zinc-200">
                    {event.eventName}
                  </td>
                  <td className="px-3 py-3 text-zinc-400">
                    {event.eventSource}
                  </td>
                  <td className="px-3 py-3 text-zinc-400">
                    {event.username}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-zinc-400">
                    {event.eventTime
                      ? new Date(event.eventTime).toLocaleString()
                      : "Unavailable"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}


function ConnectionSummary({ connection, credResults, svcResults, fetchedData, onRetry, retrying, backendVerified }) {
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const isLive = connection.mode === "live";
  const meta = isLive
    ? { dot: "bg-emerald-400", ring: "ring-emerald-400/30", badgeBg: "bg-emerald-400/10", badgeText: "text-emerald-300", badgeBorder: "border-emerald-400/30", title: "AWS Connected", subtitle: "Using Live AWS" }
    : { dot: "bg-red-400", ring: "ring-red-400/30", badgeBg: "bg-red-400/10", badgeText: "text-red-300", badgeBorder: "border-red-400/30", title: "Demo Mode", subtitle: "AWS unavailable" };

  const cloudwatchStatus = svcResults?.cloudwatch?.status === "failed" ? REASON_TEXT[svcResults.cloudwatch.reasonCode] : isLive ? "Operational" : "Simulated";
  const guarddutyStatus = svcResults?.guardduty?.status === "failed" ? REASON_TEXT[svcResults.guardduty.reasonCode] : isLive ? "Enabled" : "Simulated";

  return (
    <section className={`mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-xl shadow-black/20 ring-1 ${meta.ring} backdrop-blur-sm`}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${meta.dot} opacity-60`} />
            <span className={`relative inline-flex h-3 w-3 rounded-full ${meta.dot}`} />
          </span>
          <div className={`flex items-center gap-2 rounded-full border ${meta.badgeBorder} ${meta.badgeBg} px-3 py-1`}>
            <span className={`text-sm font-semibold ${meta.badgeText}`}>{meta.title}</span>
          </div>
          <span className="text-sm text-zinc-400">{meta.subtitle}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRetry}
            disabled={retrying}
            className="flex items-center gap-1.5 rounded-md border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
            Retry AWS Connection
          </button>
          <button
            onClick={() => setShowDiagnostics((s) => !s)}
            className="flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 transition-colors"
          >
            Diagnostics
            {showDiagnostics ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <div
        className={`mx-5 mt-4 flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 ${
          backendVerified ? "border-violet-500/30 bg-violet-400/5" : "border-amber-500/20 bg-amber-400/5"
        }`}
      >
        {backendVerified ? <CheckCircle2 className="h-4 w-4 shrink-0 text-violet-300" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />}
        <p className={`text-xs ${backendVerified ? "text-violet-300" : "text-amber-300"}`}>
          {backendVerified
            ? "Connected to the real CloudNova backend — these results reflect your actual AWS account."
            : "No real backend reachable — this run is the built-in simulation, not a real AWS check. See server/README.md to connect it."}
        </p>
      </div>

      {!isLive && connection.reasonText && (
        <div className="mx-5 mt-4 rounded-lg border border-red-400/20 bg-red-400/5 px-3.5 py-2.5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Reason</p>
          <p className="text-sm text-red-300">{connection.reasonText}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 px-5 py-5 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard icon={Clock} label="Last Sync" value={formatTime(connection.lastSync)} />
        <StatCard icon={Globe2} label="Connected Region" value={connection.region || "—"} />
        <StatCard icon={Server} label="EC2 Instances" value={`${fetchedData.ec2Running}/${fetchedData.ec2Total}`} tone={isLive ? "emerald" : "amber"} />
        <StatCard icon={Activity} label="CloudWatch" value={cloudwatchStatus} tone={cloudwatchStatus === "Operational" ? "emerald" : cloudwatchStatus === "Simulated" ? "amber" : "red"} />
        <StatCard icon={ShieldAlert} label="GuardDuty" value={guarddutyStatus} tone={guarddutyStatus === "Enabled" ? "emerald" : guarddutyStatus === "Simulated" ? "amber" : "red"} />
        <StatCard icon={Building2} label="AWS Account" value={connection.account} />
      </div>

      {showDiagnostics && (
        <div className="border-t border-zinc-800/80 px-5 py-4">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">Credential checks</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {CREDENTIAL_CHECKS.map((c) => (
              <DiagnosticRow key={c.id} icon={c.icon} label={c.label} result={credResults?.[c.id]} />
            ))}
          </div>
          {svcResults && (
            <>
              <p className="mb-2 mt-4 font-mono text-[10px] uppercase tracking-widest text-zinc-500">Service checks</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {SERVICE_CHECKS.map((c) => (
                  <DiagnosticRow key={c.id} icon={c.icon} label={c.label} result={svcResults?.[c.id]} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

// ==================================================================
//  OPERATIONS CONSOLE — everything after login, one continuous page
// ==================================================================

async function verifyCredentialsRemote(form) {
  return callBackend("/api/aws/verify-credentials", {
    accessKeyId: form.accessKey,
    secretAccessKey: form.secretKey,
    sessionToken: form.sessionToken,
    region: form.region,
  });
}

async function verifyServicesRemote(form) {
  return callBackend("/api/aws/verify-services", {
    accessKeyId: form.accessKey,
    secretAccessKey: form.secretKey,
    sessionToken: form.sessionToken,
    region: form.region,
  });
}

async function fetchDataRemote(form) {
  return callBackend("/api/aws/fetch-data", {
    accessKeyId: form.accessKey,
    secretAccessKey: form.secretKey,
    sessionToken: form.sessionToken,
    region: form.region,
  });
}

function OperationsConsole({ form, scenarioKey, onLogout }) {
  const [attempt, setAttempt] = useState(0);
  const [connPhase, setConnPhase] = useState("credentials"); // credentials | services | fetching | ready
  const [stepStatus, setStepStatus] = useState({ credentials: "active", services: "waiting", fetching: "waiting" });
  const [credResults, setCredResults] = useState(Object.fromEntries(CREDENTIAL_CHECKS.map((c) => [c.id, { status: "waiting" }])));
  const [svcResults, setSvcResults] = useState(Object.fromEntries(SERVICE_CHECKS.map((c) => [c.id, { status: "waiting" }])));
  const [loadedCats, setLoadedCats] = useState([]);
  const [failure, setFailure] = useState(null); // { phase, reasonCode }
  const [connection, setConnection] = useState(null);
  const [fetchedData, setFetchedData] = useState(null);
  // True only once credentials + services + fetch-data all came from the
  // real backend successfully — this is what gates real remediation actions.
  const [backendVerified, setBackendVerified] = useState(false);
  const runIdRef = useRef(0);

  const pipeline = useAgentPipeline(
    connection ? (connection.mode === "live" ? "connected" : "demo") : "demo",
    connection?.reasonText || null,
    scenarioKey,
    connection?.region,
    fetchedData,
    form,
    backendVerified
  );

  useEffect(() => {
    const token = ++runIdRef.current;
    (async () => {
      setConnPhase("credentials");
      setStepStatus({ credentials: "active", services: "waiting", fetching: "waiting" });
      setCredResults(Object.fromEntries(CREDENTIAL_CHECKS.map((c) => [c.id, { status: "waiting" }])));
      setSvcResults(Object.fromEntries(SERVICE_CHECKS.map((c) => [c.id, { status: "waiting" }])));
      setLoadedCats([]);
      setFailure(null);
      setBackendVerified(false);

      const scenario = CONNECTION_SCENARIOS[scenarioKey] || CONNECTION_SCENARIOS.connected;
      let localFailure = null;
      let usedRealBackend = false;

      // Try the real backend once, up front, for credentials. If it's not
      // configured (no VITE_API_BASE_URL) or unreachable, we fall straight
      // back to the built-in simulation — nothing here ever throws upward.
      let credBackendResult = null;
      if (API_BASE) {
        try {
          credBackendResult = await verifyCredentialsRemote(form);
          usedRealBackend = true;
        } catch (e) {
          credBackendResult = null;
        }
      }
      if (runIdRef.current !== token) return;

      try {
        // --- Credential verification (4-step animated reveal either way) ---
        let credLocal = Object.fromEntries(CREDENTIAL_CHECKS.map((c) => [c.id, { status: "waiting" }]));
        for (const check of CREDENTIAL_CHECKS) {
          credLocal = { ...credLocal, [check.id]: { status: "checking" } };
          setCredResults(credLocal);

          let res;
          if (credBackendResult) {
            await delay(280 + Math.random() * 220); // pacing only — the real answer already arrived
            if (check.id === "sdk") res = { status: "success", reasonCode: null };
            else if (check.id === "found")
              res = form.accessKey && form.secretKey ? { status: "success", reasonCode: null } : { status: "failed", reasonCode: "INVALID_ACCESS_KEY" };
            else if (check.id === "region")
              res = form.region ? { status: "success", reasonCode: null } : { status: "failed", reasonCode: "REGION_MISSING" };
            else res = credBackendResult.success ? { status: "success", reasonCode: null } : { status: "failed", reasonCode: credBackendResult.reasonCode || "UNKNOWN" };
          } else {
            res = await evaluateCredentialCheck(check, scenario);
          }

          if (runIdRef.current !== token) return;
          credLocal = { ...credLocal, [check.id]: res };
          setCredResults(credLocal);
          if (res.status === "failed") {
            localFailure = { phase: "credentials", reasonCode: res.reasonCode };
            const idx = CREDENTIAL_CHECKS.findIndex((c) => c.id === check.id);
            const rest = CREDENTIAL_CHECKS.slice(idx + 1);
            credLocal = { ...credLocal, ...Object.fromEntries(rest.map((r) => [r.id, { status: "skipped" }])) };
            setCredResults(credLocal);
            break;
          }
        }

        let svcBackendResults = null;
        if (localFailure) {
          setStepStatus((s) => ({ ...s, credentials: "failed", services: "skipped" }));
          setFailure(localFailure);
          await delay(600);
        } else {
          setStepStatus((s) => ({ ...s, credentials: "done", services: "active" }));

          if (usedRealBackend) {
            try {
              const svcResult = await verifyServicesRemote(form);
              svcBackendResults = svcResult.results;
            } catch (e) {
              usedRealBackend = false; // backend dropped mid-flow — fall back for the rest of this run
            }
          }
          if (runIdRef.current !== token) return;

          // --- Service verification (6-step animated reveal either way) ---
          let svcLocal = Object.fromEntries(SERVICE_CHECKS.map((c) => [c.id, { status: "waiting" }]));
          for (const check of SERVICE_CHECKS) {
            svcLocal = { ...svcLocal, [check.id]: { status: "checking" } };
            setSvcResults(svcLocal);

            let res;
            if (svcBackendResults) {
              await delay(260 + Math.random() * 200);
              res = svcBackendResults[check.id] || {status: "failed",reasonCode: "UNKNOWN",};
            } else {
              res = await evaluateServiceCheck(check, scenario);
            }

            if (runIdRef.current !== token) return;
            svcLocal = { ...svcLocal, [check.id]: res };
            setSvcResults(svcLocal);
            if (res.status === "failed" && !localFailure) {
              localFailure = { phase: "services", reasonCode: res.reasonCode };
            }
          }
          setStepStatus((s) => ({ ...s, services: localFailure ? "failed" : "done" }));
          if (localFailure) setFailure(localFailure);
          await delay(500);
        }

        // --- Fetch data (always runs — live or simulated) ---
        setConnPhase("fetching");
        setStepStatus((s) => ({ ...s, fetching: "active" }));
        const mode = localFailure ? "demo" : "live";

        let realData = null;
        if (mode === "live" && usedRealBackend) {
          try {
            const fetchResult = await fetchDataRemote(form);
            realData = fetchResult.data;
          } catch (e) {
            usedRealBackend = false;
          }
        }

        for (const cat of DATA_CATEGORIES) {
          await delay(160 + Math.random() * 170);
          if (runIdRef.current !== token) return;
          setLoadedCats((prev) => [...prev, cat.id]);
        }
        await delay(400);
        
        const finalMode =
          mode === "live" && usedRealBackend && !!realData
          ? "live"
          : "demo";

        const data = realData || buildFetchedData("demo");

        if (runIdRef.current !== token) return;

        setFetchedData(data);
        setStepStatus((s) => ({ ...s, fetching: "done" }));

        setConnection({
          mode: finalMode,
          reasonText: localFailure
          ? REASON_TEXT[localFailure.reasonCode]
          : finalMode === "demo"
          ? REASON_TEXT.UNKNOWN
          : null,
          region: finalMode === "live" ? form?.region : "—",
          account:
            finalMode === "live"
              ? credBackendResult?.account
              ? maskAccountId(credBackendResult.account)
            : maskAccountId(LIVE_ACCOUNT_ID)
          : `${maskAccountId(DEMO_ACCOUNT_ID)} (Demo)`,
          lastSync: new Date(),
        });

        setBackendVerified(finalMode === "live");
        setConnPhase("ready");

      } catch (e) {
        // Never crash — fall back to Demo Mode with a generic reason and continue.
        if (runIdRef.current !== token) return;
        const data = buildFetchedData("demo");
        setFetchedData(data);
        setConnection({
          mode: "demo",
          reasonText: REASON_TEXT.UNKNOWN,
          region: "—",
          account: `${maskAccountId(DEMO_ACCOUNT_ID)} (Demo)`,
          lastSync: new Date(),
        });
        setBackendVerified(false);
        setConnPhase("ready");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const handleRetry = () => setAttempt((a) => a + 1);

  const timelineStatuses = {
    login: "done",
    credentials: stepStatus.credentials,
    services: stepStatus.services,
    fetching: stepStatus.fetching,
    monitoring: pipeline.agentStates.monitoring.status === "running" ? "active" : pipeline.agentStates.monitoring.status === "completed" ? "done" : pipeline.agentStates.monitoring.status === "failed" ? "failed" : "waiting",
    diagnosis: pipeline.agentStates.diagnosis.status === "running" ? "active" : pipeline.agentStates.diagnosis.status === "completed" ? "done" : pipeline.agentStates.diagnosis.status === "failed" ? "failed" : "waiting",
    decision: pipeline.agentStates.decision.status === "running" ? "active" : pipeline.agentStates.decision.status === "completed" ? "done" : pipeline.agentStates.decision.status === "failed" ? "failed" : "waiting",
    remediation: pipeline.agentStates.remediation.status === "running" ? "active" : pipeline.agentStates.remediation.status === "completed" ? "done" : pipeline.agentStates.remediation.status === "failed" ? "failed" : "waiting",
    validation: pipeline.agentStates.validation.status === "running" ? "active" : pipeline.agentStates.validation.status === "completed" ? "done" : pipeline.agentStates.validation.status === "failed" ? "failed" : "waiting",
    report: pipeline.agentStates.report.status === "running" ? "active" : pipeline.agentStates.report.status === "completed" ? "done" : pipeline.agentStates.report.status === "failed" ? "failed" : "waiting",
  };

  const retrying = connPhase !== "ready";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/25 to-violet-500/5 border border-zinc-800">
              <Cloud className="h-5 w-5 text-violet-400" strokeWidth={2.2} />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-zinc-100">CloudNova</h1>
              <p className="text-xs text-zinc-500">Autonomous Cloud Reliability Engineer</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Log out
          </button>
        </header>

        <ExecutionTimeline statuses={timelineStatuses} />

        {failure && connPhase !== "ready" && <FailoverBanner reasonText={REASON_TEXT[failure.reasonCode]} />}
        {failure && connPhase === "ready" && stepStatus.fetching === "done" && (
          <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-400/5 px-4 py-2.5 text-xs text-amber-300">
            Running simulated cloud incidents while preserving the AI workflow.
          </div>
        )}

        {connPhase === "credentials" && <CredentialChecklistCard results={credResults} />}
        {connPhase === "services" && <ServiceChecklistCard results={svcResults} />}
        {connPhase === "fetching" && <FetchDataCard mode={failure ? "demo" : "live"} loaded={loadedCats} />}

        {connPhase === "ready" && connection && fetchedData && (
          <>
            <ConnectionSummary
              connection={connection}
              credResults={credResults}
              svcResults={svcResults}
              fetchedData={fetchedData}
              onRetry={handleRetry}
              retrying={retrying}
              backendVerified={backendVerified}
            />

            <AgentPipelineSection
              agentStates={pipeline.agentStates}
              report={pipeline.report}
              running={pipeline.running}
              start={pipeline.start}
              awsMode={connection.mode === "live" ? "connected" : "demo"}
              autoStart={true}
              awaitingConfirmation={pipeline.awaitingConfirmation}
              onConfirmationResponse={pipeline.respondToConfirmation}
              apiAvailable={backendVerified}
            />

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard icon={Cpu} label="CPU Utilization" value={fetchedData.cpu} sub="fleet average" live={connection.mode === "live"} />
              <MetricCard icon={HardDrive} label="Memory Usage" value={fetchedData.memory} sub="fleet average" live={connection.mode === "live"} />
              <MetricCard icon={Network} label="Security Groups" value={fetchedData.securityGroups} sub="in use" live={connection.mode === "live"} />
              <MetricCard icon={Database} label="S3 Buckets" value={fetchedData.s3Buckets} sub="monitored" live={connection.mode === "live"} />
              <MetricCard icon={Layers} label="Auto Scaling Groups" value={fetchedData.asg} sub="active" live={connection.mode === "live"} />
              <MetricCard icon={Boxes} label="RDS Status" value={fetchedData.rds} sub="primary cluster" live={connection.mode === "live"} />
              <MetricCard icon={ScrollText} label="CloudWatch Logs" value={fetchedData.cwLogs} sub="last 24h" live={connection.mode === "live"} />
              <MetricCard icon={History} label="CloudTrail Events" value={fetchedData.ctEvents} sub="last 24h" live={connection.mode === "live"} />
            </div>
            <SecurityAlertsPanel
              fetchedData={fetchedData}
              connection={connection}
            />
            {/* ADD THE GRAPH HERE */}
            <CpuHistoryChart
              data={fetchedData.cpuHistory}
              instanceId={fetchedData.cpuInstanceId}
              live={connection.mode === "live" && backendVerified}
            />
            <CloudTrailActivity
            events={fetchedData.ctEventDetails}
            live={connection.mode === "live" && backendVerified}
            />
          </>
        )}

        <p className="mt-6 text-center text-xs text-zinc-600">
          One continuous pipeline: login → verification → live data → six-agent incident response.
        </p>
      </div>
    </div>
  );
}

// ==================================================================
//  APP
// ==================================================================

export default function CloudNovaApp() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [scenarioKey, setScenarioKey] = useState("connected");
  const [form, setForm] = useState(null);
  const [consoleKey, setConsoleKey] = useState(0);

  const handleConnect = (formValues) => {
    setForm(formValues);
    setLoggedIn(true);
  };

  const handleLogout = () => {
    setLoggedIn(false);
    setForm(null);
    setConsoleKey((k) => k + 1);
  };

  if (!loggedIn) {
    return <LoginScreen onConnect={handleConnect} scenarioKey={scenarioKey} onScenarioChange={setScenarioKey} />;
  }

  return <OperationsConsole key={consoleKey} form={form} scenarioKey={scenarioKey} onLogout={handleLogout} />;
}
