# 2. Role-Based System Design: RBAC & Permission Architecture

## 2.1 Executive Summary

Event Hub implements a four-role permission model that governs feature access, API endpoint authorization, and frontend UI rendering. This document defines the complete RBAC framework: permission matrices, per-role feature sets, API endpoint protection, and UI rendering logic.

**Roles:**

- **Student** — Event discovery, ticket booking, community engagement
- **Host** — Event creation, ticket management, sponsorship requests, analytics
- **Sponsor** — Bidding on sponsorship opportunities, deal negotiation, ROI tracking
- **Admin** — Platform moderation, user management, financial oversight, compliance

---

## 2.2 Role Definitions & User Profiles

### 2.2.1 STUDENT Role

**Definition:**  
Primary end-user who discovers, books, and attends events. Students are the demand-side of the platform.

**User Profile:**

- College/university affiliates or young professionals
- Age range: 18-35
- Primary device: Mobile
- Time investment: 30 mins/week (event search + booking)

**Permissions Table:**

| Feature                       | Permission  | Rationale                                                     |
| ----------------------------- | ----------- | ------------------------------------------------------------- |
| **Discover Events**           | READ        | Core value; all students can search/filter                    |
| **View Event Details**        | READ        | Attend: venue, date, speaker details, reviews                 |
| **Book Tickets**              | CREATE      | Main action; limit enforced (5 concurrent bookings)           |
| **Cancel Booking**            | DELETE      | Self-service refunds; time-window enforced (7 days pre-event) |
| **Join Waitlist**             | CREATE      | Fallback when event full                                      |
| **Leave Waitlist**            | DELETE      | Self-service removable                                        |
| **View My Bookings**          | READ        | My tickets dashboard                                          |
| **Accept Waitlist Promotion** | UPDATE      | Auto-accept or explicit confirmation                          |
| **Write Reviews**             | CREATE      | Post-event feedback (1 review per event)                      |
| **Edit Own Review**           | UPDATE      | Correct typos within 24h                                      |
| **Delete Own Review**         | DELETE      | Retract feedback                                              |
| **View Community Events**     | READ        | Community-specific events                                     |
| **Join Communities**          | CREATE      | Self-join public communities                                  |
| **Leave Communities**         | DELETE      | Self-leave with data cleanup                                  |
| **Post to Community**         | CREATE      | Threaded discussions (moderation flagging)                    |
| **Add to Wishlist**           | CREATE      | Bookmark for later                                            |
| **Remove from Wishlist**      | DELETE      | Clean up saved events                                         |
| **Send/Receive Messages**     | CREATE/READ | Private chats with hosts (sponsorship Q&A)                    |
| **Share Event**               | CREATE      | Generate referral link; track shares                          |
| **View Notifications**        | READ        | Real-time event updates                                       |
| **Check In (via QR)**         | UPDATE      | Scan QR code at venue (host permission required)              |
| **Use Promo Code**            | READ/USE    | Apply discount at booking                                     |
| **Track Referral Earnings**   | READ        | See referral commission balance                               |
| **Upgrade to Host**           | UPDATE      | Self-service role transition (approval required)              |
| **Upgrade to Sponsor**        | UPDATE      | Self-service role transition; requires company info           |

**API Endpoints Accessible:**

```
# Event Discovery
GET    /api/events
GET    /api/events/:id
GET    /api/events/search?q=...&category=...&date=...&latitude=...&longitude=...&radius=...
GET    /api/categories
GET    /api/trending-events

# Bookings
POST   /api/bookings
GET    /api/bookings
GET    /api/bookings/:id
DELETE /api/bookings/:id/cancel
GET    /api/bookings/:id/qr-code

# Waitlist
POST   /api/waitlist
DELETE /api/waitlist/:id
GET    /api/waitlist/:event_id/position  # User's position

# Reviews & Feedback
POST   /api/events/:id/reviews
GET    /api/events/:id/reviews
PATCH  /api/reviews/:id
DELETE /api/reviews/:id

# Communities
GET    /api/communities
GET    /api/communities/:id
POST   /api/communities/:id/members  # Self-join
DELETE /api/communities/:id/members/:user_id  # Self-leave
POST   /api/communities/:id/posts
GET    /api/communities/:id/posts

# Wishlists
POST   /api/wishlists
GET    /api/wishlists
DELETE /api/wishlists/:id

# Messaging
POST   /api/messages
GET    /api/messages/:conversation_id

# Referrals
GET    /api/referrals/balance
POST   /api/referrals/share

# Profile
GET    /api/users/:id  # Public profile
PATCH  /api/users/:id  # Self-only
```

**Rate Limits:**

```
- Search events: 30 req/minute
- Create booking: 5 per hour
- Post review: 1 per hour
- Send message: 10 per hour
```

**UI Views (Frontend Routes):**

```
/events
  ├── /events/search
  ├── /events/:id  (detail page)
  └── /events/:id/reviews

/dashboard
  ├── /dashboard/student
  │   ├── /dashboard/student/my-bookings
  │   ├── /dashboard/student/waitlist
  │   ├── /dashboard/student/wishlist
  │   └── /dashboard/student/communities
  └── /dashboard/settings/upgrade-to-host

/communities
  ├── /communities/:id
  └── /communities/:id/posts

/profile/:user_id
  ├── /profile/:user_id/reviews
  └── /profile/:user_id/followed-events
```

**Restrictions & Limitations:**

```
- Max 5 concurrent event bookings (encourage attendance)
- Cancellation allowed only 7 days before event
- 1 review per event per user (no duplicates)
- Waitlist size capped at 50 (prevent spam)
- Cannot book same event twice (duplicate check)
- Cannot access other students' booking details
- Cannot modify host/sponsor/admin role directly (requires approval)
```

---

### 2.2.2 HOST Role

**Definition:**  
Event organizer who creates events, manages tickets, negotiates sponsorships, and tracks analytics. Hosts are supply-side creators.

**User Profile:**

- College clubs, small venues, regional organizers
- Age range: 18-55
- Primary device: Desktop + Mobile
- Time investment: 5-10 hours/week (event creation, sponsor management)

**Permissions Table:**

| Feature                          | Permission           | Rationale                                             |
| -------------------------------- | -------------------- | ----------------------------------------------------- |
| **Create Event**                 | CREATE               | Core action; pending approval (admin review)          |
| **Edit Event**                   | UPDATE               | Modify details until 48h before start                 |
| **Cancel Event**                 | DELETE               | Soft-delete with cascading refunds                    |
| **View Event Analytics**         | READ                 | Real-time registrations, revenue, demographics        |
| **Create Ticket Types**          | CREATE               | Define pricing tiers (e.g., Early Bird, Regular, VIP) |
| **Edit Ticket Price**            | UPDATE               | Dynamic pricing until 72h before event                |
| **View Attendee List**           | READ                 | Registrations + contact info                          |
| **Send Message to Attendee**     | CREATE               | Broadcast/direct messages (pre-event reminders)       |
| **Manage Sponsorship Spots**     | CREATE/UPDATE/DELETE | Define booth/banner/stall availability                |
| **Request Sponsor**              | CREATE               | Initiate outbound sponsorship pitch                   |
| **Review Sponsorship Proposal**  | READ/UPDATE          | View bid from sponsor; accept/reject/negotiate        |
| **Send Sponsorship Message**     | CREATE               | Negotiate deal terms directly                         |
| **View Sponsorship Analytics**   | READ                 | ROI by sponsor, spend tracking                        |
| **Create Promo Code**            | CREATE               | Discount codes for early bookers, affiliates          |
| **Check In Attendees (QR Scan)** | UPDATE               | Verify attendance via QR code                         |
| **View Check-In Report**         | READ                 | Attendance vs. registration                           |
| **Close Event & Archive**        | UPDATE               | Transition to completed state                         |
| **Export Attendee Data**         | READ/EXPORT          | CSV of registrations (GDPR-compliant)                 |
| **Uplimit Community Events**     | CREATE               | Create private event for community members            |
| **Request Verification Badge**   | UPDATE               | Host verification workflow (identity check)           |
| **Downgrade to Student**         | UPDATE               | Revert role (new student account created)             |

**API Endpoints Accessible:**

```
# Event Management (own events only)
POST   /api/events
GET    /api/events
GET    /api/events/:id
PATCH  /api/events/:id
DELETE /api/events/:id

# Ticket Management
POST   /api/events/:id/tickets
PATCH  /api/events/:id/tickets/:ticket_id
DELETE /api/events/:id/tickets/:ticket_id

# Attendee Management
GET    /api/events/:id/attendees
GET    /api/events/:id/attendees/export  (CSV)
POST   /api/events/:id/send-message

# Sponsorship Management
POST   /api/events/:id/sponsor-spots
GET    /api/events/:id/sponsor-spots
PATCH  /api/events/:id/sponsor-spots/:spot_id
DELETE /api/events/:id/sponsor-spots/:spot_id
POST   /api/sponsorship-requests  (outbound to sponsors)
GET    /api/sponsorship-deals  (host view)
PATCH  /api/sponsorship-deals/:id
POST   /api/sponsorship-deals/:id/messages

# Analytics (own events)
GET    /api/analytics/events/:id
GET    /api/analytics/host/:host_id

# Check-In
POST   /api/check-in/:booking_id

# Promo Codes
POST   /api/promo-codes
GET    /api/promo-codes  (by host)
PATCH  /api/promo-codes/:id
DELETE /api/promo-codes/:id

# Communities
POST   /api/communities  (host-created)
PATCH  /api/communities/:id

# FAQ & Q&A
POST   /api/events/:id/faqs
PATCH  /api/events/:id/faqs/:faq_id
DELETE /api/events/:id/faqs/:faq_id
```

**Rate Limits:**

```
- Create event: 5 per day
- Create promo code: 10 per day
- Send bulk message: 3 per day (max 1000 attendees/message)
- Sponsor request: 10 per month
```

**UI Views:**

```
/dashboard/host
  ├── /dashboard/host/my-events
  │   ├── /dashboard/host/events/:id/edit
  │   ├── /dashboard/host/events/:id/analytics
  │   ├── /dashboard/host/events/:id/attendees
  │   ├── /dashboard/host/events/:id/sponsorship
  │   └── /dashboard/host/events/:id/check-in
  ├── /dashboard/host/sponsorship
  │   ├── /dashboard/host/sponsorship/requests
  │   ├── /dashboard/host/sponsorship/deals
  │   └── /dashboard/host/sponsorship/:deal_id/negotiate
  ├── /dashboard/host/promo-codes
  └── /dashboard/host/analytics (platform-wide host stats)
```

**Restrictions:**

```
- Cannot edit event after 48h before start (freeze details)
- Cannot delete event (only soft-delete) to preserve booking history
- Cannot access other hosts' event analytics (data isolation)
- Cannot refund via platform (must use external payment system) — future enhancement
- Cannot message attendees before event is approved (spam prevention)
- Max 10 sponsor spots per event (reduce complexity)
- Cannot view attendee email addresses directly (privacy); use in-app messaging only
- Cannot downgrade to student while events are pending/live
```

---

### 2.2.3 SPONSOR Role

**Definition:**  
Brand or business seeking to reach audiences via event sponsorships. Sponsors provide funding and resources in exchange for visibility and attendee access.

**User Profile:**

- Local businesses, SaaS companies, agencies
- Marketing budget: $1K-$100K+/year
- Primary device: Desktop
- Time investment: 3-5 hours/week (bid review, market monitoring)

**Permissions Table:**

| Feature                            | Permission    | Rationale                                       |
| ---------------------------------- | ------------- | ----------------------------------------------- |
| **View Sponsorship Opportunities** | READ          | Browse open sponsor spots across events         |
| **Place Bid on Spot**              | CREATE        | Propose amount for booth/banner/stall           |
| **Edit Bid Amount**                | UPDATE        | Adjust bid before event/host closes auction     |
| **Cancel Bid**                     | DELETE        | Withdraw if outbid or change priority           |
| **Receive Outbound Request**       | READ          | Host initiates sponsorship pitch                |
| **Accept Sponsorship Request**     | UPDATE        | Agree to host's proposed terms                  |
| **Reject Sponsorship Request**     | UPDATE        | Decline with optional note                      |
| **Negotiate Deal Terms**           | CREATE/READ   | Message-based negotiation (price, deliverables) |
| **View Deal Analytics**            | READ          | Attendee reach, event metrics, ROI              |
| **Send Message to Host**           | CREATE        | Ask questions during negotiation                |
| **Pay Invoice**                    | CREATE/UPDATE | Pay sponsorship amount (payment processing)     |
| **View Sponsorship History**       | READ          | Past deals + performance metrics                |
| **Rate Host**                      | CREATE        | Post-event feedback on organizer                |
| **Track Referral Earnings**        | READ          | Commission from referred sponsors               |
| **Upgrade Sponsor Profile**        | UPDATE        | Add company logo, website, description          |
| **Downgrade to Student**           | UPDATE        | Revert role                                     |

**API Endpoints Accessible:**

```
# Sponsorship Discovery
GET    /api/sponsorship-opportunities
GET    /api/sponsorship-opportunities/:id
GET    /api/sponsorship-opportunities/search?category=...&region=...&date_range=...

# Bidding
POST   /api/bids
PATCH  /api/bids/:id
DELETE /api/bids/:id
GET    /api/bids  (sponsor's bids)

# Deal Management (inbound requests)
GET    /api/sponsorship-requests  (to me)
PATCH  /api/sponsorship-requests/:id  (accept/reject)
GET    /api/sponsorship-deals  (sponsor view)
PATCH  /api/sponsorship-deals/:id

# Communication
POST   /api/sponsorship-deals/:id/messages
GET    /api/sponsorship-deals/:id/messages

# Analytics
GET    /api/analytics/sponsor/:sponsor_id
GET    /api/analytics/deal/:deal_id/roi

# Invoicing
POST   /api/invoices
GET    /api/invoices
PATCH  /api/invoices/:id/pay

# Ratings
POST   /api/sponsor-ratings

# Profile
GET    /api/sponsors/:id
PATCH  /api/sponsors/:id
```

**Rate Limits:**

```
- Place bid: 50 per day
- Send message: 20 per day
- Make payment: 5 per day (fraud detection)
```

**UI Views:**

```
/sponsorship-marketplace
  ├── /sponsorship-marketplace/opportunities
  ├── /sponsorship-marketplace/opportunities/:id
  └── /sponsorship-marketplace/search

/dashboard/sponsor
  ├── /dashboard/sponsor/my-bids
  ├── /dashboard/sponsor/my-deals
  │   ├── /dashboard/sponsor/deals/:id
  │   └── /dashboard/sponsor/deals/:id/negotiate
  ├── /dashboard/sponsor/analytics
  ├── /dashboard/sponsor/history
  └── /dashboard/sponsor/profile
```

**Restrictions:**

```
- Cannot view other sponsors' bids (auction confidentiality)
- Cannot directly contact attendees (only via host-approved channels)
- Cannot access attendee email/phone without explicit consent
- Cannot edit bid after event is <7 days away (fairness)
- Cannot cancel accepted deal (commitment binding)
- Cannot downgrade while active deals exist
- Max 100 active bids simultaneously (fraud prevention)
```

---

### 2.2.4 ADMIN Role

**Definition:**  
Platform operator with full system access: moderation, user management, financial oversight, compliance, and data governance.

**User Profile:**

- Internal operations team (2-5 staff initially)
- Full-time platform operators
- Primary device: Desktop
- Time investment: 40+ hours/week

**Permissions Table:**

| Feature                         | Permission           | Rationale                                          |
| ------------------------------- | -------------------- | -------------------------------------------------- |
| **View All Events**             | READ                 | Platform-wide visibility (no event isolation)      |
| **Approve/Reject Events**       | UPDATE               | Review pending events; enforce guidelines          |
| **Feature Events**              | UPDATE               | Promote to homepage carousel                       |
| **Suspend Event**               | UPDATE               | Pause registrations (compliance/safety)            |
| **Cancel Event & Refund**       | DELETE               | Enforce Terms of Service; handle refunds           |
| **View All Bookings**           | READ                 | Full booking auditing                              |
| **Refund Booking**              | UPDATE               | Process refunds for refunds (disputes, fraud)      |
| **View All Users**              | READ                 | User directory + metadata                          |
| **Suspend User**                | UPDATE               | Prevent login on policy violation                  |
| **Ban User**                    | UPDATE               | Permanent account closure                          |
| **View User Reports**           | READ                 | Reported content/behavior                          |
| **Process Report**              | UPDATE               | Approve/dismiss/escalate                           |
| **View All Sponsorship Deals**  | READ                 | Platform-wide deal oversight                       |
| **Approve Sponsor Signup**      | UPDATE               | Verify company; activate sponsor account           |
| **View Platform Analytics**     | READ                 | Dashboard: user growth, revenue, key metrics       |
| **Export Platform Data**        | READ/EXPORT          | Auditable reports (CSV, JSON) for compliance       |
| **Manage Promo Codes**          | CREATE/UPDATE/DELETE | Global platform-wide codes (not just host codes)   |
| **View Payment Data**           | READ                 | Stripe/PayPal integration; financial audit         |
| **Settle Payouts**              | UPDATE               | Mark host payouts as processed                     |
| **View Audit Logs**             | READ                 | Full action history (admin changes, user behavior) |
| **Manage Admin Team**           | CREATE/UPDATE/DELETE | Create/revoke admin accounts                       |
| **Configure Platform Settings** | UPDATE               | Commission rates, fee structures, feature flags    |
| **Send Admin Announcement**     | CREATE               | Broadcast to all users (maintenance, policy)       |
| **Manage Categories**           | CREATE/UPDATE/DELETE | Create/rename event categories                     |
| **View Legal Data**             | READ                 | Privacy impact assessments, compliance docs        |

**API Endpoints Accessible:**

```
# Full Event Management (all events)
GET    /api/admin/events
GET    /api/admin/events/:id
PATCH  /api/admin/events/:id  (approve/feature/suspend/cancel)

# User Management
GET    /api/admin/users
GET    /api/admin/users/:id
PATCH  /api/admin/users/:id  (suspend/ban)
DELETE /api/admin/users/:id  (hard delete with GDPR cleanup)

# Reports & Moderation
GET    /api/admin/reports
PATCH  /api/admin/reports/:id  (approve/dismiss)
POST   /api/admin/actions  (log admin action)

# Bookings & Refunds
GET    /api/admin/bookings
PATCH  /api/admin/bookings/:id/refund

# Sponsorship
GET    /api/admin/sponsorship-deals
PATCH  /api/admin/sponsorship-deals/:id
POST   /api/admin/sponsors/:id/approve

# Analytics & Export
GET    /api/admin/analytics/platform
GET    /api/admin/analytics/export?format=csv&date_range=...

# Financial
GET    /api/admin/payouts
GET    /api/admin/revenue
PATCH  /api/admin/payouts/:id/settle

# Configuration
GET    /api/admin/config
PATCH  /api/admin/config  (commission rates, feature flags)

# Audit Logging
GET    /api/admin/audit-logs

# Announcements
POST   /api/admin/announcements
GET    /api/admin/announcements

# Admin Team
POST   /api/admin/admins
GET    /api/admin/admins
DELETE /api/admin/admins/:id
```

**Rate Limits:**

```
- No rate limits on admin endpoints (trusted internal)
- Logging of all admin actions (audit trail)
```

**UI Views:**

```
/admin
  ├── /admin/dashboard  (KPIs, charts)
  ├── /admin/events
  │   ├── /admin/events/pending  (approval queue)
  │   ├── /admin/events/:id/review
  │   └── /admin/events/all
  ├── /admin/users
  │   ├── /admin/users/search
  │   ├── /admin/users/:id/detail
  │   └── /admin/users/:id/actions  (suspend/ban)
  ├── /admin/reports  (moderation queue)
  │   ├── /admin/reports/pending
  │   └── /admin/reports/:id/review
  ├── /admin/sponsorship
  │   ├── /admin/sponsorship/deals
  │   └── /admin/sponsorship/new-sponsors  (approval)
  ├── /admin/analytics
  │   ├── /admin/analytics/platform
  │   ├── /admin/analytics/revenue
  │   └── /admin/analytics/export
  ├── /admin/config
  │   ├── /admin/config/commission
  │   ├── /admin/config/features
  │   └── /admin/config/categories
  ├── /admin/audit-logs
  └── /admin/team
```

**Restrictions:**

```
- No delete of audit logs (immutable for compliance)
- Cannot refund > event revenue (safety check)
- Cannot directly modify user passwords (force password reset instead)
- Multiple approvals required for: user bans, feature flag changes (future)
- All admin actions logged with timestamp + operator ID
```

---

## 2.3 RBAC Implementation Matrix

### 2.3.1 Master Permission Table (All Endpoints)

| Resource        | Endpoint                | GET | CREATE | UPDATE | DELETE | Student | Host        | Sponsor | Admin |
| --------------- | ----------------------- | --- | ------ | ------ | ------ | ------- | ----------- | ------- | ----- |
| **Events**      | /api/events             | ✅  | ✅\*   | ✅\*   | ✅\*   | ✅      | ✅\*\*      | ❌      | ✅    |
|                 | /api/events/:id         | ✅  | ❌     | ✅\*\* | ✅\*\* | ✅      | (own)       | ❌      | ✅    |
| **Bookings**    | /api/bookings           | ✅  | ✅     | ❌     | ✅\*   | (own)   | (own event) | ❌      | ✅    |
|                 | /api/bookings/:id       | ✅  | ❌     | ❌     | ✅     | (own)   | ❌          | ❌      | ✅    |
|                 | /api/check-in           | ❌  | ✅     | ❌     | ❌     | ❌      | ✅\*\*\*    | ❌      | ✅    |
| **Waitlist**    | /api/waitlist           | ✅  | ✅     | ❌     | ✅     | ✅      | ❌          | ❌      | ✅    |
| **Sponsorship** | /api/sponsorship-deals  | ✅  | ✅\*   | ✅     | ❌     | ❌      | ✅\*\*      | ✅\*    | ✅    |
|                 | /api/bids               | ✅  | ✅     | ✅     | ✅     | ❌      | ❌          | ✅      | ✅    |
|                 | /api/sponsor-spots      | ✅  | ✅     | ✅     | ✅     | ❌      | ✅\*\*      | ❌      | ✅    |
| **Analytics**   | /api/analytics/events   | ✅  | ❌     | ❌     | ❌     | ❌      | ✅\*\*      | ✅\*\*  | ✅    |
|                 | /api/analytics/platform | ✅  | ❌     | ❌     | ❌     | ❌      | ❌          | ❌      | ✅    |
| **Admin**       | /api/admin/\*           | ✅  | ✅     | ✅     | ✅     | ❌      | ❌          | ❌      | ✅    |
| **Users**       | /api/users/:id          | ✅  | ❌     | ✅\*\* | ❌     | (own)   | (own)       | (own)   | ✅    |
| **Communities** | /api/communities        | ✅  | ✅     | ✅     | ✅     | ✅      | ✅          | ❌      | ✅    |

**Legend:**

- ✅ = Allowed
- ❌ = Forbidden
- ✅\* = Allowed with conditions
- ✅\*\* = Own resource only
- ✅\*\*\* = Only for own event

### 2.3.2 Backend RBAC Enforcement

**Middleware Stack:**

```typescript
// Express middleware chain
app.use(authMiddleware); // 1. Extract JWT + set req.auth
app.use(validateContentType); // 2. Require JSON for non-GET
app.use(validateInput); // 3. Check schema (zod/joi)

// Route-level RBAC
app.post(
  "/api/events",
  requireRole("host", "admin"), // Enforce role
  validateEventPayload, // Schema validation
  rateLimitCreate, // Apply rate limit
  createEventHandler, // Business logic
);

app.get(
  "/api/events/:id",
  requireAuth, // Some routes allow unauthenticated access
  getEventHandler,
);

app.patch(
  "/api/events/:id",
  requireAuth,
  requireSelfOrRole("host_id", ["admin"]), // Owner OR admin
  validateEventPayload,
  updateEventHandler,
);
```

**Example: Check Authorization in Handler**

```typescript
// Type-safe permission checking in handler
const updateEventHandler = async (req: AuthedRequest, res) => {
  const { eventId } = req.params;
  const event = db.query("SELECT * FROM events WHERE id = ?", [eventId]);

  // Additional row-level security check
  if (event.host_id !== req.auth?.userId && req.auth?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Proceed with update
  const updated = db.query("UPDATE events SET ... WHERE id = ?", [eventId]);
  res.json(updated);
};
```

---

### 2.3.3 Frontend UI Restrictions (React Conditional Rendering)

**Example: Event Card Component**

```typescript
interface EventCardProps {
  event: Event;
  currentUser: User;
}

export const EventCard: React.FC<EventCardProps> = ({ event, currentUser }) => {
  const canEdit =
    currentUser.role === 'host' && event.host_id === currentUser.id ||
    currentUser.role === 'admin';

  const canBook = currentUser.role === 'student';
  const canRequestSponsor = currentUser.role === 'host' && event.host_id === currentUser.id;

  return (
    <div className="event-card">
      <h3>{event.name}</h3>
      <p>{event.description}</p>

      {/* Conditional button rendering */}
      {canBook && (
        <button onClick={() => openBookingModal(event.id)}>
          Book Ticket
        </button>
      )}

      {canEdit && (
        <>
          <button onClick={() => navigate(`/events/${event.id}/edit`)}>
            Edit Event
          </button>
          <button onClick={() => navigate(`/dashboard/host/events/${event.id}/analytics`)}>
            View Analytics
          </button>
        </>
      )}

      {canRequestSponsor && (
        <button onClick={() => openSponsorModal(event.id)}>
          Request Sponsor
        </button>
      )}
    </div>
  );
};
```

**Route Protection Example:**

```typescript
// Protected route wrapper
interface ProtectedRouteProps {
  roles: UserRole[];
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ roles, children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) return <LoadingSpinner />;

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (!roles.includes(user.role)) {
    return <Navigate to="/unauthorized" />;
  }

  return <>{children}</>;
};

// Usage
<Routes>
  <Route path="/events" element={<EventList />} />
  <Route
    path="/dashboard/host/*"
    element={
      <ProtectedRoute roles={['host', 'admin']}>
        <HostDashboard />
      </ProtectedRoute>
    }
  />
  <Route
    path="/dashboard/sponsor/*"
    element={
      <ProtectedRoute roles={['sponsor', 'admin']}>
        <SponsorDashboard />
      </ProtectedRoute>
    }
  />
  <Route
    path="/admin/*"
    element={
      <ProtectedRoute roles={['admin']}>
        <AdminConsole />
      </ProtectedRoute>
    }
  />
</Routes>
```

---

## 2.4 Role Transition & Management

### 2.4.1 Role Upgrade/Downgrade Flow

**Student → Host (Self-Service with Approval)**

```
1. Student clicks "Become an Organizer" in /dashboard/settings
2. System captures:
   - Organization name
   - Organization URL
   - Contact email
   - Verification documents (college ID, business license)
3. Request stored in users.host_verification = PENDING
4. Admin reviews in /admin/users/:id/verify
5. On approval: role='host', host_verified=1
6. Welcome email sent with onboarding guides
```

**Host → Sponsor (Self-Service)**

```
1. Host clicks "Become a Sponsor" in /profile/settings
2. System captures:
   - Company name
   - Company website
   - Company size
   - Industry
   - Contact person email
3. Creates sponsors table entry
4. Auto-approves (no admin gate for sponsors)
5. Sponsor role activated; access to bidding interface
```

**Downgrade Process (Irreversible)**

```
- Student cannot downgrade (already base role)
- Host → Student:
  - Require no pending/live events
  - Archive all event data (preserve for records)
  - Revert to student role
  - Cannot revert this action
- Sponsor → Student:
  - Require no active sponsorship deals
  - Clear bidding history
  - Revert role
```

---

## 2.5 Data Isolation & Row-Level Security

### 2.5.1 Query Filtering by Role

**Events Listing**

```typescript
// Student: sees all approved events
const studentQuery = `
  SELECT * FROM events 
  WHERE status = 'approved' AND date > NOW()
  ORDER BY date ASC
`;

// Host: sees own events + all approved (can see competitors)
const hostQuery = `
  SELECT * FROM events 
  WHERE host_id = ? OR status = 'approved'
  ORDER BY date ASC
`;

// Sponsor: sees only approved events with open sponsorship spots
const sponsorQuery = `
  SELECT DISTINCT e.* FROM events e
  JOIN sponsor_spots ss ON e.id = ss.event_id
  WHERE e.status = 'approved' AND ss.status = 'open'
  ORDER BY e.date ASC
`;

// Admin: sees all events (no filter)
const adminQuery = `
  SELECT * FROM events 
  ORDER BY created_at DESC
`;
```

**Bookings Visibility**

```typescript
// Student: sees own bookings only
const studentBookingsQuery = `
  SELECT * FROM bookings 
  WHERE user_id = ?
`;

// Host: sees bookings for own events
const hostBookingsQuery = `
  SELECT b.* FROM bookings b
  JOIN events e ON b.event_id = e.id
  WHERE e.host_id = ?
`;

// Sponsor: cannot access bookings (no visibility to attendee info)
// Admin: sees all bookings
```

---

## 2.6 Permission Validation Checklist

Before every database write, validate:

```typescript
interface PermissionCheck {
  action: string;
  resource: string;
  required_role: UserRole[];
  additional_checks: (user: User, resource: any) => boolean;
}

const permissionChecks: PermissionCheck[] = [
  {
    action: "CREATE",
    resource: "event",
    required_role: ["host", "admin"],
    additional_checks: (user, event) => {
      // Host-specific checks
      if (user.role === "host" && !user.host_verified) {
        throw new Error("Host account not verified");
      }
      if (user.role === "host" && user.blocked) {
        throw new Error("Account suspended");
      }
      return true;
    },
  },
  {
    action: "UPDATE",
    resource: "event",
    required_role: ["host", "admin"],
    additional_checks: (user, event) => {
      // Only host can update own event; admin can update any
      if (user.role === "host" && event.host_id !== user.id) {
        return false;
      }
      // Cannot update event < 48h before start
      if (new Date(event.date) - new Date() < 48 * 60 * 60 * 1000) {
        throw new Error("Cannot modify event < 48h before start");
      }
      return true;
    },
  },
];
```

---

## 2.7 Summary: RBAC Completeness

| Role        | Features                                       | API Endpoints | Restrictions                                     | UX Views          |
| ----------- | ---------------------------------------------- | ------------- | ------------------------------------------------ | ----------------- |
| **Student** | Event discovery, booking, reviews, communities | 20 endpoints  | 5 concurrent bookings, 7-day cancellation window | 5 main views      |
| **Host**    | Event CRUD, sponsorship, analytics, check-in   | 25 endpoints  | No edit < 48h, max 10 sponsor spots              | 6 dashboard views |
| **Sponsor** | Bidding, deal negotiation, analytics           | 15 endpoints  | No contact attendees, max 100 active bids        | 4 dashboard views |
| **Admin**   | Full platform control, moderation, export      | 30+ endpoints | All actions logged, cannot delete audit logs     | 10 admin views    |

**Total:** 80+ protected API endpoints, 4 role systems, row-level security for all sensitive data.

---

**Document Status:** Phase 1.2 Complete | Next: Phase 1.3 (Feature Design)
**Author:** RBAC Architecture Team | Date: March 29, 2026
