import express from 'express';
import { createServer as createViteServer } from 'vite';
import db from './db.ts';
import { v4 as uuidv4 } from 'uuid';
import QRCode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

async function startServer() {
  const app = express();
  const PORT = 3000;
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  // WebSocket connection handling
  const clients = new Map<string, Set<WebSocket>>();

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const communityId = url.searchParams.get('communityId');
    const userId = url.searchParams.get('userId');

    if (communityId && userId) {
      if (!clients.has(communityId)) {
        clients.set(communityId, new Set());
      }
      clients.get(communityId)!.add(ws);

      ws.on('close', () => {
        clients.get(communityId)?.delete(ws);
        if (clients.get(communityId)?.size === 0) {
          clients.delete(communityId);
        }
      });
    }
  });

  app.use(express.json());
  app.use('/uploads', express.static(uploadDir));

  // API Routes
  
  // Auth
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    if (user && user.password === password) {
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });

  app.post('/api/auth/register', (req, res) => {
    const { name, email, password, role, host_org_name } = req.body;
    const id = uuidv4();
    try {
      db.prepare('INSERT INTO users (id, name, email, password, role, host_org_name) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, name, email, password, role, host_org_name);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (e) {
      res.status(400).json({ error: 'Email already exists' });
    }
  });

  app.post('/api/auth/profile', (req, res) => {
    const { id, name, bio } = req.body;
    try {
      db.prepare('UPDATE users SET name = ?, bio = ? WHERE id = ?').run(name, bio, id);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (e) {
      res.status(400).json({ error: 'Failed to update profile' });
    }
  });

  // Events
  app.get('/api/events', (req, res) => {
    const { category, venue, startDate, endDate } = req.query;
    let query = `
      SELECT e.*, c.name as category_name, u.name as host_name 
      FROM events e 
      JOIN categories c ON e.category_id = c.id 
      JOIN users u ON e.host_id = u.id
      WHERE e.status = 'approved'
    `;
    const params: any[] = [];

    if (category) {
      query += ` AND e.category_id = ?`;
      params.push(category);
    }
    if (venue) {
      query += ` AND e.venue LIKE ?`;
      params.push(`%${venue}%`);
    }
    if (startDate) {
      query += ` AND e.date >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND e.date <= ?`;
      params.push(endDate);
    }

    query += ` ORDER BY e.date ASC`;

    const events = db.prepare(query).all(...params);
    res.json(events);
  });

  app.get('/api/events/:id', (req, res) => {
    const event = db.prepare(`
      SELECT e.*, c.name as category_name, u.name as host_name 
      FROM events e 
      JOIN categories c ON e.category_id = c.id 
      JOIN users u ON e.host_id = u.id
      WHERE e.id = ?
    `).get(req.params.id) as any;
    
    if (event) {
      const ticketTypes = db.prepare('SELECT * FROM ticket_types WHERE event_id = ?').all(req.params.id);
      const reviews = db.prepare(`
        SELECT r.*, u.name as user_name 
        FROM reviews r 
        JOIN users u ON r.user_id = u.id 
        WHERE r.event_id = ?
      `).all(req.params.id);
      const faqs = db.prepare('SELECT * FROM faqs WHERE event_id = ?').all(req.params.id);
      res.json({ ...event, ticketTypes, reviews, faqs });
    } else {
      res.status(404).json({ error: 'Event not found' });
    }
  });

  app.post('/api/events', upload.single('image'), (req, res) => {
    const { host_id, name, description, date, venue, category_id, total_seats, ticketTypes, faqs } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : null;
    const id = uuidv4();
    const seats = parseInt(total_seats) || 0;
    
    try {
      db.transaction(() => {
        db.prepare('INSERT INTO events (id, host_id, name, description, date, venue, category_id, total_seats, available_seats, status, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id, host_id, name, description, date, venue, category_id, seats, seats, 'pending', image);
        
        if (ticketTypes) {
          const parsedTicketTypes = JSON.parse(ticketTypes);
          const insertTicket = db.prepare('INSERT INTO ticket_types (id, event_id, name, price, quantity) VALUES (?, ?, ?, ?, ?)');
          parsedTicketTypes.forEach((tt: any) => {
            insertTicket.run(uuidv4(), id, tt.name, tt.price, tt.quantity);
          });
        }

        if (faqs) {
          const parsedFaqs = JSON.parse(faqs);
          const insertFaq = db.prepare('INSERT INTO faqs (id, event_id, question, answer) VALUES (?, ?, ?, ?)');
          parsedFaqs.forEach((f: any) => {
            insertFaq.run(uuidv4(), id, f.question, f.answer);
          });
        }
      })();
      res.json({ id });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to create event' });
    }
  });

  // Reviews
  app.post('/api/reviews', (req, res) => {
    const { user_id, event_id, rating, comment } = req.body;
    const id = uuidv4();
    try {
      db.prepare('INSERT INTO reviews (id, user_id, event_id, rating, comment) VALUES (?, ?, ?, ?, ?)')
        .run(id, user_id, event_id, rating, comment);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: 'You have already reviewed this event' });
    }
  });

  // Reports
  app.post('/api/reports', (req, res) => {
    const { user_id, event_id, reason } = req.body;
    const id = uuidv4();
    try {
      db.prepare('INSERT INTO reports (id, user_id, event_id, reason) VALUES (?, ?, ?, ?)')
        .run(id, user_id, event_id, reason);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to submit report' });
    }
  });

  // Admin Routes
  app.get('/api/admin/events/pending', (req, res) => {
    const events = db.prepare(`
      SELECT e.*, c.name as category_name, u.name as host_name 
      FROM events e 
      JOIN categories c ON e.category_id = c.id 
      JOIN users u ON e.host_id = u.id
      WHERE e.status = 'pending'
    `).all();
    res.json(events);
  });

  app.post('/api/admin/events/:id/approve', (req, res) => {
    db.prepare("UPDATE events SET status = 'approved' WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.post('/api/admin/events/:id/reject', (req, res) => {
    db.prepare("UPDATE events SET status = 'rejected' WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.delete('/api/admin/events/:id', (req, res) => {
    try {
      db.transaction(() => {
        db.prepare('DELETE FROM ticket_types WHERE event_id = ?').run(req.params.id);
        db.prepare('DELETE FROM bookings WHERE event_id = ?').run(req.params.id);
        db.prepare('DELETE FROM reviews WHERE event_id = ?').run(req.params.id);
        db.prepare('DELETE FROM faqs WHERE event_id = ?').run(req.params.id);
        db.prepare('DELETE FROM reports WHERE event_id = ?').run(req.params.id);
        db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
      })();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to delete event' });
    }
  });

  app.get('/api/admin/reports', (req, res) => {
    const reports = db.prepare(`
      SELECT r.*, u.name as user_name, e.name as event_name 
      FROM reports r 
      JOIN users u ON r.user_id = u.id 
      JOIN events e ON r.event_id = e.id
      WHERE r.status = 'pending'
    `).all();
    res.json(reports);
  });

  app.post('/api/admin/reports/:id/approve', (req, res) => {
    try {
      db.transaction(() => {
        const report = db.prepare('SELECT event_id FROM reports WHERE id = ?').get(req.params.id) as any;
        db.prepare("UPDATE reports SET status = 'approved' WHERE id = ?").run(req.params.id);
        // If report approved, we might want to hide or delete the event. Let's set it to rejected.
        db.prepare("UPDATE events SET status = 'rejected' WHERE id = ?").run(report.event_id);
      })();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to approve report' });
    }
  });

  app.post('/api/admin/reports/:id/dismiss', (req, res) => {
    db.prepare("UPDATE reports SET status = 'dismissed' WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Host Event Status Update
  app.post('/api/host/events/:id/status', (req, res) => {
    const { status, host_id } = req.body;
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as any;
    
    if (!event || event.host_id !== host_id) {
      return res.status(403).json({ error: 'Unauthorized to update this event' });
    }

    if (!['completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status update' });
    }

    db.prepare("UPDATE events SET status = ? WHERE id = ?").run(status, req.params.id);
    res.json({ success: true });
  });

  // Bookings
  app.post('/api/bookings', async (req, res) => {
    const { user_id, event_id, ticket_type_id, quantity } = req.body;
    const id = uuidv4();
    const booking_ref = `EVT-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    
    const ticketType = db.prepare('SELECT * FROM ticket_types WHERE id = ?').get(ticket_type_id) as any;
    const totalPrice = ticketType.price * quantity;
    
    const qrCode = await QRCode.toDataURL(booking_ref);

    db.transaction(() => {
      db.prepare('INSERT INTO bookings (id, booking_ref, user_id, event_id, ticket_type_id, quantity, total_price, qr_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, booking_ref, user_id, event_id, ticket_type_id, quantity, totalPrice, qrCode);
      
      db.prepare('UPDATE ticket_types SET sold = sold + ? WHERE id = ?').run(quantity, ticket_type_id);
      db.prepare('UPDATE events SET available_seats = available_seats - ? WHERE id = ?').run(quantity, event_id);
    })();

    res.json({ id, booking_ref, qrCode });
  });

  app.get('/api/bookings/user/:userId', (req, res) => {
    const bookings = db.prepare(`
      SELECT b.*, e.name as event_name, e.date as event_date, e.venue, tt.name as ticket_type_name
      FROM bookings b
      JOIN events e ON b.event_id = e.id
      JOIN ticket_types tt ON b.ticket_type_id = tt.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
    `).all(req.params.userId);
    res.json(bookings);
  });

  // Categories
  app.get('/api/categories', (req, res) => {
    const categories = db.prepare(`
      SELECT c.*, COUNT(e.id) as event_count
      FROM categories c
      LEFT JOIN events e ON c.id = e.category_id AND e.status = 'approved'
      GROUP BY c.id
    `).all();
    res.json(categories);
  });

  // Followers
  app.post('/api/users/:id/follow', (req, res) => {
    const { followerId } = req.body;
    const followingId = req.params.id;
    try {
      db.prepare('INSERT INTO followers (follower_id, following_id) VALUES (?, ?)').run(followerId, followingId);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: 'Already following or user not found' });
    }
  });

  app.delete('/api/users/:id/follow', (req, res) => {
    const { followerId } = req.body;
    const followingId = req.params.id;
    db.prepare('DELETE FROM followers WHERE follower_id = ? AND following_id = ?').run(followerId, followingId);
    res.json({ success: true });
  });

  app.get('/api/users/:id/followers', (req, res) => {
    const followers = db.prepare(`
      SELECT u.id, u.name, u.avatar, u.role
      FROM users u
      JOIN followers f ON u.id = f.follower_id
      WHERE f.following_id = ?
    `).all(req.params.id);
    res.json(followers);
  });

  app.get('/api/users/:id/following', (req, res) => {
    const following = db.prepare(`
      SELECT u.id, u.name, u.avatar, u.role
      FROM users u
      JOIN followers f ON u.id = f.following_id
      WHERE f.follower_id = ?
    `).all(req.params.id);
    res.json(following);
  });

  // Communities
  app.get('/api/communities', (req, res) => {
    const communities = db.prepare(`
      SELECT c.*, u.name as creator_name, (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count
      FROM communities c
      JOIN users u ON c.creator_id = u.id
    `).all();
    res.json(communities);
  });

  app.post('/api/communities', (req, res) => {
    const { name, description, image, creatorId } = req.body;
    const id = uuidv4();
    db.prepare('INSERT INTO communities (id, name, description, image, creator_id) VALUES (?, ?, ?, ?, ?)').run(id, name, description, image, creatorId);
    // Creator automatically joins as admin
    db.prepare('INSERT INTO community_members (community_id, user_id, role) VALUES (?, ?, ?)').run(id, creatorId, 'admin');
    res.json({ id, name });
  });

  app.get('/api/communities/:id', (req, res) => {
    const community = db.prepare(`
      SELECT c.*, u.name as creator_name, (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count
      FROM communities c
      JOIN users u ON c.creator_id = u.id
      WHERE c.id = ?
    `).get(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    res.json(community);
  });

  app.post('/api/communities/:id/join', (req, res) => {
    const { userId } = req.body;
    const communityId = req.params.id;
    try {
      db.prepare('INSERT INTO community_members (community_id, user_id) VALUES (?, ?)').run(communityId, userId);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: 'Already a member' });
    }
  });

  app.delete('/api/communities/:id/leave', (req, res) => {
    const { userId } = req.body;
    const communityId = req.params.id;
    db.prepare('DELETE FROM community_members WHERE community_id = ? AND user_id = ?').run(communityId, userId);
    res.json({ success: true });
  });

  app.get('/api/communities/:id/posts', (req, res) => {
    const posts = db.prepare(`
      SELECT p.*, u.name as user_name, u.avatar as user_avatar
      FROM community_posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.community_id = ?
      ORDER BY p.created_at DESC
    `).all(req.params.id);
    res.json(posts);
  });

  app.post('/api/communities/:id/posts', (req, res) => {
    const { userId, content, image } = req.body;
    const communityId = req.params.id;
    const id = uuidv4();
    db.prepare('INSERT INTO community_posts (id, community_id, user_id, content, image) VALUES (?, ?, ?, ?, ?)').run(id, communityId, userId, content, image);
    res.json({ id, content });
  });

  app.get('/api/communities/:id/members', (req, res) => {
    const members = db.prepare(`
      SELECT u.id, u.name, u.avatar, cm.role
      FROM users u
      JOIN community_members cm ON u.id = cm.user_id
      WHERE cm.community_id = ?
    `).all(req.params.id);
    res.json(members);
  });

  app.get('/api/communities/:id/messages', (req, res) => {
    const messages = db.prepare(`
      SELECT m.*, u.name as user_name, u.avatar as user_avatar
      FROM community_messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.community_id = ?
      ORDER BY m.created_at ASC
    `).all(req.params.id);
    res.json(messages);
  });

  app.post('/api/communities/:id/messages', (req, res) => {
    const { userId, message } = req.body;
    const communityId = req.params.id;
    const id = uuidv4();
    db.prepare('INSERT INTO community_messages (id, community_id, user_id, message) VALUES (?, ?, ?, ?)').run(id, communityId, userId, message);
    
    const fullMessage = db.prepare(`
      SELECT m.*, u.name as user_name, u.avatar as user_avatar
      FROM community_messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.id = ?
    `).get(id);

    // Broadcast to WebSocket clients
    const communityClients = clients.get(communityId);
    if (communityClients) {
      const payload = JSON.stringify({ type: 'new_message', data: fullMessage });
      communityClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      });
    }

    res.json(fullMessage);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
