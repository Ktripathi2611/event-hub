import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, 'events.db'));

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT CHECK(role IN ('student', 'host', 'admin')) DEFAULT 'student',
    bio TEXT,
    avatar TEXT,
    host_org_name TEXT,
    host_verified INTEGER DEFAULT 0,
    blocked INTEGER DEFAULT 0,
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id)
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
  categories.forEach(cat => insertCategory.run(...cat));
}

// Seed test users if they don't exist
const testUsers = [
  ['admin-id', 'Admin User', 'admin@eventhub.com', 'admin123', 'admin', null, 1],
  ['host-id', 'Host User', 'host@eventhub.com', 'host123', 'host', 'Event Masters', 1],
  ['student-id', 'Student User', 'student@eventhub.com', 'student123', 'student', null, 0]
];

const checkUser = db.prepare('SELECT id FROM users WHERE email = ?');
const insertUser = db.prepare('INSERT INTO users (id, name, email, password, role, host_org_name, host_verified) VALUES (?, ?, ?, ?, ?, ?, ?)');

testUsers.forEach(user => {
  const existing = checkUser.get(user[2]);
  if (!existing) {
    insertUser.run(...user);
  }
});

// Clear user-generated data for a clean testing environment
db.exec(`
  DELETE FROM bookings;
  DELETE FROM reviews;
  DELETE FROM discussions;
  DELETE FROM ticket_types;
  DELETE FROM events;
  DELETE FROM faqs;
  DELETE FROM reports;
  DELETE FROM users WHERE email NOT IN ('admin@eventhub.com', 'host@eventhub.com', 'student@eventhub.com');
`);

// Seed sample events
const eventCount = db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
if (eventCount.count === 0) {
  const insertEvent = db.prepare(`
    INSERT INTO events (id, host_id, name, description, date, venue, category_id, image, status, featured, total_seats, available_seats)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTicket = db.prepare(`
    INSERT INTO ticket_types (id, event_id, name, price, quantity, sold)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertFaq = db.prepare(`
    INSERT INTO faqs (id, event_id, question, answer)
    VALUES (?, ?, ?, ?)
  `);

  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const nextYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const sampleEvents = [
    ['e1', 'host-id', 'Global Tech Summit 2026', 'Join industry leaders for the biggest tech event of the year.', nextWeek, 'Innovation Center, Silicon Valley', '1', 'https://images.unsplash.com/photo-1540575861501-7ad05823c9f5?auto=format&fit=crop&q=80', 'approved', 1, 500, 500],
    ['e2', 'host-id', 'Neon Nights Music Festival', 'Experience the best electronic music under the stars.', nextMonth, 'Starlight Arena, Los Angeles', '2', 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&q=80', 'approved', 0, 1000, 1000],
    ['e3', 'host-id', 'Startup Pitch Night', 'Watch emerging startups compete for funding and mentorship.', nextWeek, 'Business Hub, New York', '5', 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&q=80', 'pending', 0, 100, 100],
    ['e4', 'host-id', 'International Food Expo', 'Taste cuisines from around the world in one place.', nextMonth, 'Expo Center, Chicago', '6', 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&q=80', 'approved', 1, 300, 300],
    ['e5', 'host-id', 'Future of AI Workshop', 'Hands-on workshop on the latest AI technologies.', nextWeek, 'Tech Lab, Boston', '1', 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80', 'approved', 0, 50, 50],
    ['e6', 'host-id', 'Modern Art Exhibition', 'Explore contemporary masterpieces from local artists.', nextMonth, 'City Gallery, San Francisco', '4', 'https://images.unsplash.com/photo-1547826039-bfc35e0f1ea8?auto=format&fit=crop&q=80', 'approved', 0, 200, 200],
    ['e7', 'host-id', 'Championship Finals', 'The ultimate showdown in college basketball.', nextYear, 'Grand Stadium, Houston', '3', 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?auto=format&fit=crop&q=80', 'approved', 1, 5000, 5000]
  ];

  sampleEvents.forEach(event => {
    insertEvent.run(...event);
    // Add default ticket types for each event
    insertTicket.run(`t-${event[0]}-1`, event[0], 'General Admission', 49.99, (event[10] as number) * 0.8, 0);
    insertTicket.run(`t-${event[0]}-2`, event[0], 'VIP Experience', 149.99, (event[10] as number) * 0.2, 0);
    
    // Add some FAQs
    insertFaq.run(`f-${event[0]}-1`, event[0], 'Is there parking available?', 'Yes, free parking is available on-site.');
    insertFaq.run(`f-${event[0]}-2`, event[0], 'Can I get a refund?', 'Refunds are available up to 48 hours before the event.');
  });
}

export default db;
