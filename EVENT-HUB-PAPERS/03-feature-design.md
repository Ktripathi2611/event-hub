# 3. Feature Design: Deep Architecture of Core Platform Capabilities

## 3.1 Executive Summary

This document provides deep technical and business analysis of Event Hub's 7 core features: Event Management, Booking System, Waitlist Logic, Sponsorship Marketplace, Analytics Dashboard, Messaging System, and Notification System. For each feature, we define:

- Feature definition & user value
- Data model & relationships
- Workflow & state machines
- Edge cases & error handling
- Scalability considerations
- Integration points with other features

---

## 3.2 Feature 1: Event Management System

### 3.2.1 Feature Overview

**Definition:**  
Event Management encompasses the complete lifecycle of event creation, modification, discovery, and archival. It is the core feature enabling hosts to broadcast opportunities and students to find activities.

**User Value:**

- **Host:** Easy event creation without coding; publish to thousands of students
- **Student:** Discover relevant events via search, filters, recommendations
- **Sponsor:** Find events matching target audience demographics

### 3.2.2 Data Model

```sql
-- Core table (already exists in codebase)
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  date DATETIME NOT NULL,
  venue TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id),
  image TEXT,              -- S3 URL or local path
  status TEXT CHECK(status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
  featured INTEGER DEFAULT 0,  -- Admin display
  total_seats INTEGER NOT NULL,
  available_seats INTEGER NOT NULL,
  latitude REAL,            -- For geolocation search
  longitude REAL,
  series_id TEXT,           -- For recurring events
  recurrence_type TEXT CHECK(recurrence_type IN ('none', 'weekly', 'monthly')),
  share_count INTEGER DEFAULT 0,  -- Social proof metric
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (host_id) REFERENCES users(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Extended metadata (design recommendation)
CREATE TABLE event_metadata (
  id TEXT PRIMARY KEY,
  event_id TEXT UNIQUE REFERENCES events(id),
  min_age INTEGER,          -- Age gate if applicable
  is_virtual INTEGER DEFAULT 0,
  virtual_platform TEXT,    -- Zoom, Teams, custom link
  parking_available INTEGER,
  accessibility_features TEXT,  -- JSON: ["wheelchair_accessible", "audio_description"]
  tags TEXT,                -- JSON array for search filtering
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Searchable categories
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  icon TEXT,               -- Emoji or icon ID
  color TEXT,              -- Hex color for UI
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Event images (future expansion from single image)
CREATE TABLE event_images (
  id TEXT PRIMARY KEY,
  event_id TEXT REFERENCES events(id),
  url TEXT NOT NULL,
  is_primary INTEGER DEFAULT 0,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2.3 Event Lifecycle State Machine

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│    User Creates Event                                           │
│           ↓                                                      │
│    [PENDING] → Admin Review Period                              │
│           ↓                                                      │
│    Admin Decision                                               │
│    ├── Approved → [APPROVED] (published to students)            │
│    ├── Rejected → [REJECTED] (notification to host)             │
│    └── Needs Changes → [PENDING] (feedback to host)             │
│           ↓                                                      │
│    [APPROVED] → Registrations Open (students book)              │
│           ↓                                                      │
│    Event Date Arrives                                           │
│           ├→ Event happens → [COMPLETED] (post-event)           │
│           ├→ Cancelled early → [CANCELLED] (refunds issued)     │
│           └→ Suspended (policy) → [SUSPENDED] (temp hold)       │
│                                                                 │
│    [COMPLETED] or [CANCELLED] or [REJECTED]                    │
│           → Archived (kept in DB for records)                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Legal Transitions (Enforced in Backend):
- PENDING → APPROVED (admin only)
- PENDING → REJECTED (admin only)
- APPROVED → SUSPENDED (admin only, for policy violations)
- APPROVED → CANCELLED (host or admin)
- SUSPENDED → APPROVED (admin only)
- COMPLETED ↔ All others: No reversal (immutable)
```

### 3.2.4 Event Creation Workflow (Step-by-Step)

```
Step 1: Basic Info
┌─────────────────────────────────────────┐
│ Event Name                              │
│ Short Description (140 chars)           │
│ Long Description (2000 chars, markdown) │
│ Category (dropdown)                     │
│ Date & Time (picker)                    │
│ Timezone (list)                         │
└─────────────────────────────────────────┘
         ↓
Step 2: Venue & Accessibility
┌─────────────────────────────────────────┐
│ Venue Name                              │
│ Street Address                          │
│ City, State, ZIP                        │
│ [OR] Virtual Event? (toggle)            │
│   └─ Virtual Platform (Zoom link, etc)  │
│ Geolocation (map picker, lat/long)      │
│ Parking Available? (checkbox)           │
│ Accessibility Features (multi-select)   │
└─────────────────────────────────────────┘
         ↓
Step 3: Capacity & Tickets
┌─────────────────────────────────────────┐
│ Total Seats Available                   │
│ Ticket Types (dynamic list)             │
│  ├─ Type Name (e.g., "Early Bird")      │
│  ├─ Price (USD)                         │
│  └─ Quantity (e.g., 50)                 │
│ Refund Policy (dropdown)                │
│ Waitlist Enabled? (toggle)              │
└─────────────────────────────────────────┘
         ↓
Step 4: Visuals & Media
┌─────────────────────────────────────────┐
│ Event Banner Image (upload)             │
│ Additional Images (multi-upload)        │
│ Tags (free text, comma-separated)       │
└─────────────────────────────────────────┘
         ↓
Step 5: Review & Submit
┌─────────────────────────────────────────┐
│ Preview event as it appears to students │
│ [Submit for Approval] button            │
│ ↓ Auto-transition to PENDING status     │
│ ↓ Email sent to admin (approval queue)  │
│ ↓ Host sees "Awaiting Approval" message │
└─────────────────────────────────────────┘
```

### 3.2.5 Event Discovery & Search

**Search Capabilities:**

```typescript
interface EventSearchFilters {
  q?: string;              // Full-text: name, description
  category_id?: string[];  // Multi-select category
  date_range?: {
    start: Date;
    end: Date;
  };
  location?: {
    latitude: number;
    longitude: number;
    radius_km: number;
  };
  price_range?: {
    min: number;
    max: number;
  };
  is_virtual?: boolean;
  is_free?: boolean;
  sort_by?: 'date' | 'popularity' | 'relevance' | 'nearest';
}

// Sample queries
GET /api/events/search?q=music&category=concerts&date_range=2026-04-01:2026-05-01&radius=10
GET /api/events/trending?period=7d  // Last 7 days, ordered by registrations
GET /api/events?category=tech&price_max=50&sort=date
```

**Search Implementation Strategy:**

```typescript
// Phase 1 (Current): Database LIKE queries + in-memory filtering
const searchEvents = (filters: EventSearchFilters) => {
  let query = `
    SELECT e.*, 
           (e.total_seats - e.available_seats) as registrations,
           COUNT(DISTINCT w.id) as wishlist_count
    FROM events e
    LEFT JOIN wishlists w ON e.id = w.event_id
    WHERE e.status = 'approved' AND e.date > NOW()
  `;

  if (filters.q) {
    query += ` AND (e.name LIKE ? OR e.description LIKE ?)`;
  }
  if (filters.category_id?.length) {
    query += ` AND e.category_id IN (${filters.category_id.map(() => "?").join(",")})`;
  }
  if (filters.date_range) {
    query += ` AND e.date BETWEEN ? AND ?`;
  }
  if (filters.location) {
    // Haversine distance calculation (geo search)
    query += `
      AND (
        3959 * acos(cos(radians(?)) * cos(radians(e.latitude)) *
        cos(radians(e.longitude) - radians(?)) +
        sin(radians(?)) * sin(radians(e.latitude)))
      ) <= ?
    `;
  }

  query += ` ORDER BY e.date ASC LIMIT 20`;
  return db.prepare(query).all(...params);
};

// Phase 2 (Scale): Elasticsearch or Meilisearch for full-text search
// - Index: event name, description, category, tags
// - Faceted search: category, price range, date
// - Real-time indexing on event creation/update
```

### 3.2.6 Edge Cases & Error Handling

| Edge Case                            | Scenario                                                   | Handling                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Overbooking**                      | 100 students click "Book" simultaneously when 5 seats left | Use database constraints: `available_seats >= 0`. Last successful transaction wins; others get "Sold out" error.           |
| **Editing During Registration**      | Host changes event details while students are booking      | Freeze event details 48h before start. If attempted: `409 Conflict, changes blocked.`                                      |
| **Cancellation Cascades**            | Host cancels event; must refund all bookings               | Async job: for each booking, call payment provider refund; update booking status; send confirmation email.                 |
| **Duplicate Categories**             | Two admins create "Music" category simultaneously          | Unique constraint on categories.name; second insert rejected.                                                              |
| **Geo Search Precision**             | User searches with 0 km radius (current location only)     | Return only events at exact latitude/longitude (rarely 1 match). Recommend "expand radius."                                |
| **Extremely Large Events**           | 100K+ registrations on single 100-seat event               | Waitlist grows; cap at 10x total seats for fairness. Promote in batches (1000/hour) to avoid overwhelming infrastructure.  |
| **Expired Event Still Discoverable** | Event date has passed; still appears in search             | Add auto-transition: scheduled job runs nightly, marks past-pending events as COMPLETED; removes from "upcoming" listings. |

### 3.2.7 Scalability Considerations

**Database Optimization:**

```sql
-- Indexes for common queries
CREATE INDEX idx_events_status_date ON events(status, date);
CREATE INDEX idx_events_category ON events(category_id);
CREATE INDEX idx_events_host_id ON events(host_id);
CREATE INDEX idx_events_location ON events(latitude, longitude);  -- For geo searches

-- Query analysis (EXPLAIN PLAN)
EXPLAIN SELECT * FROM events WHERE status='approved' AND date > NOW() ORDER BY date ASC LIMIT 20;
-- Should use idx_events_status_date, not full table scan
```

**Caching Strategy:**

```
Redis Cache Layers:
┌────────────────────────────────────────┐
│ Layer 1: Event Detail Cache            │
│ Key: event:{event_id}                  │
│ TTL: 1 hour                            │
│ Hit Rate: 80% (popular events)         │
│ Invalidate: On event update            │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ Layer 2: Search Results Cache          │
│ Key: events:search:{hash(filters)}     │
│ TTL: 30 minutes                        │
│ Hit Rate: 60% (students refine search) │
│ Invalidate: On new event creation      │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ Layer 3: Trending/Homepage Cache       │
│ Key: events:trending:{period}          │
│ TTL: 10 minutes (volatile)             │
│ Hit Rate: 95% (homepage query spike)   │
│ Refresh: Every 10 minutes (background) │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ Layer 4: Category List Cache           │
│ Key: categories:all                    │
│ TTL: 24 hours                          │
│ Hit Rate: 99% (static lookup)          │
│ Invalidate: On category creation       │
└────────────────────────────────────────┘
```

**Load Handling (Expected Growth):**

```
Year 1: 5K events/month, 50K monthly users
  → Database size: ~500 MB
  → Query time (p95): <100 ms
  → Cache hit rate: 70%

Year 2: 20K events/month, 200K monthly users
  → Database size: ~2 GB
  → May need: Read replicas for search queries
  → Query time (p95): <200 ms

Year 3: 50K events/month, 500K monthly users
  → Database size: ~5 GB
  → Definitely need: Elasticsearch for search
  → Shard by: geography (US East/West/Central)
  → Query time (p95): <300 ms
```

---

## 3.3 Feature 2: Booking System

### 3.3.1 Feature Overview

**Definition:**  
Booking System handles ticket purchase, inventory management, payment processing (future), and confirmation. It is the revenue engine for both hosts and the platform.

**User Value:**

- **Student:** Simple ticket purchase with instant confirmation
- **Host:** Guaranteed revenue tracking + attendee count
- **Platform:** Commission on every transaction

### 3.3.2 Data Model

```sql
-- Booking core
CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  booking_ref TEXT UNIQUE NOT NULL,  -- Human-readable ref (e.g., BK-2026-001234)
  user_id TEXT NOT NULL REFERENCES users(id),
  event_id TEXT NOT NULL REFERENCES events(id),
  ticket_type_id TEXT NOT NULL REFERENCES ticket_types(id),
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  total_price REAL NOT NULL,
  qr_code TEXT,              -- QR code for check-in
  status TEXT DEFAULT 'confirmed' CHECK(status IN ('confirmed', 'cancelled', 'refunded')),
  referral_code_used TEXT,   -- Which referral code was used
  discount_amount REAL DEFAULT 0,
  checked_in INTEGER DEFAULT 0,
  checked_in_at DATETIME,
  checked_in_by TEXT,        -- Admin/host ID who did the check-in
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id)
);

-- Ticket inventory per type
CREATE TABLE ticket_types (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  name TEXT NOT NULL,  -- "Early Bird", "Regular", "VIP"
  price REAL NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),  -- Total available
  sold INTEGER DEFAULT 0,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id),
  UNIQUE(event_id, name)  -- One "Early Bird" per event
);

-- Payment processing (Stripe/PayPal integration)
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  booking_id TEXT UNIQUE REFERENCES bookings(id),
  stripe_payment_intent_id TEXT,
  stripe_customer_id TEXT,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT CHECK(status IN ('pending', 'succeeded', 'failed', 'refunded')),
  metadata_json TEXT,  -- JSON: {refund_reason, refund_timestamp}
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

-- Commission tracking (platform revenue)
CREATE TABLE commissions (
  id TEXT PRIMARY KEY,
  booking_id TEXT REFERENCES bookings(id),
  host_id TEXT REFERENCES users(id),
  platform_fee_percent REAL DEFAULT 15.0,  -- 15% default
  platform_fee_amount REAL,  -- Computed: total_price * rate
  host_payout REAL,          -- Computed: total_price - fee
  status TEXT CHECK(status IN ('pending', 'paid', 'disputed')),
  paid_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3.3.3 Booking Creation Workflow (Atomic Transaction)

**Critical:** Booking creation must be **atomic** to prevent overbooking. Use database transaction with serializable isolation.

```typescript
// Transaction-based booking creation
const createBooking = async (req: AuthedRequest, res) => {
  const { event_id, ticket_type_id, quantity, referral_code } = req.body;
  const user_id = req.auth!.userId;

  // Use explicit transaction
  const transaction = db.transaction(() => {
    // Step 1: Lock & check availability
    const ticketType = db.exec(
      `
      BEGIN IMMEDIATE;  -- BEGIN IMMEDIATE = exclusive lock
      SELECT * FROM ticket_types WHERE id = ? AND event_id = ?
    `,
      [ticket_type_id, event_id],
    );

    if (!ticketType) {
      throw new Error("Ticket type not found");
    }

    const available = ticketType.quantity - ticketType.sold;
    if (available < quantity) {
      throw new Error("Not enough tickets available");
    }

    // Step 2: Check event status
    const event = db.query(`SELECT * FROM events WHERE id = ?`, [event_id]);
    if (event.status !== "approved") {
      throw new Error("Event is not available for booking");
    }

    // Step 3: Check duplicate booking (student can't book same event twice)
    const existing = db.query(
      `
      SELECT * FROM bookings 
      WHERE user_id = ? AND event_id = ? AND status = 'confirmed'
    `,
      [user_id, event_id],
    );

    if (existing) {
      throw new Error("You already have a booking for this event");
    }

    // Step 4: Check referral code (if provided)
    let discountAmount = 0;
    if (referral_code) {
      const referrer = db.query(
        `
        SELECT * FROM users WHERE referral_code = ? AND blocked = 0
      `,
        [referral_code],
      );

      if (referrer) {
        // Apply discount: 10% off
        const ticketPrice = ticketType.price * quantity;
        discountAmount = ticketPrice * 0.1;
      }
    }

    // Step 5: Create booking
    const bookingId = uuidv4();
    const bookingRef = generateBookingRef(); // "BK-2026-001234"
    const totalPrice = ticketType.price * quantity - discountAmount;

    db.exec(
      `
      INSERT INTO bookings 
      (id, booking_ref, user_id, event_id, ticket_type_id, quantity, total_price, discount_amount, referral_code_used, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        bookingId,
        bookingRef,
        user_id,
        event_id,
        ticket_type_id,
        quantity,
        totalPrice,
        discountAmount,
        referral_code,
        new Date().toISOString(),
      ],
    );

    // Step 6: Reserve inventory
    db.exec(
      `
      UPDATE ticket_types SET sold = sold + ? WHERE id = ?
    `,
      [quantity, ticket_type_id],
    );

    // Step 7: Update event available seats
    db.exec(
      `
      UPDATE events SET available_seats = available_seats - ? WHERE id = ?
    `,
      [quantity, event_id],
    );

    // Step 8: Generate QR code
    const qrCode = await QRCode.toDataURL(
      `https://eventhub.com/check-in/${bookingId}`,
    );
    db.exec(
      `
      UPDATE bookings SET qr_code = ? WHERE id = ?
    `,
      [qrCode, bookingId],
    );

    // Step 9: Create commission record
    const platformFee = totalPrice * 0.15; // 15% commission
    const hostPayout = totalPrice - platformFee;

    db.exec(
      `
      INSERT INTO commissions
      (id, booking_id, host_id, platform_fee_amount, host_payout)
      VALUES (?, ?, ?, ?, ?)
    `,
      [uuidv4(), bookingId, event.host_id, platformFee, hostPayout],
    );

    // Step 10: Commit transaction
    db.exec("COMMIT");

    return { bookingId, bookingRef, totalPrice, qrCode };
  });

  try {
    const result = transaction();

    // Emit notification event
    notificationService.create({
      user_id,
      type: "booking_confirmed",
      title: "Booking Confirmed",
      message: `Your ticket for ${event.name} is confirmed. Ref: ${result.bookingRef}`,
      data_json: JSON.stringify({ booking_id: result.bookingId, event_id }),
    });

    return res.status(201).json(result);
  } catch (error) {
    db.exec("ROLLBACK");
    return res.status(400).json({ error: error.message });
  }
};
```

### 3.3.4 Cancellation & Refund Flow

```
Refund Request (Student initiates)
        ↓
┌─────────────────────────────────────────────────────────────┐
│ Check Eligibility:                                          │
│ 1. Is event > 7 days away? (refundable window)              │
│ 2. Is booking status 'confirmed'? (not already refunded)    │
│ 3. Is refund policy 'full' or 'partial'?                    │
└─────────────────────────────────────────────────────────────┘
        ↓ YES, eligible
┌─────────────────────────────────────────────────────────────┐
│ Update Booking:                                             │
│ 1. Change status: confirmed → cancelled                     │
│ 2. Release inventory: ticket_types.sold -= quantity         │
│ 3. Update event available_seats += quantity                 │
│ 4. If waitlisted students exist:                            │
│    → Auto-promote from waitlist (FIFO)                      │
└─────────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────────┐
│ Process Refund (Payment Provider):                          │
│ 1. Call Stripe API: stripe.refunds.create(paymentId)       │
│ 2. Wait for response (3-5 seconds)                          │
│ 3. Update payments.status = 'refunded'                      │
│ 4. Reverse commission: host loses payout                    │
└─────────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────────┐
│ Send Confirmation:                                          │
│ 1. Email to student: refund initiated, 5-10 business days  │
│ 2. Notification: "Refund of $XX processed"                  │
│ 3. If promoted from waitlist: confirmation email            │
└─────────────────────────────────────────────────────────────┘
```

### 3.3.5 Edge Cases

| Scenario                                                                | Handling                                                                                  |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Student clicks Book + internet fails mid-transaction**                | Transaction rolls back; no charge; student doesn't see booking; can retry                 |
| **Inventory race (2 students book last seat simultaneously)**           | Database lock serialization; last committed transaction wins; other gets "Sold out"       |
| **Refund requested but payment provider fails**                         | Mark commission.status = 'disputed'; admin manual intervention required                   |
| **Student books, cancels immediately, rejoins queue (gaming waitlist)** | Add cooldown: After cancellation, cannot rejoin same event for 24h                        |
| **Event cancelled; no refund available from payment provider**          | Platform absorbs loss; mark as vendor_issue; manually process refund from company account |
| **Student uses multiple referral codes (cheating)**                     | Only first referral code applied; subsequent codes ignored                                |

### 3.3.6 Scalability

**Current Bottleneck: SQLite Single Writer**

```
SQLite Behavior:
- Only one connection can write at a time
- Lock contention: At 100 concurrent bookings, 99 wait for their turn
- TimeoutError after 5 seconds (default)

Solution: PostgreSQL with MVCC (Multi-Version Concurrency Control)
- Each writer gets snapshot of data
- No blocking; serialization at commit time
- Can handle 1000+ concurrent writes
- Natural upgrade path from SQLite

Migration Strategy:
1. Week 2-3: Install PostgreSQL locally + in staging
2. Dual-write mode: Write to both SQLite and PostgreSQL
3. Verify data consistency (automated audit)
4. Cutover week 4: Point frontend to PostgreSQL only
5. Retire SQLite (keep backup for reference)
```

**Example: PostgreSQL with Connection Pooling**

```typescript
// Before (SQLite): Single connection, query queue
const db = new Database("events.db"); // One writer

// After (PostgreSQL): Connection pool
import pg from "pg";

const pool = new pg.Pool({
  user: "eventhub_user",
  password: process.env.DB_PASSWORD,
  host: "postgres.internal",
  port: 5432,
  database: "eventhub",
  max: 20, // Max 20 concurrent connections
  idleTimeoutMillis: 30000,
});

// Booking creation now parallelizable
app.post("/api/bookings", async (req, res) => {
  const client = await pool.connect(); // Get connection from pool
  try {
    await client.query("BEGIN SERIALIZABLE");
    // ... transactional logic ...
    await client.query("COMMIT");
  } finally {
    client.release(); // Return to pool
  }
});
```

---

## 3.4 Feature 3: Waitlist System

### 3.4.1 Feature Overview

**Definition:**  
Waitlist allows students to queue for sold-out events and auto-promotes them when seats become available. It increases conversion and maximizes event attendance.

**User Value:**

- **Student:** Chance to attend if someone cancels
- **Host:** Better utilization of event capacity
- **Platform:** More transactions (promoted students complete purchase)

### 3.4.2 Data Model

```sql
CREATE TABLE waitlist (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT CHECK(status IN ('waiting', 'promoted', 'removed', 'expired')) DEFAULT 'waiting',
  position INTEGER,  -- FIFO position (1 = first in line)
  promoted_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id, user_id),  -- One entry per student per event
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 3.4.3 Waitlist Workflow

**Joining Waitlist:**

```typescript
const joinWaitlist = async (req: AuthedRequest, res) => {
  const { event_id } = req.body;
  const user_id = req.auth!.userId;

  const event = db.query('SELECT * FROM events WHERE id = ?', [event_id]);

  // Check eligibility
  if (event.available_seats > 0) {
    return res.status(400).json({ error: 'Event has available seats; book instead' });
  }

  // Check if already on waitlist
  const existing = db.query(`
    SELECT * FROM waitlist WHERE event_id = ? AND user_id = ? AND status IN ('waiting', 'promoted')
  `, [event_id, user_id]);

  if (existing) {
    return res.status(409).json({ error: 'Already on waitlist' });
  }

  // Check concurrent bookings limit (same as booking: max 5)
  const bookingCount = db.query(`
    SELECT COUNT(*) as count FROM bookings
    WHERE user_id = ? AND status = 'confirmed' AND
          event_id IN (SELECT id FROM events WHERE date > NOW())
  `, [user_id]);

  if (bookingCount.count >= 5) {
    return res.status(400).json({ error: 'Max concurrent event registrations (5) reached' });
  }

  // Get next position in queue
  const maxPosition = db.query(`
    SELECT MAX(position) as max_pos FROM waitlist WHERE event_id = ? AND status = 'waiting'
  `, [event_id]);

  const position = (maxPosition?.max_pos || 0) + 1;

  // Add to waitlist
  db.exec(`
    INSERT INTO waitlist (id, event_id, user_id, position, created_at)
    VALUES (?, ?, ?, ?, ?)
  `, [uuidv4(), event_id, user_id, position, new Date().toISOString()]);

  return res.status(201).json({
    message: 'Added to waitlist',
    position,
    estimated_arrival: 'We'll notify you if a spot opens up'
  });
};
```

**Auto-Promotion on Cancellation:**

```typescript
const promotionJob = async () => {
  // Runs when booking is cancelled

  const bookedEvent = db.query("SELECT * FROM events WHERE id = ?", [event_id]);

  // Check if seats now available
  if (bookedEvent.available_seats <= 0) {
    return; // Still full
  }

  // Get first N waiting on waitlist
  const promoteCandidates = db.query(
    `
    SELECT * FROM waitlist 
    WHERE event_id = ? AND status = 'waiting'
    ORDER BY position ASC
    LIMIT ?
  `,
    [event_id, bookedEvent.available_seats],
  );

  // Promote each candidate (async, non-blocking)
  for (const candidate of promoteCandidates) {
    promoteFromWaitlist(event_id, candidate.user_id).catch((error) =>
      logger.error(`Promotion failed: ${error}`),
    );
  }
};

const promoteFromWaitlist = async (event_id: string, user_id: string) => {
  // Send push notification
  const user = db.query("SELECT * FROM users WHERE id = ?", [user_id]);

  notificationService.create({
    user_id,
    type: "waitlist_promoted",
    title: "A Spot Opened Up!",
    message: `You've been promoted from the waitlist. Click to book your ticket.`,
    data_json: JSON.stringify({ event_id, action: "book_now" }),
  });

  // Update waitlist entry
  db.exec(
    `
    UPDATE waitlist 
    SET status = 'promoted', promoted_at = ?
    WHERE event_id = ? AND user_id = ?
  `,
    [new Date().toISOString(), event_id, user_id],
  );

  // Email notification (async)
  mailService
    .send({
      to: user.email,
      subject: "A Spot Opened Up on Event Hub!",
      template: "waitlist_promoted",
      data: { event_id, user_name: user.name },
    })
    .then()
    .catch(); // Fire-and-forget
};
```

**Timeouts & Cleanup:**

```typescript
// Nightly job: remove promotions not acted on within 24h
const cleanupExpiredPromotions = async () => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  db.exec(
    `
    UPDATE waitlist 
    SET status = 'expired'
    WHERE status = 'promoted' AND promoted_at < ?
  `,
    [yesterday.toISOString()],
  );

  // Re-promote next candidates
  const expiredPromotions = db.query(`
    SELECT DISTINCT event_id FROM waitlist 
    WHERE status = 'expired'
  `);

  for (const promotion of expiredPromotions) {
    promotionJob(promotion.event_id);
  }
};
```

### 3.4.4 Edge Cases

| Case                                                                                  | Handling                                                                                 |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Promoted student doesn't complete booking (expired)**                               | Remove from promoted; re-promote next candidate                                          |
| **Event cancelled; 200 students on waitlist**                                         | Notify all at once via email; remove from waitlist                                       |
| **Student promoted but simultaneously books different event,hitting 5-booking limit** | Mark waitlist promotion as expired; re-promote next                                      |
| **Two cancellations within 1 second; waitlist has 1 student**                         | Exactly one gets promoted (atomic); other seat becomes available again (for new booking) |

### 3.4.5 Scalability

For 100K users with 5% on waitlists = 5K waitlist entries:

```
Promotion Logic Optimization:
1. Batch promotions: Instead of one-by-one, promote top 10 at once
   → 1 database update instead of 10
   → Async email sending (Bull job queue)

2. Cache waitlist positions: Store in Redis for O(1) lookup
   Key: waitlist:{event_id}
   Value: {user_id: position, user_id: position, ...}

3. Position recalculation: Only on join/leave, not every query
   → Nightly job: recompute positions (efficient)
```

---

## 3.5 Feature 4: Sponsorship Marketplace

### 3.5.1 Feature Overview

**Definition:**  
Sponsorship Marketplace is a two-way bidding platform where sponsors bid on event sponsorship spots and hosts request sponsors for their events. It's a unique differentiator for Event Hub.

**User Value:**

- **Host:** Revenue source + audience engagement via sponsor activations
- **Sponsor:** Targeted reach to defined audience + ROI measurement
- **Platform:** Commission on sponsorship deals (10-20% typical)

### 3.5.2 Data Model

```sql
-- Host-defined sponsorship opportunities
CREATE TABLE sponsor_spots (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  label TEXT NOT NULL,  -- "Platinum Sponsor", "Gold Booth", etc
  spot_type TEXT CHECK(spot_type IN ('booth', 'banner', 'stall', 'premium')),
  base_price REAL DEFAULT 0,  -- Starting bid/asking price
  is_premium INTEGER DEFAULT 0,
  status TEXT CHECK(status IN ('open', 'reserved', 'booked')) DEFAULT 'open',
  reserved_deal_id TEXT REFERENCES sponsorship_deals(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id)
);

-- Sponsor bidding on spots
CREATE TABLE bids (
  id TEXT PRIMARY KEY,
  spot_id TEXT NOT NULL REFERENCES sponsor_spots(id),
  sponsor_id TEXT NOT NULL REFERENCES sponsors(id),
  amount REAL NOT NULL,
  status TEXT CHECK(status IN ('active', 'outbid', 'won', 'overridden')) DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (spot_id) REFERENCES sponsor_spots(id),
  FOREIGN KEY (sponsor_id) REFERENCES sponsors(id),
  UNIQUE(spot_id, sponsor_id)  -- One bid per sponsor per spot
);

-- Sponsorship deals (negotiation outcome)
CREATE TABLE sponsorship_deals (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  host_id TEXT NOT NULL REFERENCES users(id),
  sponsor_id TEXT NOT NULL REFERENCES sponsors(id),
  title TEXT NOT NULL,  -- Deal title ("Coca-Cola Primary Sponsor")
  proposal_amount REAL DEFAULT 0,
  deliverables_json TEXT,  -- {"logo_placement": "banner", "booth_size": "10x10", ...}
  status TEXT CHECK(status IN ('proposed', 'negotiating', 'accepted', 'rejected', 'cancelled', 'completed')) DEFAULT 'proposed',
  created_by TEXT,  -- 'host' or 'sponsor' (who initiated)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (host_id) REFERENCES users(id),
  FOREIGN KEY (sponsor_id) REFERENCES sponsors(id)
);

-- Negotiation message thread
CREATE TABLE sponsorship_messages (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL REFERENCES sponsorship_deals(id),
  sender_user_id TEXT NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  attachments_json TEXT,  -- Files or images
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deal_id) REFERENCES sponsorship_deals(id),
  FOREIGN KEY (sender_user_id) REFERENCES users(id)
);

-- Sponsor profiles (extends users)
CREATE TABLE sponsors (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id),
  company_name TEXT NOT NULL,
  website TEXT,
  contact_email TEXT,
  budget_range_min REAL,
  budget_range_max REAL,
  categories TEXT,  -- JSON: ["music", "tech", "startup"]
  approved INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 3.5.3 Two-Way Sponsorship Flow

**Flow 1: Host Requests Sponsor (Outbound)**

```
Host Goes to Event -> Sponsorship Tab -> "Find Sponsors"
        ↓
Host Creates Sponsorship Request:
  ├─ Target Companies (search by category)
  ├─ Requested Sponsorship Level ($ amount range)
  ├─ Deliverables Needed (logo, booth, speaking slot, etc)
  └─ Message to Sponsor (pitch)
        ↓
System Searches Sponsors Matching Criteria:
  ├─ Budget >= Event's requested amount
  ├─ Categories include event category
  └─ Not already sponsoring competitor event (future)
        ↓
Sponsor Receives Inbound Request:
  ├─ Platform notification + email
  ├─ View(button) → Opens deal detail
  ├─ Options: Accept | Counter | Reject | Ignore
        ↓
[If Accept] → Deal moves to accepted
            → Event host notified
            → Payment pending (external system)
        ↓
[If Counter] → Sponsor proposes different $ amount
             → Message sent to host
             → Host can accept or re-counter
             → Max 5 rounds of negotiation (time limit: 7 days)
        ↓
[If Reject] → Request closed
            → Host notified
            → Can request different sponsor
```

**Flow 2: Sponsor Bids on Spot (Inbound)**

```
Sponsor Searches "Sponsorship Opportunities"
        ↓
Sponsor Browses Open Sponsor Spots:
  ├─ Upcoming events in target categories
  ├─ Available sponsorship levels
  ├─ Base asking price
  └─ Current highest bid (anonymous)
        ↓
Sponsor Places Bid:
  ├─ Enter bid amount (>= base price)
  ├─ Add message to host ("Why we're a good fit...")
  └─ [Bid] button
        ↓
Database Update:
  ├─ No existing bid? Create new bid (status = active)
  ├─ Existing bid by sponsor? Update amount, status = active
  ├─ Previous highest? Mark outbid (notification sent to previous)
  └─ New bid notifies host: "New bid received"
        ↓
Host Reviews Bids:
  ├─ View all bids on each sponsorship spot
  ├─ Click bid → view sponsor details + message
  ├─ Options: Accept Bid | Message Sponsor | Reject
        ↓
[If Accept] → Creates sponsorship_deal
           → Deal.status = accepted
           → Payment pending
           → Other bids on spot marked as rejected
           → Spot marked as booked
        ↓
[If Message] → Negotiation thread opens
            → Sponsor receives message
            → Can propose updated amount
            → Bidding extends by 48h
        ↓
[If Reject] → Bid marked as rejected
           → Sponsor notified
           → Can place new bid (lower if needed)
```

### 3.5.4 Deal Lifecycle State Machine

```
PROPOSED (Host or Sponsor initiates)
    ├─→ NEGOTIATING (message thread active, <7 days)
    │       ├─→ ACCEPTED (both agree on terms)
    │       │       └─→ COMPLETED (event happens, deliverables met)
    │       │           └─→ INVOICED (sponsor pays)
    │       │               └─→ PAID (settlement complete)
    │       │
    │       └─→ REJECTED (one side declines)
    │
    └─→ ACCEPTED (immediate agreement)
            └─→ [same as above]
```

**Deal Negotiation Rules:**

```typescript
const negotiateSponsorship = async (
  dealId: string,
  message: string,
  counterOffer?: number,
) => {
  const deal = db.query("SELECT * FROM sponsorship_deals WHERE id = ?", [
    dealId,
  ]);

  // Rule 1: Max 5 rounds of negotiation
  const messageCount = db.query(
    `
    SELECT COUNT(*) as count FROM sponsorship_messages 
    WHERE deal_id = ?
  `,
    [dealId],
  );

  if (messageCount.count >= 10) {
    // 5 rounds = 10 messages
    throw new Error("Negotiation limit reached; deal expires in 48h");
  }

  // Rule 2: Negotiation window is 7 days
  const createdDate = new Date(deal.created_at);
  const expiryDate = new Date(createdDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (new Date() > expiryDate) {
    deal.status = "expired";
    throw new Error("Negotiation window closed");
  }

  // Rule 3: Counter-offers move deal to NEGOTIATING
  if (counterOffer && counterOffer !== deal.proposal_amount) {
    deal.proposal_amount = counterOffer;
    deal.status = "negotiating";
  }

  // Add message
  db.exec(
    `
    INSERT INTO sponsorship_messages (id, deal_id, sender_user_id, message, created_at)
    VALUES (?, ?, ?, ?, ?)
  `,
    [uuidv4(), dealId, req.auth.userId, message, new Date().toISOString()],
  );

  // Notify other party
  const otherParty =
    deal.sender_user_id === req.auth.userId
      ? deal.receiver_user_id
      : deal.sender_user_id;

  notificationService.create({
    user_id: otherParty,
    type: "deal_message",
    title: "New Message on Sponsorship Deal",
    message: `${sender_name} replied to your sponsorship offer`,
    data_json: JSON.stringify({ deal_id: dealId }),
  });
};
```

### 3.5.5 Sponsorship Analytics (Host & Sponsor View)

**Host Analytics (per deal):**

```
Sponsorship Deal Dashboard
├─ Deal Status: Proposed / Negotiating / Accepted
├─ Sponsor Company: [Name, Logo]
├─ Agreed Amount: $5,000
├─ Deliverables: Logo on website, 10x10 booth, speaking slot
├─ Timeline: Created March 20, Event April 5 (16 days)
└─ Actions: Complete | Dispute | Cancel
```

**Sponsor Analytics (per deal):**

```
Deal ROI Dashboard
├─ Event Name & Date
├─ Audience Size: 500 expected attendees
├─ Investment: $5,000
├─ Projected Cost Per Contact: $10
├─ Engagement Metrics (post-event):
│  ├─ Booth visits: 120 (24%)
│  ├─ Leads captured: 45 (37% of booth visits)
│  └─ Conversions (future): TBD
└─ Overall ROI Score: [TBD post-event]
```

### 3.5.6 Edge Cases

| Case                                                                      | Handling                                                                             |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Sponsor bids, host accepts immediately, other sponsors still bidding**  | Spot marked booked; outbid bids rejected; other sponsors notified                    |
| **Negotiation reaches 5 rounds; neither party agrees**                    | Deal expired after 7 days; either can restart negotiation as new deal                |
| **Sponsor bids then removes sponsorship profile (downgrades to student)** | Bid marked canceled; host notified; can re-accept if sponsor recreates profile       |
| **Host cancels event; active sponsorship deal exists**                    | Deal moved to cancelled; if payment already made, refund initiated; sponsor notified |

### 3.5.7 Scalability

**Expected Volume (Year 3):**

- 500 events/month
- 60% of events have sponsorship opportunities
- 300 events with open sponsorships
- 3K+ sponsors registered
- 500+ active bids at peak

**Optimization:**

```sql
-- Indexes for bid searching
CREATE INDEX idx_bids_spot_status ON bids(spot_id, status);
CREATE INDEX idx_bids_sponsor ON bids(sponsor_id);
CREATE INDEX idx_sponsorship_deals_event ON sponsorship_deals(event_id, status);

-- View for "Top Bids per Spot"
CREATE VIEW top_bids AS
  SELECT DISTINCT ON (spot_id) spot_id, sponsor_id, amount
  FROM bids
  WHERE status IN ('active', 'won')
  ORDER BY spot_id, amount DESC;

-- Redis cache for hot sponsor profiles
Key: sponsor:{sponsor_id}
TTL: 24h
Hit Rate: 80% (repeat bidding)
```

---

## 3.6 Feature 5: Analytics Dashboard

### 3.6.1 Feature Overview

**Definition:**  
Real-time analytics provide hosts and sponsors visibility into event performance,attendee behavior, and return on investment.

**Metrics Tracked:**

```
Host Analytics (per event):
├─ Registrations: total, by ticket type, daily trend
├─ Revenue: gross, net (after commission), by ticket type
├─ Attendance: expected vs. actual (post-event)
├─ Engagement: views, clicks, shares, wishlist adds
├─ Audience: demographics (age, location, role), returning attendees
└─ Sponsorship: deals closed, revenue from sponsors

Sponsor Analytics (per deal):
├─ Impressions: booth location views, website mentions
├─ Engagement: booth visits, leads captured, contact forms filled
├─ Conversion: (future) sales attributed to sponsorship
└─ ROI: $ spent vs. $ value of outcomes

Admin Analytics (platform):
├─ User Growth: daily signups, churn rate
├─ Events: created, approved, completed, cancelled
├─ Revenue: tickets, sponsorship, premium features
├─ Engagement: peak concurrent users, message volume
└─ Moderation: reports filed, actions taken
```

### 3.6.2 Data Collection Strategy

```
Real-Time Events (collected immediately):
├─ event_view (user views event detail page)
├─ event_click (user clicks "Book" or "Add to Wishlist")
├─ booking_created (new booking, with amount)
├─ booking_cancelled (refund issued)
└─ sponsorship_bid (new bid placed)

Batch Aggregation (hourly job):
├─ Sum registrations by event, ticket type
├─ Sum revenue by event, time period
├─ Compute conversion rates (views → bookings)
├─ Update event_analytics_snapshot table
```

**Implementation:**

```typescript
// Event tracking middleware
app.use((req, res, next) => {
  // Intercept all requests for analytics
  const originalSend = res.send;

  res.send = function(data) {
    // Post-response, log analytics event
    if (req.path.includes('/api/events/') && req.method === 'GET') {
      const eventId = req.params.id;
      const userId = req.auth?.userId;

      // Fire-and-forget analytics event
      analyticsService.trackEvent({
        event_type: 'event_view',
        event_id: eventId,
        user_id: userId,
        user_role: req.auth?.role,
        timestamp: new Date().toISOString(),
        user_agent: req.headers['user-agent']
      }).catch(err => logger.warn('Analytics tracking failed', err));
    }

    return originalSend.call(this, data);
  };
  next();
});

// Hourly aggregation job (Bull)
const analyticsAggregationJob = async () => {
  const events = db.query('SELECT id FROM events WHERE status = "approved"');

  for (const event of events) {
    // Aggregate metrics
    const registrations = db.query(`
      SELECT
        COUNT(*) as total,
        SUM(total_price) as revenue,
        (e.total_seats - e.available_seats) as registrations_count
      FROM bookings b
      JOIN events e ON b.event_id = e.id
      WHERE e.id = ? AND b.status = 'confirmed'
    `, [event.id]);

    const engagement = db.query(`
      SELECT
        COUNT(CASE WHEN et.event_type = 'event_view' THEN 1 END) as views,
        COUNT(CASE WHEN et.event_type = 'event_click' THEN 1 END) as clicks,
        COUNT(CASE WHEN et.event_type = 'wishlist_add' THEN 1 END) as wishlist_adds
      FROM event_tracking et
      WHERE et.event_id = ? AND et.created_at > now() - interval '24 hours'
    `, [event.id]);

    const snapshot = {
      event_id: event.id,
      window_type: '7d',
      total_registrations: registrations.registrations_count,
      tickets_sold: registrations.total,
      gross_revenue: registrations.revenue,
      engagement: {
        views: engagement.views,
        clicks: engagement.clicks
      },
      conversion_rate: (registrations.total / engagement.views) || 0,
      computed_at: new Date().toISOString()
    };

    // Store and cache
    db.exec('INSERT INTO event_analytics_snapshot (...) VALUES (...)', [...]);
    await redis.setex(`analytics:${event.id}:7d`, 3600, JSON.stringify(snapshot));
  }
};
```

### 3.6.3 Dashboard Views

**Host Dashboard (Event Metrics):**

```
┌─────────────────────────────────────────┐
│ Event Metrics for "Tech Talks 2026"     │
├─────────────────────────────────────────┤
│ [7d] [30d] [All Time] tabs              │
├─────────────────────────────────────────┤
│ KPIs (Cards)                            │
│ ┌──────────┬──────────┬──────────┐      │
│ │ Reg: 120 │ Rev: $3K │ Eng: 450 │      │
│ │ +15% ↑   │ +22% ↑   │ +8% ↓    │      │
│ └──────────┴──────────┴──────────┘      │
├─────────────────────────────────────────┤
│ Charts                                  │
│ ┌──────────────────────────────────┐    │
│ │ Registrations Over Time          │    │
│ │ [Line chart: daily registrations)│    │
│ │ Peak: Day 3 (35 registrations)   │    │
│ └──────────────────────────────────┘    │
│                                         │
│ ┌──────────────────────────────────┐    │
│ │ Revenue Breakdown               │    │
│ │ [Pie: Early Bird 40%, Regular   │    │
│ │  Regular 50%, VIP 10%]          │    │
│ └──────────────────────────────────┘    │
│                                         │
│ ┌──────────────────────────────────┐    │
│ │ Attendee Demographics           │    │
│ │ [Bar: Student 70%, Faculty 20%  │    │
│ │  Staff 10%]                     │    │
│ └──────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

---

## 3.7 Feature 6 & 7: Messaging & Notifications (Summarized)

Due to length constraints, I'll provide architecture summaries:

### 3.7.1 Messaging System

**Use Cases:**

- Host ↔ Student: Event questions, administrative
- Host ↔ Sponsor: Deal negotiation
- Sponsor ↔ Student: (Future) Direct marketing

**Tech:** WebSocket for real-time + SQL for persistence
**Throughput:** 100K messages/day (Year 3)
**Latency Target:** <500ms message delivery

### 3.7.2 Notification System

**Notification Types:**

- Booking confirmations, cancellations
- Waitlist promotions
- Event reminders (24h, 1h before)
- Sponsorship deal updates
- Admin alerts (reports, flagged content)

**Channels:**

- **Primary:** WebSocket (in-app, real-time)
- **Secondary:** Email (24h digests)
- **Future:** Push notifications (mobile app)

**Architecture:**

```
Event Triggered (e.g., booking_created)
    ↓
Bull Job Queue (Redis)
    ├─ Immediate: In-app WebSocket
    ├─ Delayed: Email (5 min batch)
    └─ Retry: 3 attempts on failure
```

---

## 3.8 Feature Prioritization Matrix

| Feature          | Criticality | Implementation Difficulty | ROI    | Priority          |
| ---------------- | ----------- | ------------------------- | ------ | ----------------- |
| Event Management | 🔴 Critical | Low                       | High   | MVP               |
| Booking System   | 🔴 Critical | Medium                    | High   | MVP               |
| Waitlist         | 🟠 High     | Medium                    | Medium | MVP               |
| Sponsorship      | 🟠 High     | High                      | High   | Post-MVP (Week 3) |
| Analytics        | 🟡 Medium   | High                      | High   | Post-MVP (Week 4) |
| Messaging        | 🟡 Medium   | Medium                    | Medium | Post-MVP (Week 5) |
| Notifications    | 🟡 Medium   | Low                       | High   | Post-MVP (Week 2) |

---

**Document Status:** Phase 1.3 Complete | Next: Phase 2 (Technical Architecture)
**Author:** Product & Engineering Team | Date: March 29, 2026
