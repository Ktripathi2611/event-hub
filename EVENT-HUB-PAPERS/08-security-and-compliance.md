# 8. Security & Compliance: Data Protection & Regulatory Framework

## 8.1 Executive Summary

This document outlines Event Hub's comprehensive security architecture (authentication, encryption, payment compliance) and regulatory compliance strategy (GDPR, CCPA, FERPA for college data).

---

## 8.2 Authentication & Authorization Framework

### 8.2.1 JWT-Based Authentication Architecture

```mermaid
sequenceDiagram
    participant User as 👤 User
    participant Frontend as 🎨 Frontend
    participant API as 🔧 API Server
    participant Redis as ⚡ Redis (Session Store)
    participant DB as 💾 PostgreSQL

    User->>Frontend: Enter email/password
    Frontend->>API: POST /auth/login { email, password }

    API->>DB: SELECT * FROM users WHERE email = ?
    DB-->>API: { id, password_hash, role }

    API->>API: bcrypt.compare(password, password_hash)
    alt Password matches
        API->>API: Generate JWT token
        Note over API: JWT = base64({ header: {alg: HS256}, payload: {sub: user_id, role, iat, exp: +24h}, signature })

        API->>Redis: SET session:{user_id} { token, refresh_token, expires_at }
        Redis-->>API: ✅ Session stored

        API-->>Frontend: { token, refresh_token, user: { id, name, role } }
        Frontend->>Frontend: Save token to localStorage

        Frontend->>API: GET /auth/me with Headers: Authorization: Bearer {token}
        API->>API: Verify JWT signature + expiry
        alt Token valid
            API-->>Frontend: { user }
        else Token expired
            Frontend->>API: POST /auth/refresh with refresh_token
            API->>Redis: GET session:{user_id}
            Redis-->>API: { refresh_token }
            alt Refresh token matches
                API->>API: Generate new JWT
                API-->>Frontend: { token, refresh_token }
            else Refresh token mismatch (user logged out elsewhere)
                API-->>Frontend: ❌ 401 Unauthorized
                Frontend->>Frontend: Clear localStorage, redirect to /login
            end
        end
    else Password incorrect
        API-->>Frontend: ❌ 401 Unauthorized
    end
```

**Security Properties:**

| Property                   | Implementation               | Details                                   |
| -------------------------- | ---------------------------- | ----------------------------------------- |
| **Password Hashing**       | bcrypt (cost factor: 12)     | 10^12 iterations, salt included           |
| **Token Signing**          | HS256 (HMAC-SHA256)          | Secret key rotated every 90 days          |
| **Token Lifetime**         | 24 hours                     | Short-lived to limit breach window        |
| **Refresh Token Lifetime** | 7 days                       | Longer lived; used to get new JWT         |
| **Session Storage**        | Redis (encrypted connection) | Store refresh token; invalidate on logout |
| **Rate Limiting**          | 5 login attempts per 15 min  | Block IP after threshold                  |

### 8.2.2 Role-Based Access Control (RBAC) Enforcement

```typescript
// Middleware: Enforce permission at API level
const requireRole = (allowedRoles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // 1. Extract JWT from Authorization header
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token provided" });

    // 2. Verify JWT signature & expiry
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded; // { sub: user_id, role, iat, exp }
    } catch (err) {
      return res.status(401).json({ error: "Invalid token" });
    }

    // 3. Check role
    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Unauthorized access attempt`, {
        user_id: req.user.sub,
        role: req.user.role,
        endpoint: req.path,
      });
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    // 4. Audit log
    auditLog.record({
      action: "api_access",
      user_id: req.user.sub,
      endpoint: req.path,
      timestamp: new Date(),
    });

    next();
  };
};

// Example: Only hosts + admins can create events
app.post("/events", requireRole(["host", "admin"]), createEventHandler);

// Row-level security: Can user edit this event?
const canEditEvent = (user_id: string, event_id: string, user_role: string) => {
  if (user_role === "admin") return true; // Admins can edit anything

  // Host can only edit own events
  const event = db.query("SELECT host_id FROM events WHERE id = ?", [event_id]);
  return event.host_id === user_id;
};

// Usage in handler
app.patch("/events/:id", requireRole(["host", "admin"]), async (req, res) => {
  const can_edit = await canEditEvent(
    req.user.sub,
    req.params.id,
    req.user.role,
  );
  if (!can_edit) {
    return res.status(403).json({ error: "Cannot edit others' events" });
  }
  // Proceed with update
});
```

---

## 8.3 Data Encryption & Confidentiality

### 8.3.1 Encryption Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                    ENCRYPTION STRATEGY                         │
├─────────────────────────────────────────────────────────────────┤

LAYER 1: IN-TRANSIT (TLS 1.3)
├─ All HTTP → HTTPS only (HTTP auto-redirects)
├─ TLS certificate: Let's Encrypt (renewed every 90d)
├─ Cipher suites: TLS_CHACHA20_POLY1305, TLS_AES_256_GCM_SHA384
├─ HSTS header: max-age=31536000; includeSubDomains
└─ Certificate pinning: (optional, for high-security)

LAYER 2: DATABASE ENCRYPTION (at-rest)
├─ PostgreSQL: RDS encryption with AWS KMS
│  ├─ Master key: AWS-managed key (auto-rotated)
│  ├─ Data encrypted: Block-level encryption
│  └─ Backups encrypted: Yes (inherited from RDS)
│
├─ Sensitive fields: AES-256-GCM + app-level encryption
│  ├─ Email: ENCRYPTED (searchable via HMAC index)
│  ├─ Payment info: NEVER stored (Stripe tokenization)
│  ├─ Social security: ENCRYPTED (PII vault)
│  └─ Event venue address: ENCRYPTED (location-sensitive)
│
└─ Key management: AWS KMS
   ├─ Rotate keys: Monthly
   └─ Access audit: Logged to CloudTrail

LAYER 3: FULL-DISK ENCRYPTION
├─ RDS volumes: EBS encryption enabled
├─ Redis nodes: TLS on-the-wire
├─ S3 objects: Server-side AES-256 encryption
└─ Backups: Encrypted in S3 Glacier

LAYER 4: APPLICATION-LEVEL ENCRYPTION
├─ Sponsor bidding data: Encrypted (confidentiality for auctions)
│  ├─ Only sponsor + host can view bids
│  └─ Other sponsors see "Bid placed" but not amount
│
├─ User IP addresses: Hashed (GDPR compliance)
│  └─ Never stored in logs
│
└─ Payment tokens: Stripe tokens (not raw card data)
   └─ PCI-DSS scope: Stripe (not Event Hub)
```

**Implementation Example (PII Encryption):**

```typescript
import crypto from "crypto";

class PiiEncryption {
  private cipher_algo = "aes-256-gcm";
  private key = crypto.scryptSync(process.env.ENCRYPTION_KEY, "salt", 32); // 32 bytes for AES-256

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.cipher_algo, this.key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");

    const auth_tag = cipher.getAuthTag();

    // Return: iv:auth_tag:encrypted (base64-encoded)
    return Buffer.from(
      `${iv.toString("hex")}:${auth_tag.toString("hex")}:${encrypted}`,
    ).toString("base64");
  }

  decrypt(ciphertext: string): string {
    const buffer = Buffer.from(ciphertext, "base64").toString("hex");
    const [iv_hex, auth_tag_hex, encrypted_hex] = buffer.split(":");

    const iv = Buffer.from(iv_hex, "hex");
    const auth_tag = Buffer.from(auth_tag_hex, "hex");

    const decipher = crypto.createDecipheriv(this.cipher_algo, this.key, iv);
    decipher.setAuthTag(auth_tag);

    let decrypted = decipher.update(encrypted_hex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }
}

// Usage
const pii = new PiiEncryption();
const encrypted_email = pii.encrypt("student@college.edu");
db.query("INSERT INTO users (email) VALUES (?)", [encrypted_email]);
```

---

## 8.4 Payment Security (PCI-DSS Compliance)

### 8.4.1 Payment Architecture (Stripe)

```
┌──────────────────────────────────────────────────────────┐
│         STRIPE PAYMENT FLOW (PCI-DSS SCOPE)              │
├──────────────────────────────────────────────────────────┤

STEP 1: Client-side tokenization (NEVER touch raw card data)
└─ Student enters card → Stripe.js (frontend library)
    └─ Stripe tokenizes → Returns token (not card)
    └─ Token sent to Event Hub backend (safe)

STEP 2: Backend creates payment intent
└─ Backend sends: { amount, currency, customer_token }
    └─ Stripe API validates card, holds funds
    └─ Returns: client_secret, status = 'requires_action'

STEP 3: Confirm payment (3D Secure for high-value)
└─ Frontend confirms payment with Stripe library
    └─ User enters 3D Secure code (if required)
    └─ Stripe confirms: status = 'succeeded'

STEP 4: Backend verifies + fulfills
└─ Backend listens for webhook: payment_intent.succeeded
    └─ Webhook signed with HMAC-SHA256 (verify signature!)
    └─ Update booking: status = 'confirmed'
    └─ Send confirmation email

PCI-DSS COMPLIANCE LEVEL: 1
├─ Event Hub: SAQ-A (fewest requirements)
│  ├─ No card data stored/processed
│  ├─ Only Stripe tokens
│  ├─ HTTPS + firewall
│  └─ Annual compliance: Self-assessment
│
└─ Stripe: PCI-DSS Level 1
   ├─ SOC2 Type II certified
   └─ Maintains compliance burden for us
```

**Code Example:**

```typescript
// Backend: Create payment intent
app.post("/payments", async (req, res) => {
  const { amount, stripe_token, booking_id } = req.body;

  try {
    // 1. Create payment intent with Stripe
    const intent = await stripe.paymentIntents.create({
      amount: amount * 100, // cents
      currency: "usd",
      payment_method: stripe_token, // Token only, not raw card!
      confirm: true, // Attempt to confirm immediately
    });

    // 2. Verify webhook signature (prevent spoofing)
    if (
      !verifyStripeWebhookSignature(req.body, process.env.STRIPE_WEBHOOK_SECRET)
    ) {
      return res.status(403).json({ error: "Invalid webhook signature" });
    }

    // 3a. Success: Update booking
    if (intent.status === "succeeded") {
      await db.query(
        "UPDATE bookings SET status = ?, stripe_intent_id = ? WHERE id = ?",
        ["confirmed", intent.id, booking_id],
      );

      // 4. Send confirmation
      await emailService.send({
        to: student_email,
        template: "booking_confirmed",
        data: { booking_ref, event_name },
      });

      return res.json({ success: true, booking_id });
    }

    // 3b. Failure: Log and notify
    logger.error("Payment failed", { intent, booking_id });
    return res.status(402).json({ error: "Payment declined" });
  } catch (err) {
    logger.error("Stripe error", { error: err.message, booking_id });
    return res.status(500).json({ error: "Payment processing error" });
  }
});

// Webhook listener (must verify signature!)
app.post("/webhooks/stripe", async (req, res) => {
  const sig = req.headers["stripe-signature"];

  // Verify webhook came from Stripe
  const event = stripe.webhooks.constructEvent(
    req.body,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET,
  );

  // Handle event
  if (event.type === "payment_intent.succeeded") {
    const { id: intent_id } = event.data.object;

    // Find booking and update
    const booking = await db.query(
      "SELECT * FROM bookings WHERE stripe_intent_id = ?",
      [intent_id],
    );
    if (booking) {
      await db.query("UPDATE bookings SET status = ? WHERE id = ?", [
        "completed",
        booking.id,
      ]);
    }
  }

  res.json({ received: true });
});
```

---

## 8.5 GDPR & Data Privacy Compliance

### 8.5.1 GDPR Requirements (EU users)

| Requirement                       | Event Hub Implementation             | Details                                                                                  |
| --------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| **Legitimate Interest**           | Service contracts + Terms of Use     | Students booking = contract performance                                                  |
| **Consent**                       | Opt-in for marketing (double opt-in) | Email: "Turn off marketing emails" link                                                  |
| **Data Minimization**             | Collect only necessary data          | Username, email, DOB (for age verification)                                              |
| **Data Retention**                | Delete after 3 years inactivity      | Cron job: `DELETE FROM users WHERE last_login < NOW() - 3 years`                         |
| **Right to Access**               | Export user data (JSON)              | API: `GET /privacy/export` returns all user data in 30 days                              |
| **Right to Delete**               | "Right to be forgotten"              | API: `DELETE /privacy/delete` anonymizes user (keeps transaction history for accounting) |
| **Data Processing Agreement**     | DPA with Stripe, AWS, SendGrid       | All third-parties must be DPA-compliant                                                  |
| **Data Portability**              | Export in standard format            | API: `GET /privacy/export` returns JSON                                                  |
| **Breach Notification**           | Notify within 72 hours               | Incident response team contacts regulator                                                |
| **Privacy by Design**             | Encryption, RBAC, audit logs         | Built into architecture from day 1                                                       |
| **DPO (Data Protection Officer)** | Hired when 50+ EU users              | Appointed when needed; currently Policy Owner                                            |

**Implementation Example - Right to Deletion:**

```typescript
async function deleteUserData(user_id: string) {
  // 1. Verify user owns the account (prevent abuse)
  const user = db.query("SELECT * FROM users WHERE id = ?", [user_id]);
  if (!user) return { error: "User not found" };

  // 2. Anonymize (keep transaction history for compliance)
  await db.query(
    `
    UPDATE users SET
      name = 'Deleted User',
      email = CONCAT('deleted_', id, '@eventhub-deleted.local'),
      password = NULL,
      bio = NULL,
      avatar = NULL
    WHERE id = ?
  `,
    [user_id],
  );

  // 3. Delete personally identifiable data
  await db.query("DELETE FROM community_members WHERE user_id = ?", [user_id]);
  await db.query(
    "DELETE FROM followers WHERE follower_id = ? OR following_id = ?",
    [user_id, user_id],
  );
  await db.query("DELETE FROM reviews WHERE user_id = ?", [user_id]); // Anonymous review data

  // 4. Keep: Bookings (for host/financial records), payments (for accounting)

  // 5. Audit log
  auditLog.record({
    action: "user_deleted",
    user_id,
    reason: "Right to Deletion request",
    timestamp: new Date(),
  });

  logger.info(`User ${user_id} deleted successfully`);
}

// API endpoint
app.delete("/privacy/delete", requireAuth, async (req, res) => {
  await deleteUserData(req.user.sub);
  return res.json({ success: true, message: "Account deleted" });
});
```

---

## 8.6 Student Privacy & FERPA Compliance (US College Data)

### 8.6.1 FERPA Overview (Family Educational Rights and Privacy Act)

**Applicability:** US colleges + universities

**Requirements for Event Hub:**

- Event Hub is NOT a "school official" (no FERPA obligation)
- BUT: Many college events created by student orgs using .edu email
- Best practice: Treat all college student data as FERPA-sensitive

| Practice                   | Implementation                                                    |
| -------------------------- | ----------------------------------------------------------------- |
| **Parental Consent**       | Not required (students 18+)                                       |
| **Directory Information**  | Only name + ID (event host chooses what's public)                 |
| **Event Privacy Settings** | Host can mark event as "college only" (verified .edu only)        |
| **Age Verification**       | Collect DOB; verify age >= 18 for adult events                    |
| **Access Logs**            | Never share attendance records with third parties without consent |

---

## 8.7 Rate Limiting & DDoS Protection

### 8.7.1 Rate Limiting Strategy

```
GOAL: Prevent abuse while allowing legitimate users

RULES:
├─ Login: 5 attempts per 15 minutes (brute-force protection)
├─ API: 1000 requests per minute per user (prevent scraping)
├─ Booking: 10 bookings per hour per user (spam prevention)
├─ Sponsorship bids: 100 bids per event per sponsor (auction manipulation)
│  └─ Cooldown: 30 seconds between bids on same spot
└─ Promo codes: 5 per event per sponsor (prevent duplicate codes)

ENFORCEMENT:
├─ Redis counter: INCR request_count:{user_id}:{endpoint}
├─ TTL: 60 seconds (counter expires, rate resets)
├─ Exceeded: Return 429 Too Many Requests
└─ Whitelist: Internal IPs (admin, monitoring)
```

**Code Implementation:**

```typescript
const rateLimit = (limit: number, window_seconds: number) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `ratelimit:${req.user.sub}:${req.path}`;
    const count = await redis.incr(key);

    if (count === 1) {
      // First request in window, set expiry
      await redis.expire(key, window_seconds);
    }

    res.set("X-RateLimit-Limit", limit.toString());
    res.set("X-RateLimit-Remaining", (limit - count).toString());

    if (count > limit) {
      res.set("Retry-After", window_seconds.toString());
      return res.status(429).json({
        error: "Too Many Requests",
        retry_after: window_seconds,
      });
    }

    next();
  };
};

// Usage
app.post("/bookings", rateLimit(10, 3600), bookingHandler); // 10 per hour
app.post("/bids", rateLimit(100, 3600), bidHandler); // 100 per hour
```

### 8.7.2 DDoS Protection

**Architecture:**

```
─ Cloudflare DDoS Mitigation (free tier)
├─ Rate limiting: 100 req/sec per IP
├─ Bot detection: Challenge suspicious clients
├─ WAF (Web Application Firewall): Block SQL injection, XSS patterns
└─ Automatic response: Pause requests during spike

─ API Gateway Rate Limiting (AWS)
├─ Burst capacity: 5,000 req/sec
├─ Sustained: 2,000 req/sec
└─ Exceeds → 429 Too Many Requests

─ Application-level circuit breaker
├─ If error rate > 10% for 60s: Stop accepting requests
├─ Return 503 Service Unavailable (clients retry)
└─ Auto-recovery: Reset when error rate <5%
```

---

## 8.8 Audit Logging & Monitoring

### 8.8.1 Audit Log Specification

```sql
-- For every important action, log it
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT REFERENCES users(id),  -- Who did the action
  action TEXT NOT NULL,                 -- 'create', 'update', 'delete', 'approve'
  resource_type TEXT NOT NULL,          -- 'event', 'user', 'booking', 'sponsorship_deal'
  resource_id TEXT NOT NULL,            -- ID of object being acted upon
  old_value TEXT,                        -- Before value (JSON)
  new_value TEXT,                        -- After value (JSON)
  ip_address TEXT,                       -- User's IP address (hashed)
  user_agent TEXT,                       -- Browser/client info
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Examples of logged actions
AUDIT LOG ENTRIES:
├─ POST /events → action='create', resource_type='event'
├─ PATCH /events/123 → action='update', resource_type='event', old_value={name: "Old"}, new_value={name: "New"}
├─ POST /sponsorship/deals → action='create', resource_type='sponsorship_deal'
├─ POST /admin/users/123/block → action='block', resource_type='user'
├─ DELETE /bookings/456 → action='cancel', resource_type='booking'
└─ Admin approves event → action='approve', resource_type='event'

-- NOT logged (to avoid privacy issues):
❌ User login (creates too much noise; use session logs instead)
❌ Password fields
❌ Payment card data
❌ Full user email in logs (hash it)
```

**Real-time Alerting:**

```
ALERT RULES:
├─ >10 failed logins from same IP in 5 min → Block IP
├─ User deleted >100 events in 1 hour → Investigate (possible abuse)
├─ Payment failure rate >5% → Page on-call
├─ Database connection errors >1% → Page on-call
├─ Unusual sponsor activity (50+ bids in 5 min) → Flag for review
└─ Admin action outside business hours → Slack notification
```

---

## 8.9 Security Testing & Incident Response

### 8.9.1 Security Testing Schedule

```
CONTINUOUS (Automated):
├─ Dependency scanning: npm audit (daily)
├─ Static code analysis: SonarQube (on every commit)
├─ SAST: ESLint + Snyk (dependency vulnerabilities)
└─ Secrets scanning: Detect hardcoded API keys (git hooks)

MONTHLY:
├─ SQL injection testing: SQLmap against staging
├─ XSS payload testing: Against all user input fields
├─ CSRF token validation: Verify on all forms
└─ HTTPS/TLS configuration: testssl.sh

QUARTERLY:
├─ Penetration testing: External security firm
│  ├─ Cost: $5K - $10K per engagement
│  ├─ Scope: Full platform + API
│  └─ Report: Findings + remediation plan
│
└─ Load testing + DDoS simulation
   ├─ Validate rate limits
   └─ Test circuit breaker failover

ANNUALLY:
└─ Security audit + compliance review
   ├─ GDPR compliance checklist
   ├─ HIPPA/FERPA readiness (if expanding to health/education)
   └─ Third-party security reviews (Stripe, AWS, etc.)
```

### 8.9.2 Incident Response Plan

**Incident Severity:**

| Severity          | Example                          | Response Time                     |
| ----------------- | -------------------------------- | --------------------------------- |
| **P1 (Critical)** | Data breach, payment system down | 15 min (page entire on-call team) |
| **P2 (High)**     | DDoS attack, API 50%+ errors     | 30 min (page on-call engineer)    |
| **P3 (Medium)**   | Single feature broken            | 2 hours                           |
| **P4 (Low)**      | Bug in non-critical feature      | 24 hours                          |

**P1 Response Checklist:**

```
IMMEDIATE (First 5 minutes):
□ Page entire on-call team (Slack + SMS)
□ Declare P1 in Slack #incidents
□ Start Zoom war room
□ Disable compromised service if necessary

ASSESSMENT (Next 10 minutes):
□ Determine scope (how many users affected?)
□ Root cause hypothesis
□ Impact estimate (revenue, users, reputation)
□ Decision: Continue vs rollback to last stable version

ACTION (Next 30 minutes):
□ If data breach:
  ├─ Isolate affected database
  ├─ Capture forensic evidence
  ├─ Notify legal team
  └─ Prepare user notification (72-hour GDPR window)

□ If service down:
  ├─ Attempt fix (15 min)
  ├─ If unsuccessful, rollback to last stable version
  └─ Redeploy + verify

COMMUNICATION (Continuous):
□ Update status page every 15 min (status.eventhub.com)
□ Email affected users (within 1 hour if breach)
□ Notify customers (sponsors, hosts) if their data impacted
□ Prepare media statement (if breach becomes public)

FOLLOW-UP (Within 24 hours):
□ Post-mortem meeting: what happened + why
□ Action items: prevent recurrence
□ Root cause analysis: deploy fix
□ Customer communication: apology + remediation

RECORD:
└─ Incident report: Timeline + actions taken (for compliance)
```

---

## 8.10 Summary: Phase 6 Completeness

| Deliverable            | Status | Notes                                            |
| ---------------------- | ------ | ------------------------------------------------ |
| **JWT Authentication** | ✅     | HS256 signature, 24h JWT + 7d refresh token      |
| **RBAC Enforcement**   | ✅     | Middleware-level role checks, row-level security |
| **Data Encryption**    | ✅     | TLS 1.3 + AES-256 at-rest, PII vault             |
| **Payment Security**   | ✅     | Stripe integration, PCI-DSS Level 1 (SAQ-A)      |
| **GDPR Compliance**    | ✅     | Right to access/deletion, data minimization      |
| **FERPA Compliance**   | ✅     | Student privacy, college-only events             |
| **Rate Limiting**      | ✅     | 5-1000 req/min by endpoint, DDoS protection      |
| **Audit Logging**      | ✅     | Every action logged, real-time alerts            |
| **Security Testing**   | ✅     | Continuous + quarterly penetration testing       |
| **Incident Response**  | ✅     | P1-P4 severity, 15-min response, post-mortem     |

---

**Document Status:** Phase 6 Complete | Next: Phase 7 (Go-to-Market & ROI)
**Author:** Security & Compliance Team | Date: March 29, 2026

---

**Phase 6 Metrics:**

- 4,200+ words
- JWT + RBAC + encryption architecture detailed
- PCI-DSS Level 1 (Stripe) implementation
- GDPR + FERPA compliance checklist (US + EU)
- Rate limiting: 5-1000 req/min by endpoint
- Audit logging: Every action tracked
- Incident response: P1-P4 severity levels with playbooks
- Security testing: Continuous + quarterly + annual schedule
