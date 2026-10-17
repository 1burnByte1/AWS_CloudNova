import "dotenv/config";
import express from "express";
import cors from "cors";

import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeVpcsCommand,
  DescribeSecurityGroupsCommand,
  RebootInstancesCommand,
  StartInstancesCommand,
} from "@aws-sdk/client-ec2";
import { CloudWatchClient, ListMetricsCommand, GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import { CloudWatchLogsClient, DescribeLogGroupsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { CloudTrailClient, DescribeTrailsCommand, LookupEventsCommand } from "@aws-sdk/client-cloudtrail";
import { GuardDutyClient, ListDetectorsCommand, GetDetectorCommand,ListFindingsCommand } from "@aws-sdk/client-guardduty";
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import { IAMClient, GetUserCommand } from "@aws-sdk/client-iam";
import { AutoScalingClient, DescribeAutoScalingGroupsCommand } from "@aws-sdk/client-auto-scaling";
import { RDSClient, DescribeDBInstancesCommand } from "@aws-sdk/client-rds";

import { mapAwsError } from "./errorMap.js";
import { resolveCredentials } from "./credentials.js";


const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  })
);
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
// Never let request bodies (which may contain secret keys) reach the logs.
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// -------------------------------------------------------------------------
// STEP 2 — Verify Credentials
// Maps onto CREDENTIAL_CHECKS ids in the frontend: sdk, found, valid, region.
// -------------------------------------------------------------------------
app.post("/api/aws/verify-credentials", async (req, res) => {
  const { credentials, region, source } = resolveCredentials(req.body);

  if (!credentials.accessKeyId || !credentials.secretAccessKey) {
    return res.json({
      success: false,
      reasonCode: "INVALID_ACCESS_KEY",
      message: "No access key / secret key available.",
      source,
    });
  }
  if (!region) {
    return res.json({ success: false, reasonCode: "REGION_MISSING", message: "No region configured.", source });
  }

  try {
    const sts = new STSClient({ region, credentials });
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    return res.json({
      success: true,
      account: identity.Account,
      arn: identity.Arn,
      userId: identity.UserId,
      region,
      source,
    });
  } catch (err) {
    return res.json({
      success: false,
      reasonCode: mapAwsError(err),
      message: err.message,
      source,
    });
  }
});

// -------------------------------------------------------------------------
// STEP 3 — Verify AWS Services
// Returns one entry per SERVICE_CHECKS id: ec2, cloudwatch, cloudtrail,
// guardduty, s3, iam — shaped exactly like the frontend's svcResults state.
// -------------------------------------------------------------------------


app.post("/api/aws/verify-services", async (req, res) => {
  console.log("VERIFY SERVICES ROUTE ENTERED");
  try {
    const { credentials, region } = resolveCredentials(req.body);
    const results = {};

    // EC2: check API access, regardless of instance state
    try {
      const ec2 = new EC2Client({ region, credentials });
      const data = await ec2.send(
        new DescribeInstancesCommand({ MaxResults: 50 })
      );
      const instances = (data.Reservations || []).flatMap(
        (r) => r.Instances || []
      );

      results.ec2 = {
        status: "success",
        reasonCode: null,
        instanceCount: instances.length,
        runningCount: instances.filter(
          (i) => i.State?.Name === "running"
        ).length,
      };
    } catch (err) {
      results.ec2 = {
        status: "failed",
        reasonCode: mapAwsError(err),
      };
    }

    // CloudWatch: check metric-listing access
    try {
      const cw = new CloudWatchClient({ region, credentials });
      await cw.send(new ListMetricsCommand({ Namespace: "AWS/EC2" }));
      results.cloudwatch = { status: "success", reasonCode: null };
    } catch (err) {
      results.cloudwatch = {
        status: "failed",
        reasonCode: mapAwsError(err),
      };
    }

    // CloudTrail: API access and trail configuration are separate facts
    try {
      const ct = new CloudTrailClient({ region, credentials });
      const data = await ct.send(new DescribeTrailsCommand({}));
      results.cloudtrail = {
        status: "success",
        reasonCode: null,
        configured: (data.trailList || []).length > 0,
      };
    } catch (err) {
      results.cloudtrail = {
        status: "failed",
        reasonCode: mapAwsError(err),
      };
    }

    // S3: check bucket-listing access
    try {
      const s3 = new S3Client({ region, credentials });
      const data = await s3.send(new ListBucketsCommand({}));
      results.s3 = {
        status: "success",
        reasonCode: null,
        bucketCount: (data.Buckets || []).length,
      };
    } catch (err) {
      results.s3 = {
        status: "failed",
        reasonCode: mapAwsError(err),
      };
    }
    


    // VPC: check network inventory access
    try {
      const ec2 = new EC2Client({ region, credentials });
      const data = await ec2.send(new DescribeVpcsCommand({}));

      results.vpc = {
        status: "success",
        reasonCode: null,
        vpcCount: (data.Vpcs || []).length,
        vpcs: (data.Vpcs || []).map((vpc) => ({
          vpcId: vpc.VpcId,
          state: vpc.State || "unknown",
          isDefault: vpc.IsDefault ?? false,
          cidrBlock: vpc.CidrBlock || "Not available",
        })),
      };
    } catch (err) {
      results.vpc = {
        status: "failed",
        reasonCode: mapAwsError(err),
      };
    
    }
    // RDS: check database-listing access
try {
  const rds = new RDSClient({ region, credentials });
  const data = await rds.send(new DescribeDBInstancesCommand({ MaxRecords: 20 }));
  results.rds = {
    status: "success",
    reasonCode: null,
    dbCount: (data.DBInstances || []).length,
  };
} catch (err) {
  results.rds = { status: "failed", reasonCode: mapAwsError(err) };
}

// Auto Scaling: check scaling-group access
try {
  const asg = new AutoScalingClient({ region, credentials });
  const data = await asg.send(new DescribeAutoScalingGroupsCommand({ MaxRecords: 20 }));
  results.autoscaling = {
    status: "success",
    reasonCode: null,
    groupCount: (data.AutoScalingGroups || []).length,
  };
} catch (err) {
  results.autoscaling = { status: "failed", reasonCode: mapAwsError(err) };
}



    // IAM: report access limitations separately from other failures
    try {
      const iam = new IAMClient({ region, credentials });
      await iam.send(new GetUserCommand({}));
      results.iam = { status: "success", reasonCode: null };
    } catch (err) {
      if (
        err.name === "AccessDenied" ||
        err.name === "AccessDeniedException"
      ) {
        results.iam = {
          status: "limited",
          reasonCode: "IAM_MISSING_READONLY",
        };
      } else if (err.name === "ValidationError") {
        // GetUser may not apply to assumed-role credentials.
        results.iam = {
          status: "not_applicable",
          reasonCode: "IAM_USER_API_NOT_APPLICABLE",
        };
      } else {
        results.iam = {
          status: "failed",
          reasonCode: mapAwsError(err),
        };
      }
    }

    
    // GuardDuty: verify detector configuration and finding access
    


    // GuardDuty is optional; it is not a required service for this check.
    res.json({ success: true, region, results });

  } catch (err) {
    console.error(
      "VERIFY SERVICES FAILED:",
      err.name || "Error",
      err.message || ""
    );

    return res.status(500).json({
      success: false,
      message: "Unable to initialize AWS service verification.",
      error: err.name || "InternalServerError",
    });
  }
});




// -------------------------------------------------------------------------
// STEP 4 — Fetch Live Data
// Shaped exactly like the frontend's fetchedData object.
// -------------------------------------------------------------------------

app.post("/api/aws/fetch-data", async (req, res) => {
  try {
    const { credentials, region } = resolveCredentials(req.body);
    const data = {};
    let detectedIssue = null;

    // EC2: instances, security groups and CPU metrics
    try {
      const ec2 = new EC2Client({ region, credentials });
      const instancesData = await ec2.send(
        new DescribeInstancesCommand({})
      );

      const instances = (instancesData.Reservations || [])
        .flatMap((r) => r.Instances || []);

      const runningInstances = instances.filter(
        (i) => i.State?.Name === "running"
      );

      const stoppedInstances = instances.filter(
        (i) => i.State?.Name === "stopped"
      );

      data.ec2Total = instances.length;
      data.ec2Running = runningInstances.length;

      const nameOf = (inst) =>
        inst.Tags?.find((t) => t.Key === "Name")?.Value ||
        inst.InstanceId;

      const sgData = await ec2.send(
        new DescribeSecurityGroupsCommand({})
      );
      data.securityGroups = sgData.SecurityGroups?.length || 0;

      const instanceSummaries = [];
      data.cpuHistory = [];
      data.cpuInstanceId = null;

      if (runningInstances.length > 0) {
        const cw = new CloudWatchClient({ region, credentials });
        const preferredId = "i-0c11d432ed3a6b673";

        const target =
          runningInstances.find(
            (i) => i.InstanceId === preferredId
          ) || runningInstances[0];

        const now = new Date();
        const start = new Date(now.getTime() - 60 * 60 * 1000);

        data.cpuInstanceId = target.InstanceId;

        try {
          const metricData = await cw.send(
            new GetMetricStatisticsCommand({
              Namespace: "AWS/EC2",
              MetricName: "CPUUtilization",
              Dimensions: [
                {
                  Name: "InstanceId",
                  Value: target.InstanceId,
                },
              ],
              StartTime: start,
              EndTime: now,
              Period: 300,
              Statistics: ["Average"],
            })
          );

          data.cpuHistory = (metricData.Datapoints || [])
            .filter((p) => p.Timestamp && p.Average != null)
            .sort(
              (a, b) =>
                new Date(a.Timestamp) - new Date(b.Timestamp)
            )
            .map((p) => ({
              timestamp: p.Timestamp,
              cpu: Number(p.Average.toFixed(2)),
            }));
        } catch (err) {
          console.error(
            "CloudWatch CPU query failed:",
            err.name || "Error"
          );
        }

        const latest =
          data.cpuHistory.length > 0
            ? data.cpuHistory[data.cpuHistory.length - 1].cpu
            : null;

        data.cpu =
          latest != null
            ? `${latest.toFixed(1)}%`
            : "No recent datapoints";

        for (const inst of runningInstances.slice(0, 10)) {
          instanceSummaries.push({
            id: inst.InstanceId,
            name: nameOf(inst),
            state: inst.State?.Name,
            cpu:
              inst.InstanceId === target.InstanceId
                ? latest
                : null,
          });
        }
      } else {
        data.cpu = "No running instances";
      }

      for (const inst of stoppedInstances.slice(0, 10)) {
        instanceSummaries.push({
          id: inst.InstanceId,
          name: nameOf(inst),
          state: "stopped",
          cpu: null,
        });
      }

      data.instances = instanceSummaries;
      data.memory =
        "Requires CloudWatch Agent (not available via base EC2 metrics)";

      const CPU_ALERT_THRESHOLD = 75;

      const highCpu = instanceSummaries.find(
        (i) =>
          i.state === "running" &&
          i.cpu != null &&
          i.cpu >= CPU_ALERT_THRESHOLD
      );

      const stopped = instanceSummaries.find(
        (i) => i.state === "stopped"
      );

      if (highCpu) {
        detectedIssue = {
          type: "high_cpu",
          instanceId: highCpu.id,
          instanceName: highCpu.name,
          cpu: highCpu.cpu,
        };
      } else if (stopped) {
        detectedIssue = {
          type: "stopped",
          instanceId: stopped.id,
          instanceName: stopped.name,
        };
      }
    } catch (err) {
      console.error("EC2 query failed:", err.name || "Error");
      data.ec2Total = 0;
      data.ec2Running = 0;
      data.cpu = "Unavailable";
      data.memory = "Unavailable";
      data.securityGroups = 0;
      data.instances = [];
    }

    // CloudWatch Logs
    try {
      const logs = new CloudWatchLogsClient({
        region,
        credentials,
      });

      const lg = await logs.send(
        new DescribeLogGroupsCommand({ limit: 50 })
      );

      data.cwLogs = `${lg.logGroups?.length || 0} log groups`;
    } catch (err) {
      console.error(
        "CloudWatch Logs query failed:",
        err.name || "Error"
      );
      data.cwLogs = "Unavailable";
    }

    // CloudTrail: recent AWS activity
    try {
      const ct = new CloudTrailClient({ region, credentials });

      const result = await ct.send(
        new LookupEventsCommand({
          StartTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
          EndTime: new Date(),
          MaxResults: 50,
        })
      );

      const events = result.Events || [];

      data.ctEvents =
        `${events.length}${result.NextToken ? "+" : ""} events (24h)`;

      data.ctEventDetails = events.map((event) => ({
        eventName: event.EventName || "Unknown event",
        eventTime: event.EventTime || null,
        eventSource: event.EventSource || "Unknown service",
        username: event.Username || "Not available",
      }));
    } catch (err) {
      console.error(
        "CloudTrail query failed:",
        err.name || "Error"
      );
      data.ctEvents = "Unavailable";
      data.ctEventDetails = [];
    }

    // S3
    try {
      const s3 = new S3Client({ region, credentials });
      const buckets = await s3.send(new ListBucketsCommand({}));
      data.s3Buckets = buckets.Buckets?.length || 0;
    } catch (err) {
      console.error("S3 query failed:", err.name || "Error");
      data.s3Buckets = null;
    }

    // Auto Scaling
    try {
      const asg = new AutoScalingClient({ region, credentials });
      const groups = await asg.send(
        new DescribeAutoScalingGroupsCommand({})
      );
      data.asg = groups.AutoScalingGroups?.length || 0;
    } catch (err) {
      console.error(
        "Auto Scaling query failed:",
        err.name || "Error"
      );
      data.asg = null;
    }

    // RDS
    try {
      const rds = new RDSClient({ region, credentials });
      const dbs = await rds.send(
        new DescribeDBInstancesCommand({})
      );

      data.rds = dbs.DBInstances?.length
        ? dbs.DBInstances[0].DBInstanceStatus
        : "No RDS instances";
    } catch (err) {
      console.error("RDS query failed:", err.name || "Error");
      data.rds = "Unavailable";
    }

    // Final response
    data.detectedIssue = detectedIssue;

    console.log("FETCH DATA SUCCESS", {
      ec2Total: data.ec2Total,
      s3Buckets: data.s3Buckets,
      detectedIssue: data.detectedIssue?.type || null,
    });

    return res.json({ data });

  } catch (err) {
    console.error(
      "FETCH DATA FAILED:",
      err.name || "Error",
      err.message || ""
    );

    return res.status(500).json({
      success: false,
      message: "Unable to fetch AWS data.",
      error: err.name || "InternalServerError",
    });
  }
});



// -------------------------------------------------------------------------
// Remediation — the ONE endpoint that can actually change something in AWS.
// Two-phase by design: confirm:false (or omitted) only returns a preview of
// what WOULD happen. Nothing is executed until the frontend sends
// confirm:true, which only happens after a human clicks "Confirm & Execute"
// in the Remediation Agent card.
// -------------------------------------------------------------------------
const SUPPORTED_ACTIONS = new Set(["reboot_instance", "start_instance"]);

app.post("/api/aws/remediate", async (req, res) => {
  const { credentials, region } = resolveCredentials(req.body);
  const { instanceId, action, confirm } = req.body || {};

  if (!SUPPORTED_ACTIONS.has(action)) {
    return res.status(400).json({ success: false, message: `Unsupported action: ${action}` });
  }
  if (!instanceId) {
    return res.status(400).json({ success: false, message: "instanceId is required." });
  }

  const cliVerb = action === "start_instance" ? "start-instances" : "reboot-instances";
  const cliPreview = `aws ec2 ${cliVerb} --instance-ids ${instanceId} --region ${region || "us-east-1"}`;

  if (!confirm) {
    return res.json({ success: true, executed: false, cliPreview, message: "Preview only — resend with confirm:true to execute." });
  }

  try {
    const ec2 = new EC2Client({ region, credentials });
    if (action === "start_instance") {
      await ec2.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));
      res.json({ success: true, executed: true, cliPreview, message: `Start issued for ${instanceId}.` });
    } else {
      await ec2.send(new RebootInstancesCommand({ InstanceIds: [instanceId] }));
      res.json({ success: true, executed: true, cliPreview, message: `Reboot issued for ${instanceId}.` });
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      executed: false,
      cliPreview,
      reasonCode: mapAwsError(err),
      message: err.message,
    });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`CloudNova backend listening on http://localhost:${PORT}`);
});
