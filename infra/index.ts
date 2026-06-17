import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const cfg = new pulumi.Config();
const accountId = cfg.require("accountId");
const region = cfg.require("region");
const hostname = cfg.require("hostname");
const certArn = cfg.require("certArn");
// AWS account-regional namespace requires the name to follow the
// <name>-<accountId>-<region>-an convention (per provider docs example).
const bucketName = `ciphersheet-passkey-${accountId}-${region}-an`;

// AWS-managed "CachingOptimized" policy — same ID in all regions.
const CACHING_OPTIMIZED_POLICY_ID = "658327ea-f89d-4fab-a63d-7e88639e58f6";

// ── S3 bucket (OAC-only, versioning + Object Lock) ───────────────────────────

const bucket = new aws.s3.Bucket("passkey-bucket", {
    bucket: bucketName,
    bucketNamespace: "account-regional",
    objectLockEnabled: true,
    tags: { Project: "ciphersheet", Env: "prod" },
}, { protect: true });

new aws.s3.BucketVersioning("passkey-bucket-versioning", {
    bucket: bucket.id,
    versioningConfiguration: { status: "Enabled" },
});

// GOVERNANCE mode: bucket owner can remove via override; switch to COMPLIANCE
// for a stricter "no deletions ever" posture (requires MFA delete too).
new aws.s3.BucketObjectLockConfiguration("passkey-bucket-object-lock", {
    bucket: bucket.id,
    rule: {
        defaultRetention: { mode: "GOVERNANCE", days: 30 },
    },
});

new aws.s3.BucketPublicAccessBlock("passkey-bucket-bpa", {
    bucket: bucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
});

// ── OAC ─────────────────────────────────────────────────────────────────────

const oac = new aws.cloudfront.OriginAccessControl("passkey-bucket-oac", {
    name: `oac-${bucketName}`,
    originAccessControlOriginType: "s3",
    signingBehavior: "always",
    signingProtocol: "sigv4",
});

// ── Response headers policy ──────────────────────────────────────────────────
// The popup is a single self-contained HTML file with inline script.
// We derive the script hash at deploy time so CSP blocks injected scripts.

const popupHtmlPath = path.join(__dirname, "../docs/prf-popup.html");
let popupSrc: string;
try {
    popupSrc = fs.readFileSync(popupHtmlPath, "utf8");
} catch (e) {
    throw new pulumi.RunError(`Cannot read ${popupHtmlPath}: ${e}`);
}
const scriptMatch = popupSrc.match(/<script>([\s\S]*?)<\/script>/);
const scriptHash = scriptMatch
    ? "sha256-" + crypto
          .createHash("sha256")
          .update(scriptMatch[1])
          .digest("base64")
    : null;

// Build CSP — only allow the inline script by hash, nothing else.
const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",  // inline <style> block in the same file
    scriptHash ? `script-src '${scriptHash}'` : "script-src 'none'",
    "frame-ancestors 'none'",
].join("; ");

const rhp = new aws.cloudfront.ResponseHeadersPolicy("passkey-cf-headers", {
    name: "ciphersheet-passkey-headers",
    securityHeadersConfig: {
        strictTransportSecurity: {
            override: true,
            accessControlMaxAgeSec: 63072000, // 2 years
            includeSubdomains: false,         // don't bleed to yuvalsadan.com subdomains
            preload: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: "DENY", override: true },
        xssProtection: { modeBlock: true, protection: true, override: true },
        referrerPolicy: { referrerPolicy: "no-referrer", override: true },
        contentSecurityPolicy: { contentSecurityPolicy: csp, override: true },
    },
    customHeadersConfig: {
        items: [
            {
                header: "Permissions-Policy",
                // Only publickey-credentials-get/create needed; deny everything else.
                value: "publickey-credentials-get=(*), publickey-credentials-create=(*)",
                override: true,
            },
        ],
    },
});

// ── CloudFront distribution ──────────────────────────────────────────────────

const distribution = new aws.cloudfront.Distribution("passkey-cf-distro", {
    enabled: true,
    aliases: [hostname],
    defaultRootObject: "prf-popup.html",
    origins: [{
        originId: bucketName,
        domainName: bucket.bucketRegionalDomainName,
        originAccessControlId: oac.id,
    }],
    defaultCacheBehavior: {
        targetOriginId: bucketName,
        viewerProtocolPolicy: "redirect-to-https",
        allowedMethods: ["GET", "HEAD"],
        cachedMethods: ["GET", "HEAD"],
        cachePolicyId: CACHING_OPTIMIZED_POLICY_ID,
        responseHeadersPolicyId: rhp.id,
        compress: true,
    },
    restrictions: { geoRestriction: { restrictionType: "none" } },
    viewerCertificate: {
        acmCertificateArn: certArn,
        sslSupportMethod: "sni-only",
        minimumProtocolVersion: "TLSv1.2_2021",
    },
    tags: { Project: "ciphersheet", Env: "prod" },
}, { protect: true });

// ── Bucket policy: allow CloudFront OAC only ─────────────────────────────────

const bucketPolicy = new aws.s3.BucketPolicy("passkey-bucket-policy", {
    bucket: bucket.id,
    policy: pulumi.all([bucket.arn, distribution.arn]).apply(
        ([bucketArn, distroArn]) =>
            JSON.stringify({
                Version: "2012-10-17",
                Statement: [{
                    Sid: "AllowCloudFrontOAC",
                    Effect: "Allow",
                    Principal: { Service: "cloudfront.amazonaws.com" },
                    Action: "s3:GetObject",
                    Resource: `${bucketArn}/*`,
                    Condition: {
                        StringEquals: {
                            "AWS:SourceArn": distroArn,
                        },
                    },
                }],
            })
    ),
});

// ── Upload prf-popup.html ────────────────────────────────────────────────────

new aws.s3.BucketObjectv2("passkey-bucket-prf-popup", {
    bucket: bucket.id,
    key: "prf-popup.html",
    source: new pulumi.asset.FileAsset("../docs/prf-popup.html"),
    contentType: "text/html; charset=utf-8",
    // Object Lock: allow this to be overwritten with a new version on deploy
    // while still protecting against deletion during retention window.
    // (No per-object retention — rely on bucket default.)
}, {
    // Policy must exist before the object is routable through OAC.
    dependsOn: [bucketPolicy],
    // AWS stamps objectLockRetainUntilDate after creation; ignore to avoid spurious diffs.
    ignoreChanges: ["objectLockRetainUntilDate"],
});

// ── Outputs ──────────────────────────────────────────────────────────────────

export const distributionDomain = distribution.domainName;
export const distributionId = distribution.id;
export const bucketId = bucket.id;

// DNS record to create in Porkbun (Pulumi doesn't manage external DNS here):
export const dnsInstruction = pulumi.interpolate`
  Add to DNS for yuvalsadan.com:
    Type:    CNAME
    Name:    ciphersheet-passkey
    Target:  ${distribution.domainName}
  Also add the ACM validation CNAME that the AWS console shows for the cert in us-east-1.
`;
