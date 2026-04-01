import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, 'events.db'));

const hasColumn = (table: string, column: string): boolean => {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
};

const addColumnIfMissing = (table: string, column: string, typeDef: string) => {
  if (!hasColumn(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeDef}`);
  }
};

// Initialize schema
// Keep creation additive and migration-safe for existing databases.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT CHECK(role IN ('student', 'host', 'admin', 'sponsor')) DEFAULT 'student',
    bio TEXT,
    avatar TEXT,
    host_org_name TEXT,
    host_verified INTEGER DEFAULT 0,
    blocked INTEGER DEFAULT 0,
    referral_code TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    icon TEXT,
    color TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    host_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    date DATETIME NOT NULL,
    venue TEXT NOT NULL,
    category_id TEXT,
    image TEXT,
    status TEXT CHECK(status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')) DEFAULT 'pending',
    featured INTEGER DEFAULT 0,
    total_seats INTEGER NOT NULL,
    available_seats INTEGER NOT NULL,
    latitude REAL,
    longitude REAL,
    series_id TEXT,
    recurrence_type TEXT CHECK(recurrence_type IN ('none', 'weekly', 'monthly')) DEFAULT 'none',
    share_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (host_id) REFERENCES users(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS ticket_types (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    quantity INTEGER NOT NULL,
    sold INTEGER DEFAULT 0,
    FOREIGN KEY (event_id) REFERENCES events(id)
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    booking_ref TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    ticket_type_id TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    total_price REAL NOT NULL,
    qr_code TEXT,
    status TEXT DEFAULT 'confirmed',
    referral_code_used TEXT,
    discount_amount REAL DEFAULT 0,
    checked_in INTEGER DEFAULT 0,
    checked_in_at DATETIME,
    checked_in_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id)
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    ticket_id TEXT UNIQUE NOT NULL,
    booking_id TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    status TEXT CHECK(status IN ('pending', 'verified')) DEFAULT 'pending',
    verification_status TEXT CHECK(verification_status IN ('PENDING_VERIFICATION', 'VERIFIED_ATTENDANCE')) DEFAULT 'PENDING_VERIFICATION',
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    verified_at DATETIME,
    verified_by TEXT,
    expires_at DATETIME,
    qr_token TEXT NOT NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (verified_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    rating INTEGER CHECK(rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, event_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (event_id) REFERENCES events(id)
  );

  CREATE TABLE IF NOT EXISTS discussions (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    parent_id TEXT,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (parent_id) REFERENCES discussions(id)
  );

  CREATE TABLE IF NOT EXISTS faqs (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id)
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT CHECK(status IN ('pending', 'approved', 'dismissed')) DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (event_id) REFERENCES events(id)
  );

  CREATE TABLE IF NOT EXISTS followers (
    follower_id TEXT NOT NULL,
    following_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id),
    FOREIGN KEY (follower_id) REFERENCES users(id),
    FOREIGN KEY (following_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS communities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    image TEXT,
    creator_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS community_members (
    community_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT CHECK(role IN ('member', 'admin', 'moderator')) DEFAULT 'member',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (community_id, user_id),
    FOREIGN KEY (community_id) REFERENCES communities(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS community_posts (
    id TEXT PRIMARY KEY,
    community_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (community_id) REFERENCES communities(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS community_messages (
    id TEXT PRIMARY KEY,
    community_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (community_id) REFERENCES communities(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS wishlists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, event_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (event_id) REFERENCES events(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data_json TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sponsors (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    company_name TEXT NOT NULL,
    website TEXT,
    contact_email TEXT,
    approved INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sponsorship_deals (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    host_id TEXT NOT NULL,
    sponsor_id TEXT NOT NULL,
    title TEXT NOT NULL,
    proposal_amount REAL DEFAULT 0,
    status TEXT CHECK(status IN ('proposed', 'negotiating', 'accepted', 'rejected', 'cancelled')) DEFAULT 'proposed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (host_id) REFERENCES users(id),
    FOREIGN KEY (sponsor_id) REFERENCES sponsors(id)
  );

  CREATE TABLE IF NOT EXISTS sponsorship_messages (
    id TEXT PRIMARY KEY,
    deal_id TEXT NOT NULL,
    sender_user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (deal_id) REFERENCES sponsorship_deals(id),
    FOREIGN KEY (sender_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sponsor_spots (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    label TEXT NOT NULL,
    spot_type TEXT CHECK(spot_type IN ('booth', 'banner', 'stall', 'premium')) NOT NULL,
    base_price REAL DEFAULT 0,
    is_premium INTEGER DEFAULT 0,
    status TEXT CHECK(status IN ('open', 'reserved', 'booked')) DEFAULT 'open',
    reserved_deal_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (reserved_deal_id) REFERENCES sponsorship_deals(id)
  );

  CREATE TABLE IF NOT EXISTS bids (
    id TEXT PRIMARY KEY,
    spot_id TEXT NOT NULL,
    sponsor_id TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT CHECK(status IN ('active', 'outbid', 'won', 'overridden')) DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (spot_id) REFERENCES sponsor_spots(id),
    FOREIGN KEY (sponsor_id) REFERENCES sponsors(id)
  );

  CREATE TABLE IF NOT EXISTS waitlist (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT CHECK(status IN ('waiting', 'promoted', 'removed')) DEFAULT 'waiting',
    promoted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, user_id),
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS promo_codes (
    id TEXT PRIMARY KEY,
    host_id TEXT NOT NULL,
    event_id TEXT,
    code TEXT UNIQUE NOT NULL,
    discount_type TEXT CHECK(discount_type IN ('percent', 'fixed')) DEFAULT 'percent',
    discount_value REAL NOT NULL,
    expires_at DATETIME,
    usage_limit INTEGER,
    usage_count INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (host_id) REFERENCES users(id),
    FOREIGN KEY (event_id) REFERENCES events(id)
  );

  CREATE TABLE IF NOT EXISTS check_ins (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    checked_in_by TEXT NOT NULL,
    check_in_source TEXT CHECK(check_in_source IN ('scanner', 'manual', 'api')) DEFAULT 'api',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id),
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (checked_in_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS referral_credits (
    id TEXT PRIMARY KEY,
    referrer_id TEXT NOT NULL,
    referee_id TEXT NOT NULL,
    booking_id TEXT,
    credit_amount REAL DEFAULT 0,
    status TEXT CHECK(status IN ('pending', 'awarded')) DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (referrer_id) REFERENCES users(id),
    FOREIGN KEY (referee_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS event_engagement_events (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    actor_user_id TEXT,
    session_id TEXT,
    event_type TEXT CHECK(event_type IN ('view', 'click', 'share', 'sponsor_cta_click')) NOT NULL,
    source TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (actor_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS event_analytics (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    series_id TEXT,
    window_type TEXT CHECK(window_type IN ('7d', '30d', '90d', 'all')) DEFAULT '30d',
    total_registrations INTEGER DEFAULT 0,
    tickets_sold INTEGER DEFAULT 0,
    gross_revenue REAL DEFAULT 0,
    unique_views INTEGER DEFAULT 0,
    cta_clicks INTEGER DEFAULT 0,
    conversion_rate REAL DEFAULT 0,
    demographics_json TEXT,
    computed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id)
  );

  CREATE TABLE IF NOT EXISTS sponsorship_requests (
    id TEXT PRIMARY KEY,
    direction TEXT CHECK(direction IN ('sponsor_to_host', 'host_to_sponsor', 'admin_to_sponsor')) NOT NULL,
    sender_user_id TEXT NOT NULL,
    sender_role TEXT CHECK(sender_role IN ('sponsor', 'host', 'admin')) NOT NULL,
    receiver_user_id TEXT NOT NULL,
    receiver_role TEXT CHECK(receiver_role IN ('sponsor', 'host')) NOT NULL,
    sponsor_id TEXT,
    host_id TEXT,
    event_id TEXT,
    message TEXT NOT NULL,
    proposed_amount REAL DEFAULT 0,
    status TEXT CHECK(status IN ('pending', 'accepted', 'rejected', 'withdrawn', 'expired')) DEFAULT 'pending',
    responded_by TEXT,
    responded_at DATETIME,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_user_id) REFERENCES users(id),
    FOREIGN KEY (receiver_user_id) REFERENCES users(id),
    FOREIGN KEY (sponsor_id) REFERENCES sponsors(id),
    FOREIGN KEY (host_id) REFERENCES users(id),
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (responded_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS deals (
    id TEXT PRIMARY KEY,
    request_id TEXT UNIQUE NOT NULL,
    event_id TEXT NOT NULL,
    sponsor_id TEXT NOT NULL,
    host_id TEXT NOT NULL,
    admin_owner_id TEXT,
    agreed_amount REAL DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    status TEXT CHECK(status IN ('active', 'completed', 'cancelled')) DEFAULT 'active',
    start_at DATETIME,
    end_at DATETIME,
    cancel_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES sponsorship_requests(id),
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (sponsor_id) REFERENCES sponsors(id),
    FOREIGN KEY (host_id) REFERENCES users(id),
    FOREIGN KEY (admin_owner_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS deal_messages (
    id TEXT PRIMARY KEY,
    deal_id TEXT NOT NULL,
    sender_user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (deal_id) REFERENCES deals(id),
    FOREIGN KEY (sender_user_id) REFERENCES users(id)
  );
`);

// Upgrade legacy users role CHECK constraint to include sponsor.
const usersTableSqlRow = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
  .get() as { sql?: string } | undefined;

if (usersTableSqlRow?.sql && !usersTableSqlRow.sql.includes("'sponsor'")) {
  db.transaction(() => {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec(`
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT CHECK(role IN ('student', 'host', 'admin', 'sponsor')) DEFAULT 'student',
        bio TEXT,
        avatar TEXT,
        host_org_name TEXT,
        host_verified INTEGER DEFAULT 0,
        blocked INTEGER DEFAULT 0,
        referral_code TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.exec(`
      INSERT INTO users_new (id, name, email, password, role, bio, avatar, host_org_name, host_verified, blocked, referral_code, created_at)
      SELECT id, name, email, password, role, bio, avatar, host_org_name, host_verified, blocked, referral_code, created_at
      FROM users;
    `);

    db.exec('DROP TABLE users;');
    db.exec('ALTER TABLE users_new RENAME TO users;');
    db.exec('PRAGMA foreign_keys = ON;');
  })();
}

// Backward-compatible additive migrations for older local databases.
addColumnIfMissing('users', 'referral_code', 'TEXT');
addColumnIfMissing('events', 'latitude', 'REAL');
addColumnIfMissing('events', 'longitude', 'REAL');
addColumnIfMissing('events', 'series_id', 'TEXT');
addColumnIfMissing('events', 'recurrence_type', "TEXT DEFAULT 'none'");
addColumnIfMissing('events', 'share_count', 'INTEGER DEFAULT 0');
addColumnIfMissing('bookings', 'referral_code_used', 'TEXT');
addColumnIfMissing('bookings', 'discount_amount', 'REAL DEFAULT 0');
addColumnIfMissing('bookings', 'checked_in', 'INTEGER DEFAULT 0');
addColumnIfMissing('bookings', 'checked_in_at', 'DATETIME');
addColumnIfMissing('bookings', 'checked_in_by', 'TEXT');
addColumnIfMissing('bookings', 'promo_code_used', 'TEXT');
addColumnIfMissing('notifications', 'dedupe_key', 'TEXT');
addColumnIfMissing('tickets', 'verification_status', "TEXT DEFAULT 'PENDING_VERIFICATION'");

db.exec(`
  UPDATE tickets
  SET verification_status = CASE
    WHEN status = 'verified' THEN 'VERIFIED_ATTENDANCE'
    ELSE 'PENDING_VERIFICATION'
  END
  WHERE verification_status IS NULL
     OR verification_status NOT IN ('PENDING_VERIFICATION', 'VERIFIED_ATTENDANCE');
`);

db.exec('CREATE INDEX IF NOT EXISTS idx_tickets_event_status ON tickets(event_id, status);');
db.exec('CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);');
db.exec('CREATE INDEX IF NOT EXISTS idx_tickets_booking_id ON tickets(booking_id);');

// Full text search index for events discovery.
// Recreate each startup to keep local data deterministic and avoid legacy schema issues.
db.exec('DROP TABLE IF EXISTS events_fts;');
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
    event_id UNINDEXED,
    name,
    description,
    venue,
    category_name
  );
`);

db.exec(`
  INSERT INTO events_fts(event_id, name, description, venue, category_name)
  SELECT e.id, e.name, COALESCE(e.description, ''), COALESCE(e.venue, ''), COALESCE(c.name, '')
  FROM events e
  LEFT JOIN categories c ON c.id = e.category_id;
`);

// Seed categories if empty
const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number };
if (categoryCount.count === 0) {
  const insertCategory = db.prepare('INSERT INTO categories (id, name, icon, color) VALUES (?, ?, ?, ?)');
  const categories = [
    ['1', 'Technology', '💻', 'blue'],
    ['2', 'Music', '🎵', 'purple'],
    ['3', 'Sports', '⚽', 'green'],
    ['4', 'Arts', '🎨', 'orange'],
    ['5', 'Business', '💼', 'indigo'],
    ['6', 'Food & Drink', '🍕', 'red'],
    ['7', 'Education', '📚', 'yellow']
  ];
  categories.forEach((cat) => insertCategory.run(...cat));
}

// Seed test users if they don't exist
const testUsers = [
  ['admin-id', 'Super User', 'admin@college.com', bcrypt.hashSync('admin123', 12), 'admin', null, 1],
  ['host-id', 'College Host', 'host@college.com', bcrypt.hashSync('admin123', 12), 'host', 'College Events', 1],
  ['student-id', 'College Student', 'student@college.com', bcrypt.hashSync('admin123', 12), 'student', null, 0],
  ['sponsor-id', 'Campus Sponsor', 'sponsor@college.com', bcrypt.hashSync('admin123', 12), 'sponsor', 'Campus Sponsor Co', 1]
];
const disabledLegacyHash = bcrypt.hashSync('disabled-account', 12);

const resetSeedUsers = db.transaction(() => {
  // Never delete users directly here because historical rows can be referenced by FK tables.
  // Instead, neutralize legacy seeded identities and keep canonical credentials on stable IDs.
  const neutralizeLegacyId = db.prepare('UPDATE users SET email = ?, password = ?, blocked = 1 WHERE id = ?');
  neutralizeLegacyId.run('legacy-college-admin@invalid.local', disabledLegacyHash, 'college-admin-id');
  neutralizeLegacyId.run('legacy-college-host@invalid.local', disabledLegacyHash, 'college-host-id');
  neutralizeLegacyId.run('legacy-college-student@invalid.local', disabledLegacyHash, 'college-student-id');

  db.prepare(`
    UPDATE users
    SET email = id || '@legacy.local', password = ?, blocked = 1
    WHERE lower(email) IN ('admin@eventhub.com', 'host@eventhub.com', 'student@eventhub.com')
      AND id NOT IN ('admin-id', 'host-id', 'student-id')
  `).run(disabledLegacyHash);

  const upsertUser = db.prepare(`
    INSERT INTO users (id, name, email, password, role, host_org_name, host_verified)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      email = excluded.email,
      password = excluded.password,
      role = excluded.role,
      host_org_name = excluded.host_org_name,
      host_verified = excluded.host_verified
  `);

  testUsers.forEach((user) => upsertUser.run(...user));
});

resetSeedUsers();

db.prepare(
  `
    INSERT INTO sponsors (id, user_id, company_name, website, contact_email, approved)
    VALUES (?, ?, ?, ?, ?, 1)
    ON CONFLICT(user_id) DO UPDATE SET
      company_name = excluded.company_name,
      website = excluded.website,
      contact_email = excluded.contact_email,
      approved = 1,
      updated_at = CURRENT_TIMESTAMP
  `
).run('sponsor-profile-id', 'sponsor-id', 'Campus Sponsor Co', 'https://campus-sponsor.example', 'sponsor@college.com');

// Backfill referral codes for users missing one.
const usersWithoutReferral = db.prepare('SELECT id FROM users WHERE referral_code IS NULL').all() as Array<{ id: string }>;
const setReferralCode = db.prepare('UPDATE users SET referral_code = ? WHERE id = ?');
usersWithoutReferral.forEach((u) => {
  const code = `EH${u.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}`;
  setReferralCode.run(code, u.id);
});

// Enforce uniqueness with an index (ALTER TABLE cannot add UNIQUE columns in SQLite).
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code_unique ON users(referral_code)');
db.exec('CREATE INDEX IF NOT EXISTS idx_waitlist_event_status_created ON waitlist(event_id, status, created_at, id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at)');
db.exec('CREATE INDEX IF NOT EXISTS idx_sponsorship_deals_event ON sponsorship_deals(event_id, status)');
db.exec('CREATE INDEX IF NOT EXISTS idx_bids_spot_status_amount ON bids(spot_id, status, amount DESC, created_at ASC)');
db.exec('CREATE INDEX IF NOT EXISTS idx_promo_codes_host_code ON promo_codes(host_id, code)');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_check_ins_booking_unique ON check_ins(booking_id)');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe_key ON notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL');
db.exec('CREATE INDEX IF NOT EXISTS idx_engagement_event_time ON event_engagement_events(event_id, event_type, created_at DESC)');
db.exec('CREATE INDEX IF NOT EXISTS idx_engagement_session ON event_engagement_events(event_id, session_id, event_type)');
db.exec('CREATE INDEX IF NOT EXISTS idx_event_analytics_event_window ON event_analytics(event_id, window_type, computed_at DESC)');
db.exec('CREATE INDEX IF NOT EXISTS idx_event_analytics_series_window ON event_analytics(series_id, window_type, computed_at DESC)');
db.exec('CREATE INDEX IF NOT EXISTS idx_requests_receiver_status ON sponsorship_requests(receiver_user_id, status, created_at DESC)');
db.exec('CREATE INDEX IF NOT EXISTS idx_requests_sender_status ON sponsorship_requests(sender_user_id, status, created_at DESC)');
db.exec('CREATE INDEX IF NOT EXISTS idx_requests_event_status ON sponsorship_requests(event_id, status, created_at DESC)');
db.exec('CREATE INDEX IF NOT EXISTS idx_deals_host_status ON deals(host_id, status, created_at DESC)');
db.exec('CREATE INDEX IF NOT EXISTS idx_deals_sponsor_status ON deals(sponsor_id, status, created_at DESC)');
db.exec('CREATE INDEX IF NOT EXISTS idx_deals_event_status ON deals(event_id, status, created_at DESC)');
db.exec('CREATE INDEX IF NOT EXISTS idx_deal_messages_deal_created ON deal_messages(deal_id, created_at ASC)');

// Seed sample communities if empty
const communityCount = db.prepare('SELECT COUNT(*) as count FROM communities').get() as { count: number };
if (communityCount.count === 0) {
  const insertCommunity = db.prepare('INSERT INTO communities (id, name, description, image, creator_id) VALUES (?, ?, ?, ?, ?)');
  const insertMember = db.prepare('INSERT INTO community_members (community_id, user_id, role) VALUES (?, ?, ?)');

  const sampleCommunities = [
    ['c1', 'Tech Innovators', 'A community for developers, designers, and tech enthusiasts to share knowledge and collaborate.', 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&q=80', 'host-id'],
    ['c2', 'Music Lovers', 'Connect with fellow music fans, share playlists, and discuss the latest concerts.', 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80', 'student-id'],
    ['c3', 'Campus Athletes', 'The official community for university sports teams and fitness enthusiasts.', 'https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&q=80', 'admin-id']
  ];

  sampleCommunities.forEach((comm) => {
    insertCommunity.run(...comm);
    insertMember.run(comm[0], comm[4], 'admin');
  });
}

// Seed sample events
const insertEvent = db.prepare(`
  INSERT OR IGNORE INTO events (id, host_id, name, description, date, venue, category_id, image, status, featured, total_seats, available_seats, recurrence_type)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertTicket = db.prepare(`
  INSERT OR IGNORE INTO ticket_types (id, event_id, name, price, quantity, sold)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const insertFaq = db.prepare(`
  INSERT OR IGNORE INTO faqs (id, event_id, question, answer)
  VALUES (?, ?, ?, ?)
`);

const now = new Date();
const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
const nextYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();

const sampleEvents = [
  ['e1', 'host-id', 'Global Tech Summit 2026', 'Join industry leaders for the biggest tech event of the year.', nextWeek, 'Innovation Center, Silicon Valley', '1', 'https://images.unsplash.com/photo-1540575861501-7ad05823c9f5?auto=format&fit=crop&q=80', 'approved', 1, 500, 500, 'none'],
  ['e2', 'host-id', 'Neon Nights Music Festival', 'Experience the best electronic music under the stars.', nextMonth, 'Starlight Arena, Los Angeles', '2', 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&q=80', 'approved', 0, 1000, 1000, 'none'],
  ['e3', 'host-id', 'Startup Pitch Night', 'Watch emerging startups compete for funding and mentorship.', nextWeek, 'Business Hub, New York', '5', 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&q=80', 'pending', 0, 100, 100, 'none'],
  ['e4', 'host-id', 'International Food Expo', 'Taste cuisines from around the world in one place.', nextMonth, 'Expo Center, Chicago', '6', 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&q=80', 'approved', 1, 300, 300, 'none'],
  ['e5', 'host-id', 'Future of AI Workshop', 'Hands-on workshop on the latest AI technologies.', nextWeek, 'Tech Lab, Boston', '1', 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80', 'approved', 0, 50, 50, 'none'],
  ['e6', 'host-id', 'Modern Art Exhibition', 'Explore contemporary masterpieces from local artists.', nextMonth, 'City Gallery, San Francisco', '4', 'https://images.unsplash.com/photo-1547826039-bfc35e0f1ea8?auto=format&fit=crop&q=80', 'approved', 0, 200, 200, 'none'],
  ['e7', 'host-id', 'Championship Finals', 'The ultimate showdown in college basketball.', nextYear, 'Grand Stadium, Houston', '3', 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?auto=format&fit=crop&q=80', 'approved', 1, 5000, 5000, 'none'],
  ['e8', 'host-id', 'Academic Excellence Seminar', 'Learn effective study techniques and research methodologies.', nextWeek, 'University Hall, Room 302', '7', 'https://images.unsplash.com/photo-1523050335392-9bef867a0578?auto=format&fit=crop&q=80', 'approved', 0, 150, 150, 'none']
];

sampleEvents.forEach((event) => {
  insertEvent.run(...event);
  insertTicket.run(`t-${event[0]}-1`, event[0], 'General Admission', 49.99, (event[10] as number) * 0.8, 0);
  insertTicket.run(`t-${event[0]}-2`, event[0], 'VIP Experience', 149.99, (event[10] as number) * 0.2, 0);

  insertFaq.run(`f-${event[0]}-1`, event[0], 'Is there parking available?', 'Yes, free parking is available on-site.');
  insertFaq.run(`f-${event[0]}-2`, event[0], 'Can I get a refund?', 'Refunds are available up to 48 hours before the event.');
});

// Seed additional diverse users for a more realistic platform
const additionalUsers = [
  ['student-2', 'alice.chen@college.edu', 'Alice Chen', '$2a$10$eImiTXuWVxfaHNYY0iHv.OPST9/PgBkqquzi.Ss7KIUgO2xAG5Dfu', 'student', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80', 1, null],
  ['student-3', 'bob.smith@college.edu', 'Bob Smith', '$2a$10$eImiTXuWVxfaHNYY0iHv.OPST9/PgBkqquzi.Ss7KIUgO2xAG5Dfu', 'student', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80', 1, null],
  ['student-4', 'carol.williams@college.edu', 'Carol Williams', '$2a$10$eImiTXuWVxfaHNYY0iHv.OPST9/PgBkqquzi.Ss7KIUgO2xAG5Dfu', 'student', 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80', 1, null],
  ['student-5', 'david.jones@college.edu', 'David Jones', '$2a$10$eImiTXuWVxfaHNYY0iHv.OPST9/PgBkqquzi.Ss7KIUgO2xAG5Dfu', 'student', 'https://images.unsplash.com/photo-1500648767791-03d20d535169?auto=format&fit=crop&q=80', 1, null],
  ['student-6', 'emma.davis@college.edu', 'Emma Davis', '$2a$10$eImiTXuWVxfaHNYY0iHv.OPST9/PgBkqquzi.Ss7KIUgO2xAG5Dfu', 'student', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80', 1, null],
  ['host-2', 'james.eventmanager@college.edu', 'James Event Manager', '$2a$10$eImiTXuWVxfaHNYY0iHv.OPST9/PgBkqquzi.Ss7KIUgO2xAG5Dfu', 'host', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80', 1, 1],
  ['host-3', 'susan.productions@college.edu', 'Susan Productions', '$2a$10$eImiTXuWVxfaHNYY0iHv.OPST9/PgBkqquzi.Ss7KIUgO2xAG5Dfu', 'host', 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80', 1, 1],
  ['sponsor-2', 'techcorp@sponsor.com', 'TechCorp Innovations', '$2a$10$eImiTXuWVxfaHNYY0iHv.OPST9/PgBkqquzi.Ss7KIUgO2xAG5Dfu', 'sponsor', 'https://images.unsplash.com/photo-1500648767791-03d20d535169?auto=format&fit=crop&q=80', 1, null],
  ['sponsor-3', 'globalbrands@sponsor.com', 'Global Brands Inc', '$2a$10$eImiTXuWVxfaHNYY0iHv.OPST9/PgBkqquzi.Ss7KIUgO2xAG5Dfu', 'sponsor', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80', 1, null],
  ['sponsor-4', 'startup.ventures@sponsor.com', 'Startup Ventures LLC', '$2a$10$eImiTXuWVxfaHNYY0iHv.OPST9/PgBkqquzi.Ss7KIUgO2xAG5Dfu', 'sponsor', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80', 1, null],
];

additionalUsers.forEach((user) => {
  const [id, email, name, password, role, avatar, hostVerified] = user;
  db.prepare(
    `INSERT OR IGNORE INTO users (id, email, name, password, role, avatar, host_verified) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, email, name, password, role, avatar, hostVerified);
});

// Seed sponsor profiles
const sponsorProfiles = [
  ['sp-2', 'sponsor-2', 'TechCorp Innovations', 'https://techcorp.example', 'partnerships@techcorp.com'],
  ['sp-3', 'sponsor-3', 'Global Brands Inc', 'https://globalbrands.example', 'events@globalbrands.com'],
  ['sp-4', 'sponsor-4', 'Startup Ventures LLC', 'https://startupsventures.example', 'sponsorship@ventures.com'],
];

sponsorProfiles.forEach((profile) => {
  const [spId, userId, company, website, email] = profile;
  db.prepare(
    `INSERT OR IGNORE INTO sponsors (id, user_id, company_name, website, contact_email, approved) 
     VALUES (?, ?, ?, ?, ?, 1)`
  ).run(spId, userId, company, website, email);
});

// Seed realistic bookings with various statuses
const sampleBookings = [
  ['b1', 'BOOK-001', 'student-id', 'e1', 't-e1-1', 2, 99.98, null, 0, null, 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=BOOK-001', 1, 'confirmed'],
  ['b2', 'BOOK-002', 'student-2', 'e1', 't-e1-2', 1, 149.99, null, 0, null, 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=BOOK-002', 0, 'confirmed'],
  ['b3', 'BOOK-003', 'student-3', 'e2', 't-e2-1', 3, 149.97, null, 0, null, 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=BOOK-003', 1, 'confirmed'],
  ['b4', 'BOOK-004', 'student-4', 'e2', 't-e2-2', 2, 299.98, null, 0, null, 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=BOOK-004', 0, 'confirmed'],
  ['b5', 'BOOK-005', 'student-5', 'e4', 't-e4-1', 1, 49.99, null, 0, null, 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=BOOK-005', 0, 'confirmed'],
  ['b6', 'BOOK-006', 'student-id', 'e4', 't-e4-2', 2, 299.98, null, 0, null, 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=BOOK-006', 1, 'confirmed'],
  ['b7', 'BOOK-007', 'student-2', 'e5', 't-e5-1', 1, 49.99, null, 0, null, 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=BOOK-007', 1, 'confirmed'],
  ['b8', 'BOOK-008', 'student-3', 'e6', 't-e6-1', 2, 99.98, null, 0, null, 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=BOOK-008', 0, 'confirmed'],
  ['b9', 'BOOK-009', 'student-4', 'e8', 't-e8-1', 1, 49.99, null, 0, null, 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=BOOK-009', 1, 'confirmed'],
  ['b10', 'BOOK-010', 'student-5', 'e1', 't-e1-1', 1, 49.99, null, 0, null, 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=BOOK-010', 0, 'cancelled'],
];

const insertBooking = db.prepare(`
  INSERT OR IGNORE INTO bookings (id, booking_ref, user_id, event_id, ticket_type_id, quantity, total_price, discount_amount, promo_code_used, referral_code_used, qr_code, checked_in, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

sampleBookings.forEach((booking) => insertBooking.run(...booking));

// Seed check-ins
const sampleCheckIns = [
  ['ci1', 'b1', 'e1', 'host-id', 'scanner'],
  ['ci2', 'b2', 'e1', 'host-id', 'scanner'],
  ['ci3', 'b3', 'e2', 'host-id', 'manual'],
  ['ci4', 'b4', 'e2', 'host-id', 'scanner'],
  ['ci5', 'b6', 'e4', 'host-id', 'manual'],
  ['ci6', 'b7', 'e5', 'host-id', 'scanner'],
  ['ci7', 'b8', 'e6', 'host-id', 'api'],
  ['ci8', 'b9', 'e8', 'host-id', 'scanner'],
];

const insertCheckIn = db.prepare(`
  INSERT OR IGNORE INTO check_ins (id, booking_id, event_id, checked_in_by, check_in_source)
  VALUES (?, ?, ?, ?, ?)
`);

sampleCheckIns.forEach((ci) => insertCheckIn.run(...ci));

// Seed engagement events (views, clicks, shares)
const sampleEngagements = [
  ['g1', 'e1', 'student-id', 'session1', 'view', null],
  ['g2', 'e1', 'student-2', 'session2', 'view', null],
  ['g3', 'e1', 'student-3', 'session1', 'click', null],
  ['g4', 'e1', 'student-4', 'session3', 'share', null],
  ['g5', 'e2', 'student-id', 'session1', 'view', null],
  ['g6', 'e2', 'student-2', 'session2', 'view', null],
  ['g7', 'e2', 'student-3', 'session4', 'click', null],
  ['g8', 'e4', 'student-5', 'session5', 'view', null],
  ['g9', 'e4', 'student-id', 'session1', 'sponsor_cta_click', null],
  ['g10', 'e5', 'student-2', 'session2', 'view', null],
  ['g11', 'e5', 'student-3', 'session4', 'click', null],
  ['g12', 'e6', 'student-4', 'session3', 'view', null],
];

const insertEngagement = db.prepare(`
  INSERT OR IGNORE INTO event_engagement_events (id, event_id, actor_user_id, session_id, event_type, source)
  VALUES (?, ?, ?, ?, ?, ?)
`);

sampleEngagements.forEach((eng) => insertEngagement.run(...eng));

// Seed analytics snapshots
const sampleAnalytics = [
  ['a1', 'e1', null, '30d', 156, 68, 4899.32, 237, 45, 45.5],
  ['a2', 'e2', null, '30d', 342, 128, 12874.72, 456, 112, 37.5],
  ['a3', 'e4', null, '30d', 89, 42, 3124.68, 178, 32, 47.2],
  ['a4', 'e5', null, '30d', 45, 28, 1399.72, 78, 18, 62.2],
  ['a5', 'e6', null, '30d', 123, 65, 2899.65, 234, 48, 52.8],
  ['a6', 'e8', null, '30d', 234, 95, 4674.95, 312, 72, 40.6],
];

const insertAnalytics = db.prepare(`
  INSERT OR IGNORE INTO event_analytics (id, event_id, series_id, window_type, total_registrations, tickets_sold, gross_revenue, unique_views, cta_clicks, conversion_rate)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

sampleAnalytics.forEach((ana) => insertAnalytics.run(...ana));

// Seed reviews and discussions
const sampleReviews = [
  ['r1', 'student-id', 'e1', 5, 'Amazing event! Best tech summit I\'ve attended. Highly recommend!'],
  ['r2', 'student-2', 'e1', 4, 'Great speakers and networking opportunities. Could use better food options.'],
  ['r3', 'student-3', 'e2', 5, 'The music was incredible! Best festival ever!'],
  ['r4', 'student-4', 'e2', 3, 'Good variety, but too crowded. Need better crowd management.'],
  ['r5', 'student-5', 'e4', 5, 'Delicious food from around the world. Will definitely come next year.'],
  ['r6', 'student-id', 'e4', 4, 'Great atmosphere and variety. A little pricey for some items.'],
];

const insertReview = db.prepare(`
  INSERT OR IGNORE INTO reviews (id, user_id, event_id, rating, comment)
  VALUES (?, ?, ?, ?, ?)
`);

sampleReviews.forEach((review) => insertReview.run(...review));

// Seed discussions and comments
const sampleDiscussions = [
  ['d1', 'e1', 'student-id', 'Looking forward to the AI session!', null],
  ['d2', 'e1', 'student-2', 'Has anyone attended this before?', null],
  ['d3', 'e1', 'student-3', 'Yes! Last year was amazing.', 'd2'],
  ['d4', 'e2', 'student-4', 'What time should I arrive?', null],
  ['d5', 'e2', 'student-id', 'Doors open at 6 PM. Headliner at 11 PM.', 'd4'],
  ['d6', 'e4', 'student-5', 'Any dietary restrictions accommodation?', null],
  ['d7', 'e5', 'student-2', 'Can I bring my laptop?', null],
];

const insertDiscussion = db.prepare(`
  INSERT OR IGNORE INTO discussions (id, event_id, user_id, message, parent_id)
  VALUES (?, ?, ?, ?, ?)
`);

sampleDiscussions.forEach((disc) => insertDiscussion.run(...disc));

// Seed sponsorship requests and deals
const sampleRequests = [
  ['sr1', 'sponsor_to_host', 'sponsor-id', 'sponsor', 'host-id', 'host', 'sponsor-profile-id', 'host-id', 'e1', 'Interested in sponsoring this amazing tech summit', 5000, 'pending', null, null, null],
  ['sr2', 'sponsor_to_host', 'sponsor-2', 'sponsor', 'host-id', 'host', 'sp-2', 'host-id', 'e2', 'We would love to sponsor this music festival as title sponsor', 15000, 'accepted', 'host-id', null, null],
  ['sr3', 'host_to_sponsor', 'host-id', 'host', 'sponsor-3', 'sponsor', 'sp-3', 'host-id', 'e4', 'Sponsorship opportunity for Food Expo', 8000, 'accepted', 'sponsor-3', null, null],
  ['sr4', 'sponsor_to_host', 'sponsor-4', 'sponsor', 'host-id', 'host', 'sp-4', 'host-id', 'e5', 'Interested in workshop sponsorship', 3000, 'rejected', 'host-id', null, null],
];

const insertSponsorReq = db.prepare(`
  INSERT OR IGNORE INTO sponsorship_requests (id, direction, sender_user_id, sender_role, receiver_user_id, receiver_role, sponsor_id, host_id, event_id, message, proposed_amount, status, responded_by, responded_at, expires_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

sampleRequests.forEach((req) => insertSponsorReq.run(...req));

// Seed deals (from accepted requests)
const sampleDeals = [
  ['deal1', 'sr2', 'e2', 'sp-2', 'host-id', null, 15000, 'USD', 'active', null, null, null],
  ['deal2', 'sr3', 'e4', 'sp-3', 'host-id', null, 8000, 'USD', 'active', null, null, null],
];

const insertDeal = db.prepare(`
  INSERT OR IGNORE INTO deals (id, request_id, event_id, sponsor_id, host_id, admin_owner_id, agreed_amount, currency, status, start_at, end_at, cancel_reason)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

sampleDeals.forEach((deal) => insertDeal.run(...deal));

// Seed deal messages
const sampleDealMessages = [
  ['dm1', 'deal1', 'sponsor-2', 'We can also provide additional promotional materials for social media.'],
  ['dm2', 'deal1', 'host-id', 'That would be perfect! We appreciate the partnership.'],
  ['dm3', 'deal2', 'sponsor-3', 'Looking forward to a great event. Our team will be there day of.'],
  ['dm4', 'deal2', 'host-id', 'Excellent! We have reserved premium booth space for you.'],
];

const insertDealMsg = db.prepare(`
  INSERT OR IGNORE INTO deal_messages (id, deal_id, sender_user_id, message)
  VALUES (?, ?, ?, ?)
`);

sampleDealMessages.forEach((msg) => insertDealMsg.run(...msg));

// Seed community posts and messages
const communityPosts = [
  ['p1', 'c1', 'host-id', 'Welcome to Tech Innovators! Share your latest projects and ideas here.', null],
  ['p2', 'c1', 'student-id', 'Just launched my new framework for building scalable applications. Check it out!', null],
  ['p3', 'c2', 'student-2', 'What\'s everyone listening to this week? I\'m vibing with the new synthwave releases.', null],
  ['p4', 'c3', 'host-id', 'Championship registration is now open! Sign up your team today.', null],
];

const insertPost = db.prepare(`
  INSERT OR IGNORE INTO community_posts (id, community_id, user_id, content, image)
  VALUES (?, ?, ?, ?, ?)
`);

communityPosts.forEach((post) => insertPost.run(...post));

// Seed community messages
const communityMessages = [
  ['m1', 'c1', 'student-id', 'Thanks for creating this community!'],
  ['m2', 'c1', 'student-2', 'Excited to be part of this!'],
  ['m3', 'c1', 'student-3', 'Looks great! Can\'t wait to try it.'],
  ['m4', 'c2', 'student-4', '@student-2 I\'ve been listening to Synthwave too. Have you heard the new album by Dance with Ghosts?'],
  ['m5', 'c2', 'student-5', 'Yes! That album is fire. Also checking out Kavinsky lately.'],
  ['m6', 'c3', 'student-id', 'What are the registration fees?'],
  ['m7', 'c3', 'host-id', '@student-id Teams are \$200 to register. Contact us for group discounts!'],
];

const insertMessage = db.prepare(`
  INSERT OR IGNORE INTO community_messages (id, community_id, user_id, message)
  VALUES (?, ?, ?, ?)
`);

communityMessages.forEach((msg) => insertMessage.run(...msg));

// Add existing community members
const insertMember = db.prepare('INSERT OR IGNORE INTO community_members (community_id, user_id, role) VALUES (?, ?, ?)');
const memberData = [
  ['c1', 'student-id', 'member'],
  ['c1', 'student-2', 'member'],
  ['c1', 'student-3', 'member'],
  ['c2', 'student-2', 'member'],
  ['c2', 'student-4', 'member'],
  ['c2', 'student-5', 'member'],
  ['c3', 'student-id', 'member'],
  ['c3', 'student-3', 'member'],
  ['c3', 'student-4', 'member'],
];

memberData.forEach((member) => insertMember.run(...member));

// Seed promo codes
const samplePromoCodes = [
  ['pc1', 'host-id', 'e1', 'EARLYBIRD', 'percent', 20, '2026-04-15T23:59:59Z', 50, 0, 1],
  ['pc2', 'host-id', 'e2', 'STUDENT20', 'percent', 20, '2026-04-30T23:59:59Z', null, 0, 1],
  ['pc3', 'host-id', 'e4', 'FOODFEST10', 'fixed', 10, '2026-05-15T23:59:59Z', 100, 0, 1],
  ['pc4', 'host-id', 'e5', 'WORKSHOP', 'percent', 15, '2026-04-20T23:59:59Z', 30, 0, 1],
];

const insertPromo = db.prepare(`
  INSERT OR IGNORE INTO promo_codes (id, host_id, event_id, code, discount_type, discount_value, expires_at, usage_limit, usage_count, is_active)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

samplePromoCodes.forEach((promo) => insertPromo.run(...promo));

// Seed referral credits
const sampleReferrals = [
  ['ref1', 'student-id', 'student-2', 'b1', 9.99, 'awarded'],
  ['ref2', 'student-2', 'student-3', 'b3', 14.99, 'awarded'],
  ['ref3', 'student-3', 'student-4', 'b8', 9.99, 'pending'],
];

const insertReferral = db.prepare(`
  INSERT OR IGNORE INTO referral_credits (id, referrer_id, referee_id, booking_id, credit_amount, status)
  VALUES (?, ?, ?, ?, ?, ?)
`);

sampleReferrals.forEach((ref) => insertReferral.run(...ref));

// Seed waitlist entries
const sampleWaitlist = [
  ['wl1', 'e7', 'student-id', 'waiting'],
  ['wl2', 'e7', 'student-2', 'waiting'],
  ['wl3', 'e7', 'student-3', 'waiting'],
  ['wl4', 'e3', 'student-5', 'waiting'],
];

const insertWaitlist = db.prepare(`
  INSERT OR IGNORE INTO waitlist (id, event_id, user_id, status)
  VALUES (?, ?, ?, ?)
`);

sampleWaitlist.forEach((wl) => insertWaitlist.run(...wl));

// Rebuild FTS after potential seeding.
db.exec('DELETE FROM events_fts;');
db.exec(`
  INSERT INTO events_fts(event_id, name, description, venue, category_name)
  SELECT e.id, e.name, COALESCE(e.description, ''), COALESCE(e.venue, ''), COALESCE(c.name, '')
  FROM events e
  LEFT JOIN categories c ON c.id = e.category_id;
`);

export default db;
