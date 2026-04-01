import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { 
  Calendar, 
  MapPin, 
  Search, 
  User, 
  Ticket, 
  Plus, 
  LayoutDashboard, 
  LogOut, 
  Menu, 
  X,
  ChevronRight,
  Star,
  MessageSquare,
  TrendingUp,
  Award,
  Clock,
  Filter,
  Image as ImageIcon,
  CheckCircle,
  XCircle,
  ShieldCheck,
  Edit3,
  ArrowRight,
  Send,
  Sun,
  Moon,
  Upload,
  Bell,
  Heart,
  Share2,
  Copy,
  ScanLine,
  Building2,
  Handshake,
  Gavel,
  AlertTriangle,
  Wifi
} from 'lucide-react';
import { motion, AnimatePresence, useScroll, useTransform, useSpring } from 'motion/react';
import {
  User as UserType,
  Event as EventType,
  Category,
  Booking,
  TicketType,
  Community,
  CommunityMember,
  CommunityPost,
  CommunityMessage,
  Discussion,
  Notification,
  AnalyticsSummary,
  Sponsor,
  SponsorSpot,
  Bid,
  EventAnalyticsSnapshot,
  SponsorshipRequest,
  Deal,
  DealMessage,
  TicketRecord,
} from './types';
import { Html5Qrcode } from 'html5-qrcode';
import { LineChart, Line, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { fetchPendingSponsorshipCount } from './features/sponsorship/api';

const getAuthToken = () => localStorage.getItem('authToken');

const withAuth = (init: RequestInit = {}) => {
  const headers = new Headers(init.headers || {});
  const token = getAuthToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return { ...init, headers };
};

const emitSponsorshipSync = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('sponsorship:sync'));
  }
};

const createUserSocket = (userId: string) => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return new WebSocket(`${protocol}//${window.location.host}?userId=${userId}`);
};

// --- Theme Context ---
const ThemeContext = React.createContext({
  theme: 'dark',
  toggleTheme: () => {}
});

const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

// --- Components ---

const Skeleton = ({ className }: { className?: string }) => (
  <div className={`animate-pulse bg-zinc-200 dark:bg-zinc-800 rounded-xl ${className}`} />
);

const ReviewForm = ({ eventId, userId, onReviewAdded }: { eventId: string, userId: string, onReviewAdded: () => void }) => {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, event_id: eventId, rating, comment })
    });
    if (res.ok) {
      setComment('');
      setRating(5);
      onReviewAdded();
    } else {
      const data = await res.json();
      setError(data.error);
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-4">
        <span className="micro-label">Rating</span>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map(star => (
            <button 
              key={star} 
              type="button"
              onClick={() => setRating(star)}
              className="p-1 transition-transform hover:scale-125"
            >
              <Star className={`w-6 h-6 ${star <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-white/10'}`} />
            </button>
          ))}
        </div>
      </div>
      <textarea 
        required
        placeholder="Share your experience..."
        className="input-luxury py-4 px-6 min-h-30 resize-none"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      {error && <p className="text-rose-500 text-xs font-bold uppercase tracking-widest">{error}</p>}
      <button type="submit" disabled={loading} className="btn-luxury px-10 py-3 text-sm">
        {loading ? 'Posting...' : 'Post Review'}
      </button>
    </form>
  );
};

const ReportButton = ({ eventId, userId }: { eventId: string, userId: string }) => {
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, event_id: eventId, reason })
    });
    if (res.ok) {
      setSuccess(true);
      setTimeout(() => {
        setShowModal(false);
        setSuccess(false);
        setReason('');
      }, 2000);
    }
    setLoading(false);
  };

  return (
    <>
      <button 
        onClick={() => setShowModal(true)}
        className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-widest hover:text-rose-500 transition-colors flex items-center gap-2"
      >
        <ShieldCheck className="w-4 h-4" /> Report this event
      </button>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg glass p-10 rounded-[3rem] border border-(--line-color) shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-display font-bold text-2xl uppercase tracking-tight">Report Event</h3>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {success ? (
                <div className="text-center py-10">
                  <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/20">
                    <CheckCircle className="w-8 h-8 text-emerald-500" />
                  </div>
                  <p className="text-emerald-500 font-bold uppercase tracking-widest text-sm">Report submitted successfully</p>
                </div>
              ) : (
                <form onSubmit={handleReport} className="space-y-8">
                  <p className="text-(--text-secondary) text-sm leading-relaxed">Please provide a reason for reporting this event. Our team will review it shortly.</p>
                  <textarea 
                    required
                    placeholder="Why are you reporting this event?"
                    className="input-luxury py-4 px-6 min-h-37.5 resize-none"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <button type="submit" disabled={loading} className="btn-luxury w-full py-4 bg-rose-500 hover:bg-rose-600 border-rose-500/20">
                    {loading ? 'Submitting...' : 'Submit Report'}
                  </button>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

const Navbar = ({ user, onLogout }: { user: UserType | null, onLogout: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pendingSponsorshipRequests, setPendingSponsorshipRequests] = useState(0);
  const { theme, toggleTheme } = React.useContext(ThemeContext);
  const location = useLocation();

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setPendingSponsorshipRequests(0);
      return;
    }

    const fetchNotifications = async () => {
      const res = await fetch('/api/notifications', withAuth());
      if (res.ok) {
        const payload = await res.json();
        setNotifications(Array.isArray(payload?.notifications) ? payload.notifications : []);
      }
    };

    const fetchPendingRequests = async () => {
      if (!['sponsor', 'host', 'admin'].includes(user.role)) {
        setPendingSponsorshipRequests(0);
        return;
      }
      const count = await fetchPendingSponsorshipCount(withAuth, 'incoming');
      setPendingSponsorshipRequests(count);
    };

    fetchNotifications();
    fetchPendingRequests();

    const syncHandler = () => {
      fetchPendingRequests();
    };
    window.addEventListener('sponsorship:sync', syncHandler);

    const socket = createUserSocket(user.id);
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === 'notification' && payload.data) {
        setNotifications((prev) => [payload.data, ...prev]);
      }
    };

    return () => {
      window.removeEventListener('sponsorship:sync', syncHandler);
      socket.close();
    };
  }, [user]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markRead = async (notificationId: string) => {
    await fetch(`/api/notifications/${notificationId}/read`, withAuth({ method: 'PATCH' }));
    setNotifications((prev) => prev.map((n) => (n.id === notificationId ? { ...n, is_read: 1 } : n)));
  };

  const markAllRead = async () => {
    if (!user) return;
    await fetch('/api/notifications/read-all', withAuth({ method: 'POST' }));
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
  };

  const navLinks = [
    { name: 'Events', path: '/events', icon: Calendar },
    { name: 'Categories', path: '/categories', icon: TrendingUp },
    { name: 'Communities', path: '/communities', icon: MessageSquare },
  ] as Array<{ name: string; path: string; icon: any; badge?: number }>;

  if (user) {
    navLinks.push({ name: 'My Bookings', path: '/my-bookings', icon: Ticket });
    navLinks.push({ name: 'Wishlist', path: '/wishlist', icon: Heart });
    if (user.role === 'sponsor' || user.role === 'host' || user.role === 'admin') {
      navLinks.push({ name: 'Sponsorship Requests', path: '/sponsorship/requests', icon: Handshake, badge: pendingSponsorshipRequests });
    }
    if (user.role === 'sponsor') {
      navLinks.push({ name: 'Sponsor Hub', path: '/sponsor/dashboard', icon: Handshake });
    }
    if (user.role === 'host') {
      navLinks.push({ name: 'Host Dashboard', path: '/host/dashboard', icon: LayoutDashboard });
      navLinks.push({ name: 'Analytics', path: '/host/analytics', icon: TrendingUp });
      navLinks.push({ name: 'Scanner', path: '/host/scanner', icon: ScanLine });
    }
    if (user.role === 'admin') {
      navLinks.push({ name: 'Admin Panel', path: '/admin/dashboard', icon: ShieldCheck });
      navLinks.push({ name: 'Sponsorship Admin', path: '/admin/sponsorship', icon: Building2 });
      navLinks.push({ name: 'Scanner', path: '/host/scanner', icon: ScanLine });
    }
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-(--line-color)">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="flex items-center justify-between h-24 gap-6">
          <Link to="/" className="flex items-center gap-4 group shrink-0">
            <div className="w-12 h-12 bg-(--text-primary) rounded-full flex items-center justify-center shadow-2xl group-hover:scale-110 transition-all duration-500">
              <Ticket className="text-(--bg-color) w-6 h-6" />
            </div>
            <span className="font-display font-black text-2xl uppercase tracking-tighter">EventHub</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden xl:flex flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex items-center gap-8 w-max pr-4">
              {navLinks.map((link) => (
                <Link 
                  key={link.path} 
                  to={link.path}
                  className={`micro-label whitespace-nowrap transition-all hover:opacity-100 ${location.pathname === link.path ? 'opacity-100 text-brand-500' : 'opacity-50'} flex items-center gap-2`}
                >
                  {link.name}
                  {link.badge && link.badge > 0 && (
                    <span className="min-w-4 h-4 px-1 rounded-full bg-brand-500 text-black text-[9px] font-bold flex items-center justify-center">
                      {link.badge > 9 ? '9+' : link.badge}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>

          <div className="hidden xl:flex items-center gap-8 shrink-0">
            <button 
              onClick={toggleTheme}
              className="p-2 text-(--text-secondary) hover:text-(--text-primary) transition-all"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            {user ? (
              <div className="flex items-center gap-6">
                <div className="relative">
                  <button
                    onClick={() => setShowNotifications((v) => !v)}
                    className="relative p-2 text-(--text-secondary) hover:text-(--text-primary) transition-all"
                  >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>
                  {showNotifications && (
                    <div className="absolute right-0 mt-4 w-96 max-h-104 overflow-y-auto glass border border-(--line-color) rounded-2xl p-4 z-50">
                      <div className="flex items-center justify-between mb-4">
                        <div className="font-display font-bold text-lg uppercase tracking-tight">Notifications</div>
                        <button onClick={markAllRead} className="text-[10px] font-bold uppercase tracking-widest text-brand-500 hover:underline">
                          Mark all read
                        </button>
                      </div>
                      <div className="space-y-3">
                        {notifications.length ? notifications.map((n) => (
                          <button
                            key={n.id}
                            onClick={() => markRead(n.id)}
                            className={`w-full text-left p-3 rounded-xl border transition-all ${n.is_read ? 'border-white/5 bg-white/5' : 'border-brand-500/30 bg-brand-500/10'}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-bold">{n.title}</div>
                              {!n.is_read && <span className="w-2 h-2 rounded-full bg-brand-500" />}
                            </div>
                            <div className="text-xs text-(--text-secondary) mt-1">{n.message}</div>
                          </button>
                        )) : (
                          <div className="text-xs text-(--text-secondary)">No notifications yet.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <Link to="/profile" className="flex items-center gap-3 group">
                  <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:border-brand-500 transition-all">
                    <User className="w-4 h-4 text-(--text-secondary) group-hover:text-brand-500" />
                  </div>
                  <span className="text-xs font-bold tracking-tight uppercase opacity-80">{user.name}</span>
                </Link>
                <button 
                  onClick={onLogout}
                  className="text-(--text-secondary) hover:text-rose-500 transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-8">
                <Link to="/login" className="micro-label hover:opacity-100">Login</Link>
                <Link to="/register" className="btn-luxury text-sm">Join Now</Link>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="xl:hidden">
            <button onClick={() => setIsOpen(!isOpen)} className="p-3 text-zinc-400 glass rounded-xl">
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm xl:hidden"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-sm bg-zinc-950 border-l border-white/10 z-50 xl:hidden p-8 flex flex-col"
            >
              <div className="flex items-center justify-between mb-12">
                <span className="font-display font-bold text-2xl">Menu</span>
                <button onClick={() => setIsOpen(false)} className="p-2 text-zinc-500">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4 flex-1">
                {navLinks.map((link) => (
                  <Link 
                    key={link.path} 
                    to={link.path}
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center gap-4 px-4 py-4 rounded-2xl text-lg font-bold transition-all ${location.pathname === link.path ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20' : 'text-zinc-400 hover:bg-white/5'}`}
                  >
                    <link.icon className="w-6 h-6" />
                    <span className="flex-1">{link.name}</span>
                    {link.badge && link.badge > 0 && (
                      <span className="min-w-6 h-6 px-1 rounded-full bg-brand-500 text-black text-[10px] font-bold flex items-center justify-center">
                        {link.badge > 9 ? '9+' : link.badge}
                      </span>
                    )}
                  </Link>
                ))}
              </div>

              <div className="pt-8 border-t border-white/10">
                {user ? (
                  <div className="space-y-4">
                    <Link 
                      to="/profile" 
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-4 px-4 py-4 rounded-2xl bg-white/5 border border-white/10"
                    >
                      <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center">
                        <User className="w-5 h-5 text-brand-500" />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold">{user.name}</div>
                        <div className="text-xs text-zinc-500 capitalize">{user.role}</div>
                      </div>
                    </Link>
                    <button 
                      onClick={() => { onLogout(); setIsOpen(false); }}
                      className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-rose-500 font-bold hover:bg-rose-500/10 transition-all"
                    >
                      <LogOut className="w-6 h-6" />
                      Logout
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    <Link to="/login" onClick={() => setIsOpen(false)} className="btn-secondary text-center">Login</Link>
                    <Link to="/register" onClick={() => setIsOpen(false)} className="btn-primary text-center">Sign Up</Link>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </nav>
  );
};

const EventCard = ({ event }: { event: EventType }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    className="group"
  >
    <Link to={`/events/${event.id}`} className="block">
      <div className="relative aspect-4/5 rounded-4xl overflow-hidden mb-8 glass-card">
        <motion.img 
          whileHover={{ scale: 1.1 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          src={event.image || `https://picsum.photos/seed/${event.id}/800/1000`} 
          alt={event.name}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-linear-to-t from-black via-transparent to-transparent opacity-80" />
        
        <div className="absolute top-6 left-6">
          <span className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-full">
            {event.category_name}
          </span>
        </div>

        <div className="absolute bottom-8 left-8 right-8">
          <div className="micro-label text-white/60 mb-2">
            {new Date(event.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
          <h3 className="font-display font-bold text-2xl text-white leading-tight mb-4 group-hover:text-brand-500 transition-colors">{event.name}</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white/60 text-[10px] font-bold uppercase tracking-widest">
              <MapPin className="w-3 h-3 text-brand-500" />
              <span className="line-clamp-1">{event.venue}</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-brand-500 transition-all">
              <ArrowRight className="w-4 h-4 text-white" />
            </div>
          </div>
        </div>
      </div>
    </Link>
  </motion.div>
);

// --- Pages ---

const Home = ({ user }: { user: UserType | null }) => {
  const [events, setEvents] = useState<EventType[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [recommended, setRecommended] = useState<EventType[]>([]);
  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });
  const y = useTransform(smoothProgress, [0, 1], [0, -300]);
  const opacity = useTransform(smoothProgress, [0, 0.3], [1, 0]);
  const scale = useTransform(smoothProgress, [0, 0.3], [1, 0.9]);

  useEffect(() => {
    fetch('/api/events').then(res => res.json()).then(setEvents);
    fetch('/api/categories').then(res => res.json()).then(setCategories);
    if (user) {
      fetch(`/api/recommendations/user/${user.id}`).then(res => res.json()).then(setRecommended);
    }
  }, [user]);

  return (
    <div className="pt-24 pb-20">
      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center px-6 lg:px-12 py-32 overflow-hidden">
        <motion.div 
          style={{ y, opacity, scale }}
          className="absolute inset-0 -z-10"
        >
          <div className="absolute top-1/4 left-1/4 w-[60vw] h-[60vw] bg-brand-500/10 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-[50vw] h-[50vw] bg-rose-500/5 rounded-full blur-[120px] animate-pulse delay-1000" />
        </motion.div>

        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="micro-label mb-12 flex items-center justify-center gap-4">
              <span className="w-12 h-px bg-(--line-color)" />
              The Premier Campus Experience
              <span className="w-12 h-px bg-(--line-color)" />
            </div>
            <h1 className="editorial-title mb-12">
              Live the <br />
              <span className="italic font-serif normal-case font-normal text-brand-500">Moment</span>
            </h1>
            <p className="text-(--text-secondary) text-lg md:text-xl max-w-2xl mx-auto mb-16 leading-relaxed">
              Discover curated events, underground gigs, and tech summits. 
              Your gateway to the most exclusive campus experiences.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-8">
              <Link to="/events" className="btn-luxury px-12 py-5 text-lg group">
                Explore Events <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link to="/register?role=host" className="btn-outline-luxury px-12 py-5 text-lg">
                Host an Event
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-6 lg:px-12 mb-48">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-24">
          <div>
            <div className="micro-label mb-4">Curated Vibes</div>
            <h2 className="font-display font-bold text-5xl md:text-7xl tracking-tighter uppercase">Browse by <span className="italic font-serif normal-case font-normal">Mood</span></h2>
          </div>
          <Link to="/categories" className="btn-outline-luxury py-2 px-6 text-xs uppercase tracking-widest">All Categories</Link>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {categories.map((cat, i) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <Link to={`/events?category=${cat.id}`} className="group relative aspect-square rounded-4xl overflow-hidden glass-card flex flex-col items-center justify-center p-8">
                <div className="text-5xl mb-6 group-hover:scale-110 transition-transform duration-500">{cat.icon}</div>
                <div className="font-display font-bold text-lg uppercase tracking-tight">{cat.name}</div>
                <div className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-widest mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {cat.event_count || 0} Events
                </div>
                <div className="absolute bottom-6 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowRight className="w-5 h-5 text-brand-500" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Featured Events */}
      <section className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-24">
          <div>
            <div className="micro-label mb-4">Trending Now</div>
            <h2 className="font-display font-bold text-5xl md:text-7xl tracking-tighter uppercase">The <span className="italic font-serif normal-case font-normal">Spotlight</span></h2>
          </div>
          <Link to="/events" className="btn-outline-luxury py-2 px-6 text-xs uppercase tracking-widest">View All Events</Link>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {events.slice(0, 6).map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      </section>

      {user && recommended.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 lg:px-12 mt-32">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
            <div>
              <div className="micro-label mb-4">Personalized</div>
              <h2 className="font-display font-bold text-4xl md:text-6xl tracking-tighter uppercase">Recommended <span className="italic font-serif normal-case font-normal">For You</span></h2>
            </div>
            <Link to="/events" className="btn-outline-luxury py-2 px-6 text-xs uppercase tracking-widest">Explore More</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {recommended.slice(0, 6).map((event) => (
              <EventCard key={`rec-${event.id}`} event={event} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

const Events = ({ user }: { user: UserType | null }) => {
  const [events, setEvents] = useState<EventType[]>([]);
  const [search, setSearch] = useState('');
  const [autocomplete, setAutocomplete] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [venue, setVenue] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [recommended, setRecommended] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const categoryId = queryParams.get('category');

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      if (search.trim()) {
        const res = await fetch(`/api/search?q=${encodeURIComponent(search.trim())}`);
        const data = await res.json();
        setEvents(Array.isArray(data) ? data : []);
      } else {
        const params = new URLSearchParams();
        if (categoryId) params.append('category', categoryId);
        if (venue) params.append('venue', venue);
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);

        const res = await fetch(`/api/events?${params.toString()}`);
        const data = await res.json();
        setEvents(Array.isArray(data) ? data : []);
      }

      if (user) {
        const recRes = await fetch(`/api/recommendations/user/${user.id}`);
        const recData = await recRes.json();
        setRecommended(Array.isArray(recData) ? recData : []);
      }

      setLoading(false);
    };
    fetchEvents();
  }, [categoryId, venue, startDate, endDate, search, user]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!search.trim()) {
        setAutocomplete([]);
        return;
      }
      const res = await fetch(`/api/search/autocomplete?q=${encodeURIComponent(search.trim())}`);
      if (res.ok) {
        setAutocomplete(await res.json());
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div className="pt-40 pb-32 max-w-7xl mx-auto px-6 lg:px-12">
      <div className="mb-24">
        <div className="micro-label mb-6">Discovery</div>
        <h1 className="editorial-title mb-16">Find Your <span className="italic font-serif normal-case font-normal text-brand-500">Vibe</span></h1>
        <div className="flex items-center gap-3 mb-8">
          <Link to="/events" className="btn-outline-luxury py-2 px-4 text-xs">All Events</Link>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-2 relative group">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-(--text-secondary) group-focus-within:text-brand-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Search events, descriptions, venues..." 
              className="input-luxury pl-16 py-5 text-lg"
              value={search}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
              onChange={(e) => setSearch(e.target.value)}
            />
            {showSuggestions && autocomplete.length > 0 && (
              <div className="absolute z-40 mt-2 w-full glass border border-(--line-color) rounded-2xl p-2">
                {autocomplete.map((s) => (
                  <button
                    key={s}
                    onMouseDown={() => setSearch(s)}
                    className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/5 text-sm"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative group">
            <MapPin className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-(--text-secondary) group-focus-within:text-brand-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Venue..." 
              className="input-luxury pl-16 py-5 text-lg"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
            />
          </div>
          <div className="flex gap-4">
            <input 
              type="date" 
              className="input-luxury text-sm px-4 py-5"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <input 
              type="date" 
              className="input-luxury text-sm px-4 py-5"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="space-y-8">
              <Skeleton className="aspect-4/5 rounded-4xl" />
              <div className="space-y-4 px-4">
                <Skeleton className="h-10 w-3/4" />
                <Skeleton className="h-6 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : events.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      ) : (
        <div className="text-center py-40 glass rounded-[3rem] border-dashed border-(--line-color)">
          <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-8 border border-white/10">
            <Search className="w-10 h-10 text-(--text-secondary)" />
          </div>
          <h3 className="font-display font-bold text-3xl mb-4 uppercase tracking-tight">No vibes found</h3>
          <p className="text-(--text-secondary) max-w-md mx-auto text-lg">We couldn't find any events matching your criteria. Try adjusting your filters.</p>
        </div>
      )}

      {user && recommended.length > 0 && (
        <div className="mt-24">
          <div className="micro-label mb-4">Recommended</div>
          <h2 className="font-display font-bold text-3xl md:text-5xl tracking-tight uppercase mb-10">Recommended For You</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {recommended.slice(0, 6).map((event) => (
              <EventCard key={`reco-list-${event.id}`} event={event} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const UserProfile = ({ user }: { user: UserType | null }) => {
  const { id } = useParams();
  const [profileUser, setProfileUser] = useState<UserType | null>(null);
  const [followers, setFollowers] = useState<UserType[]>([]);
  const [following, setFollowing] = useState<UserType[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      const [userRes, followersRes, followingRes] = await Promise.all([
        fetch(`/api/users/${id}`),
        fetch(`/api/users/${id}/followers`),
        fetch(`/api/users/${id}/following`)
      ]);
      if (userRes.ok) {
        const u = await userRes.json();
        setProfileUser(u);
        const fers = await followersRes.json();
        const fing = await followingRes.json();
        setFollowers(fers);
        setFollowing(fing);
        setIsFollowing(fers.some((f: UserType) => f.id === user?.id));
      }
      setLoading(false);
    };
    fetchProfile();
  }, [id, user]);

  const handleFollow = async () => {
    if (!user) return;
    const method = isFollowing ? 'DELETE' : 'POST';
    const res = await fetch(`/api/users/${id}/follow`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ followerId: user.id })
    });
    if (res.ok) {
      setIsFollowing(!isFollowing);
      const followersRes = await fetch(`/api/users/${id}/followers`);
      setFollowers(await followersRes.json());
    }
  };

  if (loading) return <div className="pt-40 text-center micro-label">Loading Profile...</div>;
  if (!profileUser) return <div className="pt-40 text-center micro-label">User not found</div>;

  return (
    <div className="pt-40 pb-32 max-w-5xl mx-auto px-6 lg:px-12">
      <div className="flex flex-col md:flex-row items-start md:items-center gap-12 mb-24">
        <div className="w-32 h-32 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shadow-2xl overflow-hidden">
          {profileUser.avatar ? <img src={profileUser.avatar} alt={profileUser.name} className="w-full h-full object-cover" /> : <User className="w-16 h-16 text-(--text-secondary)" />}
        </div>
        <div className="flex-1">
          <div className="micro-label mb-4">{profileUser.role} Profile</div>
          <h1 className="font-display font-bold text-5xl md:text-7xl tracking-tighter uppercase mb-6">{profileUser.name}</h1>
          <div className="flex flex-wrap items-center gap-8">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xl">{followers.length}</span>
              <span className="micro-label">Followers</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xl">{following.length}</span>
              <span className="micro-label">Following</span>
            </div>
            {user && user.id !== profileUser.id && (
              <button 
                onClick={handleFollow}
                className={`px-8 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all ${
                  isFollowing 
                  ? 'bg-white/5 text-white border border-white/10 hover:bg-rose-500/10 hover:border-rose-500/20 hover:text-rose-500' 
                  : 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                }`}
              >
                {isFollowing ? 'Unfollow' : 'Follow'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="glass p-12 rounded-[3rem] border border-(--line-color)">
        <h2 className="font-display font-bold text-3xl mb-8 uppercase tracking-tight">About</h2>
        <p className="text-lg text-(--text-secondary) leading-relaxed italic">
          {profileUser.bio || "This user hasn't shared a bio yet."}
        </p>
      </div>
    </div>
  );
};

const Profile = ({ user, onUpdate }: { user: UserType | null, onUpdate: (u: UserType) => void }) => {
  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [referralStats, setReferralStats] = useState<{ referral_code?: string; total_credits?: number; referral_count?: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [followers, setFollowers] = useState<UserType[]>([]);
  const [following, setFollowing] = useState<UserType[]>([]);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const navigate = useNavigate();

  const loadTickets = async (userId: string) => {
    const ticketsRes = await fetch(`/api/tickets/user/${userId}`, withAuth());
    if (ticketsRes.ok) {
      const rows = await ticketsRes.json();
      setTickets(Array.isArray(rows) ? rows : []);
    }
  };

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    const fetchStats = async () => {
      const [fersRes, fingRes, referralRes] = await Promise.all([
        fetch(`/api/users/${user.id}/followers`),
        fetch(`/api/users/${user.id}/following`),
        fetch(`/api/referrals/${user.id}`),
      ]);
      setFollowers(await fersRes.json());
      setFollowing(await fingRes.json());
      if (referralRes.ok) setReferralStats(await referralRes.json());
    };
    fetchStats();
    loadTickets(user.id);

    const socket = createUserSocket(user.id);
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === 'ticket_verified') {
        loadTickets(user.id);
      }
    };

    return () => socket.close();
  }, [user]);

  const attendedTickets = tickets.filter((t) => t.status === 'verified');
  const registeredTickets = tickets.filter((t) => t.status === 'pending');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/auth/profile', withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, bio })
    }));
    if (res.ok) {
      const updatedUser = await res.json();

      if (avatarFile) {
        const form = new FormData();
        form.append('userId', user?.id || '');
        form.append('avatar', avatarFile);
        const avatarRes = await fetch(`/api/users/${user?.id}/avatar`, {
          ...withAuth(),
          method: 'POST',
          body: form,
        });
        if (avatarRes.ok) {
          const avatarUpdated = await avatarRes.json();
          onUpdate(avatarUpdated);
        } else {
          onUpdate(updatedUser);
        }
      } else {
        onUpdate(updatedUser);
      }
      setMessage('Profile updated successfully!');
      setTimeout(() => setMessage(''), 3000);
    }
    setLoading(false);
  };

  if (!user) return null;

  return (
    <div className="pt-40 pb-32 max-w-5xl mx-auto px-6 lg:px-12">
      <div className="flex flex-col md:flex-row items-start md:items-center gap-12 mb-24">
        <div className="w-32 h-32 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shadow-2xl overflow-hidden">
          {user.avatar ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" /> : <User className="w-16 h-16 text-(--text-secondary)" />}
        </div>
        <div className="flex-1">
          <div className="micro-label mb-4">Your Profile</div>
          <h1 className="font-display font-bold text-5xl md:text-7xl tracking-tighter uppercase mb-6">{user.name}</h1>
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xl">{followers.length}</span>
              <span className="micro-label">Followers</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xl">{following.length}</span>
              <span className="micro-label">Following</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-12">
          <div className="glass p-12 rounded-[3rem] border border-(--line-color)">
            <h2 className="font-display font-bold text-3xl mb-8 uppercase tracking-tight">Edit Profile</h2>
            <form onSubmit={handleSubmit} className="space-y-8">
              <div>
                <label className="micro-label mb-3 block">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-brand-500 transition-colors text-lg"
                  required
                />
              </div>
              <div>
                <label className="micro-label mb-3 block">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-brand-500 transition-colors text-lg h-32 resize-none"
                  placeholder="Tell us about yourself..."
                />
              </div>
              <div>
                <label className="micro-label mb-3 block">Profile Picture</label>
                <input
                  type="file"
                  accept="image/*"
                  className="input-luxury"
                  onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-white text-black font-bold uppercase tracking-widest py-5 rounded-2xl hover:bg-brand-500 hover:text-white transition-all disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
              {message && <p className="text-center micro-label text-brand-500">{message}</p>}
            </form>
          </div>

          <div className="glass p-12 rounded-[3rem] border border-(--line-color)">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
              <h2 className="font-display font-bold text-3xl uppercase tracking-tight">Attendance Overview</h2>
              <div className="text-xs uppercase tracking-[0.2em] text-(--text-secondary)">
                {attendedTickets.length} attended / {registeredTickets.length} pending
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6">
                <div className="micro-label mb-4">Attended Events</div>
                {attendedTickets.length ? (
                  <div className="space-y-4">
                    {attendedTickets.slice(0, 6).map((ticket) => (
                      <div key={ticket.id} className="rounded-2xl border border-emerald-500/20 bg-black/20 p-4">
                        <div className="font-bold">{ticket.event_name}</div>
                        <div className="text-xs text-(--text-secondary) mt-1">{ticket.ticket_id}</div>
                        <div className="inline-flex items-center gap-2 mt-3 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase tracking-widest">
                          <CheckCircle className="w-3.5 h-3.5" /> Verified Attendance
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-(--text-secondary)">No attended events yet.</p>
                )}
              </div>

              <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6">
                <div className="micro-label mb-4">Registered Events</div>
                {registeredTickets.length ? (
                  <div className="space-y-4">
                    {registeredTickets.slice(0, 6).map((ticket) => (
                      <div key={ticket.id} className="rounded-2xl border border-amber-500/20 bg-black/20 p-4">
                        <div className="font-bold">{ticket.event_name}</div>
                        <div className="text-xs text-(--text-secondary) mt-1">{ticket.ticket_id}</div>
                        <div className="inline-flex items-center gap-2 mt-3 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase tracking-widest">
                          <Clock className="w-3.5 h-3.5" /> Pending Verification
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-(--text-secondary)">No active registrations.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-12">
          <div className="glass p-8 rounded-4xl border border-(--line-color)">
            <h3 className="micro-label mb-6">Following</h3>
            <div className="space-y-4">
              {following.length > 0 ? following.map(f => (
                <Link key={f.id} to={`/users/${f.id}`} className="flex items-center gap-4 group">
                  <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                    {f.avatar ? <img src={f.avatar} alt={f.name} className="w-full h-full object-cover" /> : <User className="w-5 h-5" />}
                  </div>
                  <span className="text-sm font-medium group-hover:text-brand-500 transition-colors">{f.name}</span>
                </Link>
              )) : (
                <p className="text-xs text-(--text-secondary) italic">Not following anyone yet.</p>
              )}
            </div>
          </div>

          <div className="glass p-8 rounded-4xl border border-(--line-color)">
            <h3 className="micro-label mb-6">Followers</h3>
            <div className="space-y-4">
              {followers.length > 0 ? followers.map(f => (
                <Link key={f.id} to={`/users/${f.id}`} className="flex items-center gap-4 group">
                  <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                    {f.avatar ? <img src={f.avatar} alt={f.name} className="w-full h-full object-cover" /> : <User className="w-5 h-5" />}
                  </div>
                  <span className="text-sm font-medium group-hover:text-brand-500 transition-colors">{f.name}</span>
                </Link>
              )) : (
                <p className="text-xs text-(--text-secondary) italic">No followers yet.</p>
              )}
            </div>
          </div>

          <div className="glass p-8 rounded-4xl border border-(--line-color)">
            <h3 className="micro-label mb-6">Referral Program</h3>
            <div className="space-y-3 text-sm">
              <div>Your code: <span className="font-bold">{referralStats?.referral_code || user.referral_code || 'N/A'}</span></div>
              <div>Total referrals: <span className="font-bold">{referralStats?.referral_count || 0}</span></div>
              <div>Credits earned: <span className="font-bold">${Number(referralStats?.total_credits || 0).toFixed(2)}</span></div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

const EventDetails = ({ user }: { user: UserType | null }) => {
  const { id: eventId } = useParams();
  const [event, setEvent] = useState<EventType | null>(null);
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [discussionMessage, setDiscussionMessage] = useState('');
  const [replyById, setReplyById] = useState<Record<string, string>>({});
  const [referralCode, setReferralCode] = useState('');
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [bookingStatus, setBookingStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`/api/events/${eventId}`).then(res => res.json()).then(setEvent);
    fetch(`/api/events/${eventId}/discussions`).then(res => res.json()).then(setDiscussions);
  }, [eventId]);

  useEffect(() => {
    if (!user || !eventId) return;
    fetch(`/api/wishlist/${user.id}`)
      .then(res => res.json())
      .then((rows) => {
        if (Array.isArray(rows)) {
          setIsWishlisted(rows.some((r: any) => r.event_id === eventId || r.id === eventId));
        }
      });
  }, [user, eventId]);

  const handleBooking = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (!selectedTicket) return;

    setBookingStatus('loading');
    const res = await fetch('/api/bookings', withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.id,
        event_id: eventId,
        ticket_type_id: selectedTicket,
        quantity,
        referral_code: referralCode || null,
      })
    }));
    if (res.ok) {
      setBookingStatus('success');
      setTimeout(() => navigate('/my-bookings'), 2000);
    }
  };

  const getCalendarLink = (e: EventType) => {
    const start = new Date(e.date).toISOString().replace(/-|:|\.\d+/g, '');
    const end = new Date(new Date(e.date).getTime() + 2 * 60 * 60 * 1000).toISOString().replace(/-|:|\.\d+/g, '');
    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.name)}&dates=${start}/${end}&details=${encodeURIComponent(e.description)}&location=${encodeURIComponent(e.venue)}`;
  };

  const getGoogleMapsLink = (e: EventType) => {
    const query = e.venue || e.name;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  };

  const createDiscussion = async (message: string, parentId?: string) => {
    if (!user || !eventId || !message.trim()) return;
    const res = await fetch('/api/discussions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, user_id: user.id, message, parent_id: parentId || null }),
    });
    if (res.ok) {
      const refreshed = await fetch(`/api/events/${eventId}/discussions`);
      if (refreshed.ok) setDiscussions(await refreshed.json());
      setDiscussionMessage('');
      if (parentId) setReplyById((prev) => ({ ...prev, [parentId]: '' }));
    }
  };

  const toggleWishlist = async () => {
    if (!user || !eventId) return;
    if (isWishlisted) {
      await fetch(`/api/wishlist/${eventId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      setIsWishlisted(false);
    } else {
      await fetch(`/api/wishlist/${eventId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      setIsWishlisted(true);
    }
  };

  const shareEvent = async (channel: 'whatsapp' | 'twitter' | 'copy') => {
    const url = window.location.href;
    const text = `${event?.name} - ${url}`;
    if (channel === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
    if (channel === 'twitter') {
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
    }
    if (channel === 'copy') {
      await navigator.clipboard.writeText(url);
    }
    if (eventId) {
      fetch(`/api/events/${eventId}/share`, { method: 'POST' });
    }
  };

  if (!event) return <div className="pt-40 text-center animate-pulse">Loading event details...</div>;

  const selectedTicketData = event.ticketTypes?.find(t => t.id === selectedTicket);

  return (
    <div className="pt-40 pb-32 max-w-7xl mx-auto px-6 lg:px-12">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-20">
        {/* Left Content */}
        <div className="lg:col-span-2">
          <div className="relative aspect-21/9 rounded-[3rem] overflow-hidden mb-16 glass border border-(--line-color) shadow-2xl">
            <img 
              src={event.image || `https://picsum.photos/seed/${event.id}/1200/600`} 
              alt={event.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-linear-to-t from-(--bg-color) via-transparent to-transparent opacity-80" />
          </div>
          
          <div className="flex flex-wrap items-center gap-6 mb-10">
            <span className="px-5 py-2 bg-brand-500/10 text-brand-500 text-[10px] font-bold uppercase tracking-[0.2em] rounded-full border border-brand-500/20">
              {event.category_name}
            </span>
            <div className="flex items-center gap-3 text-(--text-secondary) text-sm font-medium">
              <Clock className="w-4 h-4 text-brand-500" />
              {new Date(event.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="flex items-center gap-3 text-(--text-secondary) text-sm font-medium">
              <TrendingUp className="w-4 h-4 text-brand-500" />
              {event.total_seats - event.available_seats} People Attending
            </div>
          </div>

          <h1 className="editorial-title mb-12 text-6xl md:text-7xl lg:text-8xl">{event.name}</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-20">
            <div className="glass p-10 rounded-[2.5rem] flex items-start gap-6 group hover:border-brand-500/30 transition-all border border-(--line-color)">
              <div className="w-16 h-16 bg-brand-500/10 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <Calendar className="w-8 h-8 text-brand-500" />
              </div>
              <div>
                <div className="micro-label mb-2">Date & Time</div>
                <div className="text-xl font-bold mb-3">
                  {new Date(event.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
                <a 
                  href={getCalendarLink(event)} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-[10px] font-bold text-brand-500 uppercase tracking-widest hover:text-brand-400 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add Reminder
                </a>
              </div>
            </div>
            <div className="glass p-10 rounded-[2.5rem] flex items-start gap-6 group hover:border-brand-500/30 transition-all border border-(--line-color)">
              <div className="w-16 h-16 bg-brand-500/10 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <MapPin className="w-8 h-8 text-brand-500" />
              </div>
              <div>
                <div className="micro-label mb-2">Venue</div>
                <div className="text-xl font-bold mb-3">{event.venue}</div>
                <a
                  href={getGoogleMapsLink(event)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-[10px] font-bold text-brand-500 uppercase tracking-widest hover:text-brand-400 transition-colors"
                >
                  <ArrowRight className="w-3 h-3" /> Get Directions
                </a>
              </div>
            </div>
          </div>

          <div className="mb-24">
            <div className="micro-label mb-8">About the Event</div>
            <p className="text-(--text-secondary) text-xl leading-relaxed whitespace-pre-wrap font-medium">{event.description}</p>
            <div className="flex flex-wrap items-center gap-3 mt-8">
              <button onClick={() => shareEvent('whatsapp')} className="btn-outline-luxury py-2 px-4 text-xs">
                <Share2 className="w-4 h-4" /> WhatsApp
              </button>
              <button onClick={() => shareEvent('twitter')} className="btn-outline-luxury py-2 px-4 text-xs">
                <Share2 className="w-4 h-4" /> Twitter
              </button>
              <button onClick={() => shareEvent('copy')} className="btn-outline-luxury py-2 px-4 text-xs">
                <Copy className="w-4 h-4" /> Copy Link
              </button>
              {user && (
                <button onClick={toggleWishlist} className="btn-outline-luxury py-2 px-4 text-xs">
                  <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-rose-500 text-rose-500' : ''}`} /> {isWishlisted ? 'Saved' : 'Save'}
                </button>
              )}
            </div>
          </div>

          {/* Host Info */}
          <div className="glass p-10 rounded-[3rem] mb-24 flex items-center gap-8 border border-(--line-color)">
            <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
              <User className="w-10 h-10 text-(--text-secondary)" />
            </div>
            <div>
              <div className="micro-label mb-2">Organized By</div>
              <div className="text-2xl font-bold">{event.host_name}</div>
            </div>
          </div>

          {/* FAQ Section */}
          {event.faqs && event.faqs.length > 0 && (
            <div className="mb-24">
              <div className="micro-label mb-8">Frequently Asked Questions</div>
              <div className="space-y-6">
                {event.faqs.map((faq: any) => (
                  <div key={faq.id} className="glass p-10 rounded-[2.5rem] border border-(--line-color)">
                    <h4 className="font-display font-bold text-xl mb-4 uppercase tracking-tight">{faq.question}</h4>
                    <p className="text-(--text-secondary) text-lg leading-relaxed font-medium">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reviews */}
          <div className="mb-24">
            <div className="flex items-center justify-between mb-12">
              <h3 className="editorial-title text-4xl">Reviews</h3>
              <div className="flex items-center gap-3">
                <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
                <span className="font-bold text-2xl">
                  {event.reviews?.length 
                    ? (event.reviews.reduce((acc, r) => acc + r.rating, 0) / event.reviews.length).toFixed(1)
                    : '0.0'}
                </span>
                <span className="text-(--text-secondary) text-sm font-medium">({event.reviews?.length || 0} reviews)</span>
              </div>
            </div>

            {user && (
              <div className="glass p-10 rounded-[2.5rem] border border-(--line-color) mb-12 bg-linear-to-br from-brand-500/5 to-transparent">
                <h4 className="font-display font-bold text-xl mb-8 uppercase tracking-tight">Write a Review</h4>
                <ReviewForm eventId={event.id} userId={user.id} onReviewAdded={() => {
                  fetch(`/api/events/${eventId}`).then(res => res.json()).then(setEvent);
                }} />
              </div>
            )}

            <div className="grid grid-cols-1 gap-8">
              {event.reviews?.length ? event.reviews.map(review => (
                <div key={review.id} className="glass p-10 rounded-[2.5rem] border border-(--line-color)">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                        <User className="w-6 h-6 text-(--text-secondary)" />
                      </div>
                      <div className="font-bold text-lg">{review.user_name}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-4 h-4 ${i < review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-white/10'}`} />
                      ))}
                    </div>
                  </div>
                  <p className="text-(--text-secondary) text-lg leading-relaxed font-medium">{review.comment}</p>
                </div>
              )) : (
                <div className="text-center py-20 glass rounded-[2.5rem] border-dashed border-(--line-color)">
                  <MessageSquare className="w-12 h-12 text-(--text-secondary)/20 mx-auto mb-6" />
                  <p className="text-(--text-secondary) text-lg font-medium">No reviews yet. Be the first to share your experience!</p>
                </div>
              )}
            </div>
          </div>

          <div className="mb-24">
            <div className="micro-label mb-8">Event Discussion Threads</div>
            {user && (
              <div className="glass p-8 rounded-[2.5rem] border border-(--line-color) mb-8">
                <textarea
                  className="input-luxury py-4 px-5 min-h-25 resize-none"
                  placeholder="Start a discussion..."
                  value={discussionMessage}
                  onChange={(e) => setDiscussionMessage(e.target.value)}
                />
                <div className="flex justify-end mt-4">
                  <button onClick={() => createDiscussion(discussionMessage)} className="btn-luxury px-6 py-3 text-sm">Post</button>
                </div>
              </div>
            )}

            <div className="space-y-6">
              {discussions.length ? discussions.map((d) => (
                <div key={d.id} className="glass p-8 rounded-4xl border border-(--line-color)">
                  <div className="font-bold mb-2">{d.user_name}</div>
                  <div className="text-(--text-secondary) mb-4">{d.message}</div>
                  {user && (
                    <div className="mb-4">
                      <input
                        className="input-luxury text-sm"
                        placeholder="Reply..."
                        value={replyById[d.id] || ''}
                        onChange={(e) => setReplyById((prev) => ({ ...prev, [d.id]: e.target.value }))}
                      />
                      <div className="flex justify-end mt-2">
                        <button onClick={() => createDiscussion(replyById[d.id] || '', d.id)} className="text-xs font-bold uppercase tracking-widest text-brand-500">Reply</button>
                      </div>
                    </div>
                  )}
                  {!!d.replies?.length && (
                    <div className="space-y-3 pl-4 border-l border-(--line-color)">
                      {d.replies?.map((r) => (
                        <div key={r.id} className="p-3 rounded-xl bg-white/5 border border-white/5">
                          <div className="text-xs font-bold mb-1">{r.user_name}</div>
                          <div className="text-sm text-(--text-secondary)">{r.message}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )) : (
                <div className="text-center py-12 glass rounded-4xl border-dashed border-(--line-color) text-(--text-secondary)">
                  No discussions yet. Start the first thread.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div>
          <div className="sticky top-32 glass p-10 rounded-[3rem] border border-(--line-color)">
            <div className="micro-label mb-5">Reserve Spot</div>
            <h3 className="font-display font-bold text-3xl uppercase tracking-tight mb-8">Book Tickets</h3>

            {event.ticketTypes?.length ? (
              <div className="space-y-6">
                <div>
                  <label className="micro-label mb-3 block">Ticket Type</label>
                  <select
                    className="input-luxury"
                    value={selectedTicket}
                    onChange={(e) => setSelectedTicket(e.target.value)}
                  >
                    <option value="">Select ticket</option>
                    {event.ticketTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} - ${t.price.toFixed(2)} ({Math.max(0, t.quantity - t.sold)} left)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="micro-label mb-3 block">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, selectedTicketData ? selectedTicketData.quantity - selectedTicketData.sold : 1)}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                    className="input-luxury"
                  />
                </div>

                <div>
                  <label className="micro-label mb-3 block">Referral Code (Optional)</label>
                  <input
                    type="text"
                    className="input-luxury"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value)}
                    placeholder="Enter referral code"
                  />
                </div>

                <div className="border-t border-(--line-color) pt-8">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-(--text-secondary) text-[10px] font-bold uppercase tracking-widest">Total Amount</span>
                    <span className="text-4xl font-display font-bold text-white">
                      ${selectedTicketData ? (selectedTicketData.price * quantity).toFixed(2) : '0.00'}
                    </span>
                  </div>
                  <p className="text-[10px] text-(--text-secondary) text-right uppercase tracking-widest font-bold">Includes all fees</p>
                </div>

                <button
                  onClick={handleBooking}
                  disabled={!selectedTicket || bookingStatus !== 'idle'}
                  className="btn-luxury w-full py-6 text-xl flex items-center justify-center gap-4"
                >
                  {bookingStatus === 'loading' ? (
                    <>
                      <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : bookingStatus === 'success' ? (
                    <>
                      <CheckCircle className="w-7 h-7" />
                      Confirmed!
                    </>
                  ) : (
                    <>
                      <Ticket className="w-7 h-7" />
                      Get Tickets
                    </>
                  )}
                </button>

                <p className="mt-4 text-center text-[10px] text-(--text-secondary) flex items-center justify-center gap-3 font-bold uppercase tracking-widest">
                  <ShieldCheck className="w-4 h-4 text-brand-500" /> Secure checkout
                </p>
              </div>
            ) : (
              <div className="text-(--text-secondary)">No ticket types are available yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const Login = ({ onLogin }: { onLogin: (user: UserType, token?: string) => void }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, password })
    });
    if (res.ok) {
      const payload = await res.json();
      const { token, ...user } = payload;
      onLogin(user, token);
      navigate('/');
    } else {
      setError('Invalid email or password');
    }
    setLoading(false);
  };

  return (
    <div className="pt-40 pb-32 flex items-center justify-center px-6 min-h-screen relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-[40vw] h-[40vw] bg-brand-500/5 rounded-full blur-[120px] -z-10" />
      <div className="absolute bottom-1/4 right-1/4 w-[40vw] h-[40vw] bg-rose-500/5 rounded-full blur-[120px] -z-10" />
      
      <motion.div 
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-xl w-full glass p-16 rounded-[3rem] border border-(--line-color) shadow-2xl"
      >
        <div className="text-center mb-16">
          <div className="w-20 h-20 bg-(--text-primary) rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl">
            <Ticket className="text-(--bg-color) w-10 h-10" />
          </div>
          <h1 className="font-display font-bold text-5xl mb-4 tracking-tighter uppercase">Welcome <span className="italic font-serif normal-case font-normal text-brand-500">Back</span></h1>
          <p className="text-(--text-secondary) text-lg">Sign in to continue your campus journey.</p>
        </div>
        
        {error && <div className="p-6 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm rounded-2xl mb-12 flex items-center gap-4">
          <XCircle className="w-6 h-6" /> {error}
        </div>}

        <form onSubmit={handleSubmit} className="space-y-10">
          <div>
            <label className="micro-label mb-4 block">Email Address</label>
            <input 
              type="email" 
              required
              placeholder="name@college.edu"
              className="input-luxury"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-4">
              <label className="micro-label block">Password</label>
              <a href="#" className="text-[10px] font-bold text-brand-500 uppercase tracking-widest hover:underline">Forgot?</a>
            </div>
            <input 
              type="password" 
              required
              placeholder="••••••••"
              className="input-luxury"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" disabled={loading} className="btn-luxury w-full py-5 text-lg">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p className="mt-12 text-center text-sm text-(--text-secondary) font-medium">
          New to EventHub? <Link to="/register" className="text-brand-500 font-bold hover:underline">Create an account</Link>
        </p>
      </motion.div>
    </div>
  );
};

const Register = ({ onLogin }: { onLogin: (user: UserType, token?: string) => void }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'student' as 'student' | 'host' | 'sponsor',
    host_org_name: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const normalizedFormData = {
      ...formData,
      name: formData.name.trim(),
      email: formData.email.trim().toLowerCase(),
      host_org_name: formData.host_org_name.trim()
    };
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalizedFormData)
    });
    if (res.ok) {
      const payload = await res.json();
      const { token, ...user } = payload;
      onLogin(user, token);
      navigate('/');
    } else {
      setError('Email already exists or registration failed');
    }
    setLoading(false);
  };

  return (
    <div className="pt-40 pb-32 flex items-center justify-center px-6 min-h-screen relative overflow-hidden">
      <div className="absolute top-1/4 right-1/4 w-[40vw] h-[40vw] bg-brand-500/5 rounded-full blur-[120px] -z-10" />
      <div className="absolute bottom-1/4 left-1/4 w-[40vw] h-[40vw] bg-rose-500/5 rounded-full blur-[120px] -z-10" />

      <motion.div 
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-xl w-full glass p-16 rounded-[3rem] border border-(--line-color) shadow-2xl"
      >
        <div className="text-center mb-16">
          <h1 className="font-display font-bold text-5xl mb-4 tracking-tighter uppercase">Join <span className="italic font-serif normal-case font-normal text-brand-500">EventHub</span></h1>
          <p className="text-(--text-secondary) text-lg">The heart of campus life starts here.</p>
        </div>
        
        {error && <div className="p-6 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm rounded-2xl mb-12 flex items-center gap-4">
          <XCircle className="w-6 h-6" /> {error}
        </div>}

        <form onSubmit={handleSubmit} className="space-y-10">
          <div className="flex p-2 glass rounded-2xl mb-12">
            <button 
              type="button"
              onClick={() => setFormData({ ...formData, role: 'student' })}
              className={`flex-1 py-4 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all ${formData.role === 'student' ? 'bg-(--text-primary) text-(--bg-color) shadow-2xl' : 'text-(--text-secondary) hover:bg-white/5'}`}
            >
              Student
            </button>
            <button 
              type="button"
              onClick={() => setFormData({ ...formData, role: 'host' })}
              className={`flex-1 py-4 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all ${formData.role === 'host' ? 'bg-(--text-primary) text-(--bg-color) shadow-2xl' : 'text-(--text-secondary) hover:bg-white/5'}`}
            >
              Host
            </button>
            <button 
              type="button"
              onClick={() => setFormData({ ...formData, role: 'sponsor' })}
              className={`flex-1 py-4 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all ${formData.role === 'sponsor' ? 'bg-(--text-primary) text-(--bg-color) shadow-2xl' : 'text-(--text-secondary) hover:bg-white/5'}`}
            >
              Sponsor
            </button>
          </div>

          <div>
            <label className="micro-label mb-4 block">Full Name</label>
            <input 
              type="text" 
              required
              placeholder="John Doe"
              className="input-luxury"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div>
            <label className="micro-label mb-4 block">Email Address</label>
            <input 
              type="email" 
              required
              placeholder="name@college.edu"
              className="input-luxury"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div>
            <label className="micro-label mb-4 block">Password</label>
            <input 
              type="password" 
              required
              placeholder="••••••••"
              className="input-luxury"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>
          {(formData.role === 'host' || formData.role === 'sponsor') && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-4"
            >
              <label className="micro-label mb-4 block">{formData.role === 'sponsor' ? 'Company Name' : 'Organization Name'}</label>
              <input 
                type="text" 
                required
                placeholder={formData.role === 'sponsor' ? 'Campus Sponsor Co' : 'Event Masters'}
                className="input-luxury"
                value={formData.host_org_name}
                onChange={(e) => setFormData({ ...formData, host_org_name: e.target.value })}
              />
            </motion.div>
          )}
          <button type="submit" disabled={loading} className="btn-luxury w-full py-5 text-lg">
            {loading ? 'Creating Account...' : 'Join Now'}
          </button>
        </form>
        <p className="mt-12 text-center text-sm text-(--text-secondary) font-medium">
          Already have an account? <Link to="/login" className="text-brand-500 font-bold hover:underline">Sign in</Link>
        </p>
      </motion.div>
    </div>
  );
};

const MyBookings = ({ user }: { user: UserType | null }) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const loadBookings = async () => {
    if (!user) return;
    const res = await fetch(`/api/bookings/user/${user.id}`, withAuth());
    const data = await res.json();
    setBookings(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    loadBookings();

    const socket = createUserSocket(user.id);
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === 'ticket_verified') {
        loadBookings();
      }
    };

    return () => socket.close();
  }, [user]);

  const attendedBookings = bookings.filter((b) => b.ticket_status === 'verified' || b.checked_in === 1);
  const registeredBookings = bookings.filter((b) => !(b.ticket_status === 'verified' || b.checked_in === 1));
  const orderedBookings = [...attendedBookings, ...registeredBookings];

  return (
    <div className="pt-40 pb-32 max-w-7xl mx-auto px-6 lg:px-12">
      <div className="flex items-end justify-between mb-24">
        <div>
          <div className="micro-label mb-4">My Collection</div>
          <h1 className="editorial-title mb-6">Your <span className="italic font-serif normal-case font-normal text-brand-500">Tickets</span></h1>
          <p className="text-(--text-secondary) text-xl font-medium">Your upcoming experiences and past memories.</p>
        </div>
        <div className="hidden md:flex items-center gap-4 px-6 py-3 bg-white/5 rounded-full border border-white/10 text-(--text-secondary) text-[10px] font-bold uppercase tracking-widest">
          <Ticket className="w-5 h-5 text-brand-500" /> {bookings.length} Total Tickets
        </div>
      </div>
      
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-80 rounded-[3rem]" />
          ))}
        </div>
      ) : orderedBookings.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {orderedBookings.map((booking) => (
            <motion.div 
              key={booking.id} 
              whileHover={{ y: -10 }}
              className="glass rounded-[3rem] overflow-hidden flex flex-col md:flex-row border border-(--line-color) shadow-2xl group"
            >
              <div className="p-12 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-4 mb-8">
                    <span className="px-4 py-1.5 bg-brand-500/10 text-brand-500 text-[10px] font-bold uppercase tracking-[0.2em] rounded-full border border-brand-500/20">
                      {booking.ticket_type_name}
                    </span>
                    <span className="text-(--text-secondary) text-[10px] font-bold uppercase tracking-[0.2em]">{booking.booking_ref}</span>
                    {booking.ticket_id && (
                      <span className="text-(--text-secondary) text-[10px] font-bold uppercase tracking-[0.2em]">{booking.ticket_id}</span>
                    )}
                  </div>
                  <h3 className="font-display font-bold text-3xl mb-6 group-hover:text-brand-500 transition-colors tracking-tight uppercase leading-tight">{booking.event_name}</h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 text-(--text-secondary) text-sm font-medium">
                      <Calendar className="w-5 h-5 text-brand-500" />
                      <span>{new Date(booking.event_date!).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                    <div className="flex items-center gap-4 text-(--text-secondary) text-sm font-medium">
                      <MapPin className="w-5 h-5 text-brand-500" />
                      <span className="line-clamp-1">{booking.venue}</span>
                    </div>
                    {(booking.ticket_status === 'verified' || booking.checked_in === 1) ? (
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-widest">
                        <CheckCircle className="w-3.5 h-3.5" /> Verified Attendance
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[10px] font-bold uppercase tracking-widest">
                        <Clock className="w-3.5 h-3.5" /> Pending Verification
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-10 mt-10 border-t border-(--line-color)">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-(--text-secondary)">Tickets: <span className="text-white font-bold">{booking.quantity}</span></div>
                  <div className="text-3xl font-display font-bold text-white">${booking.total_price.toFixed(2)}</div>
                </div>
              </div>
              <div className="bg-white p-12 flex flex-col items-center justify-center shrink-0 border-l border-(--line-color) md:w-56">
                <div className="p-4 bg-white rounded-2xl shadow-inner border border-zinc-100 mb-6">
                  <img src={booking.qr_code} alt="QR Code" className="w-32 h-32" />
                </div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] text-center">Scan at Entry</span>
                <Link to={`/tickets/${booking.id}`} className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-800 transition-colors">
                  Open Ticket Page
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-40 glass rounded-[3rem] border-dashed border-(--line-color)">
          <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-10 border border-white/10">
            <Ticket className="w-10 h-10 text-(--text-secondary)" />
          </div>
          <h3 className="font-display font-bold text-3xl mb-4 uppercase tracking-tight">No tickets yet</h3>
          <p className="text-(--text-secondary) mb-12 max-w-md mx-auto text-lg font-medium">Your ticket wallet is empty. Start exploring the most exciting campus events today!</p>
          <Link to="/events" className="btn-luxury px-12 py-5 text-lg">Browse Events</Link>
        </div>
      )}
    </div>
  );
};

const TicketPage = ({ user }: { user: UserType | null }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [justVerified, setJustVerified] = useState(false);

  const loadBooking = () => {
    if (!user) return;
    fetch(`/api/bookings/user/${user.id}`, withAuth())
      .then((res) => res.json())
      .then((rows) => {
        const found = Array.isArray(rows) ? rows.find((row: Booking) => row.id === id) : null;
        if (!found) {
          navigate('/my-bookings');
          return;
        }
        setBooking(found);
      });
  };

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadBooking();

    const socket = createUserSocket(user.id);
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'ticket_verified' && payload.data.bookingId === id) {
          setJustVerified(true);
          loadBooking();
          setTimeout(() => setJustVerified(false), 8000);
        }
      } catch {}
    };

    return () => socket.close();
  }, [user, id, navigate]);

  if (!booking) {
    return <div className="pt-40 text-center micro-label">Loading ticket...</div>;
  }

  const verified = booking.ticket_status === 'verified' || booking.checked_in === 1;

  return (
    <div className="pt-40 pb-24 max-w-3xl mx-auto px-6 lg:px-12">
      <AnimatePresence>
        {justVerified && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mb-8 p-6 glass rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-center"
          >
            <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <div className="text-emerald-400 font-bold text-sm uppercase tracking-widest">Ticket Just Verified!</div>
            <div className="text-sm text-(--text-secondary) mt-1">Your attendance has been confirmed in real-time.</div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div layout className="glass rounded-[3rem] border border-(--line-color) p-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="micro-label mb-2">Ticket Page</div>
            <h1 className="font-display font-bold text-4xl tracking-tight uppercase">{booking.event_name}</h1>
          </div>
          <motion.div
            key={verified ? 'verified' : 'pending'}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            {verified ? (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-emerald-500/10">
                <CheckCircle className="w-4 h-4" /> Verified Attendance
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-bold uppercase tracking-widest">
                <Clock className="w-4 h-4" /> Pending Verification
              </div>
            )}
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div className="space-y-3 text-sm text-(--text-secondary)">
            <div><span className="font-bold text-white">Booking:</span> {booking.booking_ref}</div>
            <div><span className="font-bold text-white">Ticket ID:</span> {booking.ticket_id || 'Pending issuance'}</div>
            <div><span className="font-bold text-white">Type:</span> {booking.ticket_type_name}</div>
            <div><span className="font-bold text-white">Date:</span> {booking.event_date ? new Date(booking.event_date).toLocaleString() : 'TBD'}</div>
            <div><span className="font-bold text-white">Venue:</span> {booking.venue}</div>
          </div>
          <div className="bg-white rounded-3xl p-6 flex items-center justify-center">
            <img src={booking.qr_code} alt="Ticket QR" className="w-64 h-64" />
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const AdminDashboard = ({ user }: { user: UserType | null }) => {
  const [pendingEvents, setPendingEvents] = useState<EventType[]>([]);
  const [allEvents, setAllEvents] = useState<EventType[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'all' | 'reports' | 'attendance'>('pending');
  const [attendanceEventId, setAttendanceEventId] = useState('');
  const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'verified' | 'pending'>('all');
  const [attendanceRows, setAttendanceRows] = useState<Booking[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<{ total_registered: number; verified_attendees: number; pending_attendees: number } | null>(null);
  const [manualVerifyTicketId, setManualVerifyTicketId] = useState('');
  const [manualVerifyEmail, setManualVerifyEmail] = useState('');
  const [manualVerifyStatus, setManualVerifyStatus] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/');
      return;
    }
    fetchData();
  }, [user, activeTab]);

  useEffect(() => {
    if (activeTab !== 'attendance') return;
    if (!attendanceEventId) return;

    const filterQuery = attendanceFilter === 'all' ? '' : `?verified=${attendanceFilter}`;
    fetch(`/api/events/${attendanceEventId}/attendees${filterQuery}`, withAuth())
      .then(res => res.json())
      .then(data => setAttendanceRows(Array.isArray(data) ? data : []));

    fetch(`/api/events/${attendanceEventId}/tickets/summary`, withAuth())
      .then(res => res.json())
      .then((data) => setAttendanceSummary(data));
  }, [activeTab, attendanceEventId, attendanceFilter]);

  const fetchData = () => {
    if (activeTab === 'pending') fetch('/api/admin/events/pending', withAuth()).then(res => res.json()).then(data => Array.isArray(data) ? setPendingEvents(data) : setPendingEvents([]));
    if (activeTab === 'all') fetch('/api/events').then(res => res.json()).then(data => Array.isArray(data) ? setAllEvents(data) : setAllEvents([]));
    if (activeTab === 'reports') fetch('/api/admin/reports', withAuth()).then(res => res.json()).then(data => Array.isArray(data) ? setReports(data) : setReports([]));
    if (activeTab === 'attendance') {
      fetch('/api/events')
        .then(res => res.json())
        .then((data) => {
          const events = Array.isArray(data) ? data : [];
          setAllEvents(events);
          if (!attendanceEventId && events.length) {
            setAttendanceEventId(events[0].id);
          }
        });
    }
  };

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    const res = await fetch(`/api/admin/events/${id}/${action}`, withAuth({ method: 'POST' }));
    if (res.ok) fetchData();
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm('Are you sure you want to delete this event? This will remove all bookings and data associated with it.')) return;
    const res = await fetch(`/api/admin/events/${id}`, withAuth({ method: 'DELETE' }));
    if (res.ok) fetchData();
  };

  const handleReportAction = async (id: string, action: 'approve' | 'dismiss') => {
    const res = await fetch(`/api/admin/reports/${id}/${action}`, withAuth({ method: 'POST' }));
    if (res.ok) fetchData();
  };

  const verifyAttendanceManual = async () => {
    if (!attendanceEventId || (!manualVerifyTicketId && !manualVerifyEmail)) {
      setManualVerifyStatus('Provide event and ticket/email first.');
      return;
    }

    const res = await fetch('/api/tickets/verify-manual', withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: attendanceEventId,
        ticketId: manualVerifyTicketId || undefined,
        email: manualVerifyEmail || undefined,
      }),
    }));

    const data = await res.json();
    if (res.ok) {
      setManualVerifyStatus(data.alreadyCheckedIn ? 'Already checked in.' : 'Attendance verified successfully.');
      setManualVerifyTicketId('');
      setManualVerifyEmail('');
      if (activeTab === 'attendance') {
        const filterQuery = attendanceFilter === 'all' ? '' : `?verified=${attendanceFilter}`;
        const [rowsRes, summaryRes] = await Promise.all([
          fetch(`/api/events/${attendanceEventId}/attendees${filterQuery}`, withAuth()),
          fetch(`/api/events/${attendanceEventId}/tickets/summary`, withAuth()),
        ]);
        setAttendanceRows(await rowsRes.json());
        setAttendanceSummary(await summaryRes.json());
      }
      return;
    }

    setManualVerifyStatus(data.error || 'Manual verification failed.');
  };

  return (
    <div className="pt-40 pb-32 max-w-7xl mx-auto px-6 lg:px-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-16">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-brand-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-brand-500/20">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <div>
            <div className="micro-label mb-2">Management</div>
            <h1 className="editorial-title mb-2 text-5xl">Admin <span className="italic font-serif normal-case font-normal text-brand-500">Panel</span></h1>
            <p className="text-(--text-secondary) text-lg font-medium">Moderate events and manage the platform.</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4 p-2 glass rounded-3xl border border-(--line-color)">
          <button 
            onClick={() => setActiveTab('pending')}
            className={`px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'pending' ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20' : 'text-(--text-secondary) hover:bg-white/5'}`}
          >
            Pending
          </button>
          <button 
            onClick={() => setActiveTab('all')}
            className={`px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'all' ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20' : 'text-(--text-secondary) hover:bg-white/5'}`}
          >
            All Events
          </button>
          <button 
            onClick={() => setActiveTab('reports')}
            className={`px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'reports' ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20' : 'text-(--text-secondary) hover:bg-white/5'}`}
          >
            Reports
          </button>
          <button
            onClick={() => setActiveTab('attendance')}
            className={`px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'attendance' ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20' : 'text-(--text-secondary) hover:bg-white/5'}`}
          >
            Attendance
          </button>
        </div>
      </div>

      <div className="glass rounded-[3rem] overflow-hidden border border-(--line-color) shadow-2xl">
        {activeTab === 'pending' && (
          <>
            <div className="p-10 border-b border-(--line-color) flex items-center justify-between bg-white/5">
              <h2 className="font-display font-bold text-2xl uppercase tracking-tight">Pending Approvals</h2>
              <span className="px-5 py-2 bg-brand-500/10 text-brand-500 text-[10px] font-bold rounded-full border border-brand-500/20 uppercase tracking-widest">
                {pendingEvents.length} Events
              </span>
            </div>
            {pendingEvents.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5">
                      <th className="p-8 micro-label">Event</th>
                      <th className="p-8 micro-label">Host</th>
                      <th className="p-8 micro-label">Date</th>
                      <th className="p-8 micro-label text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--line-color)">
                    {pendingEvents.map(event => (
                      <tr key={event.id} className="hover:bg-white/5 transition-colors group">
                        <td className="p-8">
                          <div className="flex items-center gap-6">
                            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white/5 border border-white/10">
                              <img src={event.image || `https://picsum.photos/seed/${event.id}/100/100`} className="w-full h-full object-cover" />
                            </div>
                            <div className="font-bold text-lg">{event.name}</div>
                          </div>
                        </td>
                        <td className="p-8 text-(--text-secondary) font-medium">{event.host_name}</td>
                        <td className="p-8 text-(--text-secondary) font-medium">{new Date(event.date).toLocaleDateString()}</td>
                        <td className="p-8 text-right">
                          <div className="flex items-center justify-end gap-4">
                            <button 
                              onClick={() => handleAction(event.id, 'approve')}
                              className="p-3 text-emerald-500 hover:bg-emerald-500/10 rounded-2xl transition-all border border-emerald-500/20"
                              title="Approve"
                            >
                              <CheckCircle className="w-6 h-6" />
                            </button>
                            <button 
                              onClick={() => handleAction(event.id, 'reject')}
                              className="p-3 text-rose-500 hover:bg-rose-500/10 rounded-2xl transition-all border border-rose-500/20"
                              title="Reject"
                            >
                              <XCircle className="w-6 h-6" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-32 text-center">
                <CheckCircle className="w-20 h-20 text-emerald-500/20 mx-auto mb-8" />
                <h3 className="font-display font-bold text-2xl uppercase tracking-tight mb-4">All caught up</h3>
                <p className="text-(--text-secondary) text-lg font-medium">No events are waiting for approval at the moment.</p>
              </div>
            )}
          </>
        )}

        {activeTab === 'all' && (
          <>
            <div className="p-10 border-b border-(--line-color) flex items-center justify-between bg-white/5">
              <h2 className="font-display font-bold text-2xl uppercase tracking-tight">Manage Events</h2>
              <span className="px-5 py-2 bg-brand-500/10 text-brand-500 text-[10px] font-bold rounded-full border border-brand-500/20 uppercase tracking-widest">
                {allEvents.length} Total
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5">
                    <th className="p-8 micro-label">Event</th>
                    <th className="p-8 micro-label">Host</th>
                    <th className="p-8 micro-label">Status</th>
                    <th className="p-8 micro-label text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--line-color)">
                  {allEvents.map(event => (
                    <tr key={event.id} className="hover:bg-white/5 transition-colors group">
                      <td className="p-8">
                        <div className="flex items-center gap-6">
                          <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white/5 border border-white/10">
                            <img src={event.image || `https://picsum.photos/seed/${event.id}/100/100`} className="w-full h-full object-cover" />
                          </div>
                          <div className="font-bold text-lg">{event.name}</div>
                        </div>
                      </td>
                      <td className="p-8 text-(--text-secondary) font-medium">{event.host_name}</td>
                      <td className="p-8">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${
                          event.status === 'approved' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                          event.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                          'bg-rose-500/10 text-rose-500 border-rose-500/20'
                        }`}>
                          {event.status}
                        </span>
                      </td>
                      <td className="p-8 text-right">
                        <button 
                          onClick={() => handleDeleteEvent(event.id)}
                          className="p-3 text-rose-500 hover:bg-rose-500/10 rounded-2xl transition-all border border-rose-500/20"
                          title="Delete Event"
                        >
                          <XCircle className="w-6 h-6" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'reports' && (
          <>
            <div className="p-10 border-b border-(--line-color) flex items-center justify-between bg-white/5">
              <h2 className="font-display font-bold text-2xl uppercase tracking-tight">User Reports</h2>
              <span className="px-5 py-2 bg-rose-500/10 text-rose-500 text-[10px] font-bold rounded-full border border-rose-500/20 uppercase tracking-widest">
                {reports.length} Reports
              </span>
            </div>
            {reports.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5">
                      <th className="p-8 micro-label">Event Reported</th>
                      <th className="p-8 micro-label">Reported By</th>
                      <th className="p-8 micro-label">Reason</th>
                      <th className="p-8 micro-label text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--line-color)">
                    {reports.map(report => (
                      <tr key={report.id} className="hover:bg-white/5 transition-colors group">
                        <td className="p-8 font-bold text-lg">{report.event_name}</td>
                        <td className="p-8 text-(--text-secondary) font-medium">{report.user_name}</td>
                        <td className="p-8 text-(--text-secondary) font-medium max-w-xs truncate">{report.reason}</td>
                        <td className="p-8 text-right">
                          <div className="flex items-center justify-end gap-4">
                            <button 
                              onClick={() => handleReportAction(report.id, 'approve')}
                              className="px-6 py-2 bg-rose-500/10 text-rose-500 text-[10px] font-bold uppercase tracking-widest rounded-xl border border-rose-500/20 hover:bg-rose-500 transition-all hover:text-white"
                            >
                              Approve Report
                            </button>
                            <button 
                              onClick={() => handleReportAction(report.id, 'dismiss')}
                              className="px-6 py-2 bg-white/5 text-(--text-secondary) text-[10px] font-bold uppercase tracking-widest rounded-xl border border-white/10 hover:bg-white/10 transition-all"
                            >
                              Dismiss
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-32 text-center">
                <ShieldCheck className="w-20 h-20 text-brand-500/20 mx-auto mb-8" />
                <h3 className="font-display font-bold text-2xl uppercase tracking-tight mb-4">Safe & Sound</h3>
                <p className="text-(--text-secondary) text-lg font-medium">No active reports to review.</p>
              </div>
            )}
          </>
        )}

        {activeTab === 'attendance' && (
          <>
            <div className="p-10 border-b border-(--line-color) bg-white/5 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="font-display font-bold text-2xl uppercase tracking-tight">Attendance Verification</h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => setAttendanceFilter('all')} className={`btn-outline-luxury py-2 px-4 text-xs ${attendanceFilter === 'all' ? 'bg-white/10' : ''}`}>All</button>
                  <button onClick={() => setAttendanceFilter('verified')} className={`btn-outline-luxury py-2 px-4 text-xs ${attendanceFilter === 'verified' ? 'bg-emerald-500/20 border-emerald-500/40' : ''}`}>Verified</button>
                  <button onClick={() => setAttendanceFilter('pending')} className={`btn-outline-luxury py-2 px-4 text-xs ${attendanceFilter === 'pending' ? 'bg-amber-500/20 border-amber-500/40' : ''}`}>Not Verified</button>
                </div>
              </div>

              <select
                value={attendanceEventId}
                onChange={(e) => setAttendanceEventId(e.target.value)}
                className="input-luxury"
              >
                <option value="">Select event</option>
                {allEvents.map((event) => (
                  <option key={event.id} value={event.id}>{event.name}</option>
                ))}
              </select>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass rounded-2xl border border-(--line-color) p-4">
                  <div className="micro-label">Total Registered</div>
                  <div className="text-2xl font-bold mt-1">{attendanceSummary?.total_registered ?? 0}</div>
                </div>
                <div className="glass rounded-2xl border border-emerald-500/30 p-4">
                  <div className="micro-label">Verified</div>
                  <div className="text-2xl font-bold mt-1 text-emerald-400">{attendanceSummary?.verified_attendees ?? 0}</div>
                </div>
                <div className="glass rounded-2xl border border-amber-500/30 p-4">
                  <div className="micro-label">Not Verified</div>
                  <div className="text-2xl font-bold mt-1 text-amber-300">{attendanceSummary?.pending_attendees ?? 0}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  value={manualVerifyTicketId}
                  onChange={(e) => setManualVerifyTicketId(e.target.value)}
                  className="input-luxury"
                  placeholder="Manual verify by ticket ID"
                />
                <input
                  value={manualVerifyEmail}
                  onChange={(e) => setManualVerifyEmail(e.target.value)}
                  className="input-luxury"
                  placeholder="or attendee email"
                />
                <button onClick={verifyAttendanceManual} className="btn-luxury py-3 text-sm">Verify Attendance</button>
              </div>
              {manualVerifyStatus && <div className="text-xs uppercase tracking-[0.2em] text-(--text-secondary)">{manualVerifyStatus}</div>}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5">
                    <th className="p-8 micro-label">Name</th>
                    <th className="p-8 micro-label">Email</th>
                    <th className="p-8 micro-label">Ticket</th>
                    <th className="p-8 micro-label">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--line-color)">
                  {attendanceRows.map((row) => (
                    <tr key={row.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-8 font-medium">{row.user_name}</td>
                      <td className="p-8 text-(--text-secondary)">{row.user_email}</td>
                      <td className="p-8 text-(--text-secondary)">{row.ticket_id || row.booking_ref}</td>
                      <td className="p-8">
                        {(row.ticket_status === 'verified' || row.checked_in) ? (
                          <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Verified</span>
                        ) : (
                          <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border bg-amber-500/10 text-amber-400 border-amber-500/20">Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const Categories = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/categories')
      .then(res => res.json())
      .then(data => {
        setCategories(data);
        setLoading(false);
      });
  }, []);

  const filteredCategories = categories.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="pt-40 px-6 lg:px-12 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-8">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <Skeleton key={i} className="aspect-square rounded-[3rem]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="pt-40 pb-32 max-w-7xl mx-auto px-6 lg:px-12">
      <div className="mb-24">
        <div className="micro-label mb-6">Explore</div>
        <h1 className="editorial-title mb-16">Event <span className="italic font-serif normal-case font-normal text-brand-500">Categories</span></h1>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-12">
          <p className="text-(--text-secondary) text-xl max-w-2xl font-medium leading-relaxed">
            From high-energy festivals to focused workshops, find the perfect category that matches your interest.
          </p>
          <div className="relative group w-full md:w-96">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-(--text-secondary) group-focus-within:text-brand-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Search categories..." 
              className="input-luxury pl-16 py-4 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
        {filteredCategories.map((cat, i) => (
          <motion.div
            key={cat.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Link 
              to={`/events?category=${cat.id}`}
              className="group relative block h-80 glass rounded-[3rem] overflow-hidden border border-(--line-color) hover:border-brand-500/30 transition-all duration-500 shadow-2xl"
            >
              <div className="absolute inset-0 bg-linear-to-br from-brand-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              
              <div className="relative h-full p-12 flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div className="text-6xl group-hover:scale-110 transition-transform duration-500">{cat.icon}</div>
                  {cat.event_count && cat.event_count >= 2 && (
                    <span className="px-4 py-1.5 bg-brand-500 text-white text-[10px] font-bold uppercase tracking-widest rounded-full shadow-lg shadow-brand-500/20">
                      Trending
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="font-display font-bold text-3xl mb-4 tracking-tight uppercase group-hover:text-brand-500 transition-colors">
                    {cat.name}
                  </h3>
                  <div className="flex items-center justify-between">
                    <span className="text-(--text-secondary) text-sm font-bold uppercase tracking-widest">
                      {cat.event_count || 0} Events
                    </span>
                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-brand-500 group-hover:text-white transition-all duration-500">
                      <ArrowRight className="w-6 h-6" />
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

const Communities = ({ user }: { user: UserType | null }) => {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '', image: '' });

  useEffect(() => {
    fetch('/api/communities')
      .then(res => res.json())
      .then(data => {
        setCommunities(data);
        setLoading(false);
      });
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const res = await fetch('/api/communities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...formData, creatorId: user.id })
    });
    if (res.ok) {
      const newCommunity = await res.json();
      setCommunities([...communities, { ...newCommunity, creator_name: user.name, member_count: 1, created_at: new Date().toISOString() } as Community]);
      setShowCreate(false);
      setFormData({ name: '', description: '', image: '' });
    }
  };

  return (
    <div className="pt-40 pb-32 max-w-7xl mx-auto px-6 lg:px-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-12 mb-24">
        <div>
          <div className="micro-label mb-6">Social</div>
          <h1 className="editorial-title mb-16">Campus <span className="italic font-serif normal-case font-normal text-brand-500">Communities</span></h1>
          <p className="text-(--text-secondary) text-xl max-w-2xl font-medium leading-relaxed">
            Join groups of like-minded students, share experiences, and stay updated on niche interests.
          </p>
        </div>
        {user && (
          <button onClick={() => setShowCreate(true)} className="btn-luxury px-10 py-4 flex items-center gap-3">
            <Plus className="w-5 h-5" /> Create Community
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
        {communities.map((comm, i) => (
          <motion.div
            key={comm.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Link 
              to={`/communities/${comm.id}`}
              className="group relative block h-96 glass rounded-[3rem] overflow-hidden border border-(--line-color) hover:border-brand-500/30 transition-all duration-500 shadow-2xl"
            >
              <div className="absolute inset-0">
                <img 
                  src={comm.image || `https://picsum.photos/seed/${comm.id}/800/600`} 
                  alt={comm.name}
                  className="w-full h-full object-cover opacity-30 group-hover:opacity-50 transition-opacity duration-700"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-linear-to-t from-(--bg-color) via-(--bg-color)/80 to-transparent" />
              </div>
              
              <div className="relative h-full p-12 flex flex-col justify-end">
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="px-3 py-1 bg-brand-500/10 text-brand-500 text-[10px] font-bold uppercase tracking-widest rounded-full border border-brand-500/20">
                      {comm.member_count} Members
                    </span>
                  </div>
                  <h3 className="font-display font-bold text-3xl mb-4 tracking-tight uppercase group-hover:text-brand-500 transition-colors">
                    {comm.name}
                  </h3>
                  <p className="text-(--text-secondary) text-sm line-clamp-2 mb-8">
                    {comm.description}
                  </p>
                </div>
                <div className="flex items-center justify-between pt-8 border-t border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                      <User className="w-4 h-4 text-(--text-secondary)" />
                    </div>
                    <span className="text-xs text-(--text-secondary)">By {comm.creator_name}</span>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-brand-500 group-hover:text-white transition-all duration-500">
                    <ArrowRight className="w-5 h-5" />
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreate(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl glass p-12 rounded-[3rem] border border-white/10 shadow-3xl"
            >
              <h2 className="font-display font-bold text-4xl mb-12 uppercase tracking-tight">Create Community</h2>
              <form onSubmit={handleCreate} className="space-y-8">
                <div>
                  <label className="micro-label mb-4 block">Community Name</label>
                  <input 
                    type="text" 
                    required
                    className="input-luxury"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="micro-label mb-4 block">Description</label>
                  <textarea 
                    rows={4}
                    required
                    className="input-luxury resize-none"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div>
                  <label className="micro-label mb-4 block">Cover Image URL</label>
                  <input 
                    type="url" 
                    className="input-luxury"
                    placeholder="https://..."
                    value={formData.image}
                    onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                  />
                </div>
                <div className="flex gap-6 pt-6">
                  <button type="button" onClick={() => setShowCreate(false)} className="btn-outline-luxury flex-1 py-4">Cancel</button>
                  <button type="submit" className="btn-luxury flex-1 py-4">Create Community</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const CommunityDetail = ({ user }: { user: UserType | null }) => {
  const { id } = useParams();
  const [community, setCommunity] = useState<Community | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [isMember, setIsMember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [postContent, setPostContent] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'feed' | 'chat'>('feed');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const [commRes, postsRes, membersRes, messagesRes] = await Promise.all([
        fetch(`/api/communities/${id}`),
        fetch(`/api/communities/${id}/posts`),
        fetch(`/api/communities/${id}/members`),
        fetch(`/api/communities/${id}/messages`)
      ]);
      const commData = await commRes.json();
      const postsData = await postsRes.json();
      const membersData = await membersRes.json();
      const messagesData = await messagesRes.json();

      setCommunity(commData);
      setPosts(postsData);
      setMembers(membersData);
      setMessages(messagesData);
      setIsMember(membersData.some((m: CommunityMember) => m.id === user?.id));
      setLoading(false);
    };
    fetchData();
  }, [id, user]);

  useEffect(() => {
    if (isMember && user) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${window.location.host}?communityId=${id}&userId=${user.id}`);
      socketRef.current = socket;

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        if (payload.type === 'new_message') {
          setMessages(prev => [...prev, payload.data]);
        }
      };

      return () => {
        socket.close();
      };
    }
  }, [id, isMember, user]);

  useEffect(() => {
    if (activeTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  const handleJoinLeave = async () => {
    if (!user) return;
    const method = isMember ? 'DELETE' : 'POST';
    const endpoint = isMember ? 'leave' : 'join';
    const res = await fetch(`/api/communities/${id}/${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id })
    });
    if (res.ok) {
      setIsMember(!isMember);
      // Refresh members
      const membersRes = await fetch(`/api/communities/${id}/members`);
      setMembers(await membersRes.json());
    }
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !postContent.trim()) return;
    const res = await fetch(`/api/communities/${id}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, content: postContent })
    });
    if (res.ok) {
      const newPost = await res.json();
      setPosts([{ ...newPost, user_name: user.name, user_avatar: user.avatar, created_at: new Date().toISOString() } as CommunityPost, ...posts]);
      setPostContent('');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !chatMessage.trim()) return;
    const res = await fetch(`/api/communities/${id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, message: chatMessage })
    });
    if (res.ok) {
      setChatMessage('');
    }
  };

  if (loading) return <div className="pt-40 text-center micro-label">Loading Community...</div>;
  if (!community) return <div className="pt-40 text-center micro-label">Community not found</div>;

  return (
    <div className="pt-40 pb-32 max-w-7xl mx-auto px-6 lg:px-12">
      <div className="relative h-96 rounded-[4rem] overflow-hidden mb-20 border border-white/10 shadow-3xl">
        <img 
          src={community.image || `https://picsum.photos/seed/${community.id}/1920/1080`} 
          alt={community.name}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-linear-to-t from-(--bg-color) via-(--bg-color)/40 to-transparent" />
        <div className="absolute bottom-16 left-16 right-16 flex flex-col md:flex-row md:items-end justify-between gap-12">
          <div>
            <div className="micro-label mb-4 text-white/80">Community</div>
            <h1 className="font-display font-bold text-6xl md:text-8xl tracking-tighter uppercase text-white mb-6">{community.name}</h1>
            <div className="flex items-center gap-8 text-white/60 text-sm font-medium">
              <span className="flex items-center gap-2"><User className="w-4 h-4" /> {members.length} Members</span>
              <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Created by {community.creator_name}</span>
            </div>
          </div>
          {user && (
            <button 
              onClick={handleJoinLeave}
              className={`px-12 py-5 rounded-2xl font-bold uppercase tracking-widest text-sm transition-all duration-500 ${
                isMember 
                ? 'bg-white/10 text-white border border-white/20 hover:bg-rose-500/20 hover:border-rose-500/30 hover:text-rose-500' 
                : 'bg-brand-500 text-white shadow-xl shadow-brand-500/20 hover:scale-105 active:scale-95'
              }`}
            >
              {isMember ? 'Leave Community' : 'Join Community'}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-8 mb-12 border-b border-white/5 pb-6">
        <button 
          onClick={() => setActiveTab('feed')}
          className={`micro-label transition-colors ${activeTab === 'feed' ? 'text-brand-500' : 'text-(--text-secondary) hover:text-white'}`}
        >
          Discussion Feed
        </button>
        {isMember && (
          <button 
            onClick={() => setActiveTab('chat')}
            className={`micro-label transition-colors ${activeTab === 'chat' ? 'text-brand-500' : 'text-(--text-secondary) hover:text-white'}`}
          >
            Live Chat
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-20">
        <div className="lg:col-span-2">
          {activeTab === 'feed' ? (
            <div className="space-y-12">
              {isMember && (
                <div className="glass p-10 rounded-[3rem] border border-white/10">
                  <div className="micro-label mb-8">Share something</div>
                  <form onSubmit={handlePost} className="space-y-6">
                    <textarea 
                      rows={3}
                      placeholder="What's on your mind?"
                      className="input-luxury resize-none"
                      value={postContent}
                      onChange={(e) => setPostContent(e.target.value)}
                    />
                    <div className="flex justify-end">
                      <button type="submit" className="btn-luxury px-10 py-3 text-sm">Post to Community</button>
                    </div>
                  </form>
                </div>
              )}

              <div className="space-y-10">
                <div className="micro-label">Recent Discussions</div>
                {posts.length === 0 ? (
                  <div className="text-center py-20 glass rounded-[3rem] border border-dashed border-white/10 text-(--text-secondary)">
                    No posts yet. Be the first to share!
                  </div>
                ) : (
                  posts.map((post, i) => (
                    <motion.div 
                      key={post.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="glass p-10 rounded-[3rem] border border-white/10"
                    >
                      <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center border border-white/10 overflow-hidden">
                          {post.user_avatar ? <img src={post.user_avatar} alt={post.user_name} className="w-full h-full object-cover" /> : <User className="w-6 h-6 text-(--text-secondary)" />}
                        </div>
                        <div>
                          <div className="font-bold uppercase tracking-tight text-sm">{post.user_name}</div>
                          <div className="text-(--text-secondary) text-[10px] uppercase tracking-widest">{new Date(post.created_at).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <p className="text-lg leading-relaxed mb-8 text-zinc-300">
                        {post.content}
                      </p>
                      {post.image && (
                        <img src={post.image} alt="Post content" className="w-full rounded-2xl mb-8 border border-white/5" referrerPolicy="no-referrer" />
                      )}
                      <div className="flex gap-6 pt-8 border-t border-white/5">
                        <button className="flex items-center gap-2 text-(--text-secondary) hover:text-brand-500 transition-colors text-xs font-bold uppercase tracking-widest">
                          <MessageSquare className="w-4 h-4" /> Reply
                        </button>
                        <button className="flex items-center gap-2 text-(--text-secondary) hover:text-brand-500 transition-colors text-xs font-bold uppercase tracking-widest">
                          <TrendingUp className="w-4 h-4" /> Boost
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="glass rounded-[3rem] border border-white/10 h-150 flex flex-col overflow-hidden">
              <div className="p-8 border-b border-white/5 bg-white/5">
                <div className="micro-label">Community Chat</div>
              </div>
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {messages.map((msg, i) => (
                  <div key={msg.id} className={`flex flex-col ${msg.user_id === user?.id ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-secondary)">{msg.user_name}</span>
                      <span className="text-[10px] text-zinc-600">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className={`px-6 py-3 rounded-2xl text-sm max-w-[80%] ${
                      msg.user_id === user?.id 
                      ? 'bg-brand-500 text-white rounded-tr-none' 
                      : 'bg-white/5 text-zinc-300 border border-white/10 rounded-tl-none'
                    }`}>
                      {msg.message}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={handleSendMessage} className="p-8 border-t border-white/5 bg-white/5 flex gap-4">
                <input 
                  type="text"
                  placeholder="Type a message..."
                  className="input-luxury py-3"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                />
                <button type="submit" className="btn-luxury px-8 py-3">
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </div>
          )}
        </div>

        <div className="space-y-12">
          <div className="glass p-10 rounded-[3rem] border border-white/10">
            <div className="micro-label mb-8">Community Info</div>
            <p className="text-(--text-secondary) text-sm leading-relaxed mb-10">
              {community.description}
            </p>
            <div className="space-y-6">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest">
                <span className="text-(--text-secondary)">Members</span>
                <span>{members.length}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest">
                <span className="text-(--text-secondary)">Founded</span>
                <span>{new Date(community.created_at).getFullYear()}</span>
              </div>
            </div>
          </div>

          <div className="glass p-10 rounded-[3rem] border border-white/10">
            <div className="micro-label mb-8">Members</div>
            <div className="grid grid-cols-5 gap-4">
              {members.slice(0, 15).map(member => (
                <div key={member.id} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden group relative cursor-pointer">
                  {member.avatar ? <img src={member.avatar} alt={member.name} className="w-full h-full object-cover" /> : <User className="w-5 h-5 text-(--text-secondary)" />}
                  <div className="absolute inset-0 bg-brand-500/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-[8px] text-white font-bold uppercase text-center px-1">{member.name.split(' ')[0]}</span>
                  </div>
                </div>
              ))}
              {members.length > 15 && (
                <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-bold text-(--text-secondary)">
                  +{members.length - 15}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const HostDashboard = ({ user }: { user: UserType | null }) => {
  const [events, setEvents] = useState<EventType[]>([]);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    date: '',
    venue: '',
    category_id: '',
    total_seats: 100,
    ticketTypes: [{ name: 'General', price: 0, quantity: 100 }],
    faqs: [{ question: '', answer: '' }]
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || user.role !== 'host') {
      navigate('/');
      return;
    }
    fetchEvents();
    fetch('/api/categories').then(res => res.json()).then(setCategories);
    fetchPendingSponsorshipCount(withAuth, 'incoming').then((count) => setPendingRequests(count));
  }, [user]);

  const fetchEvents = () => {
    fetch('/api/events').then(res => res.json()).then(data => {
      if (Array.isArray(data)) {
        setEvents(data.filter((e: any) => e.host_id === user?.id));
      } else {
        setEvents([]);
      }
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const totalSeats = formData.ticketTypes.reduce((acc, tt) => acc + tt.quantity, 0);
    
    const data = new FormData();
    data.append('host_id', user?.id || '');
    data.append('name', formData.name);
    data.append('description', formData.description);
    data.append('date', formData.date);
    data.append('venue', formData.venue);
    data.append('category_id', formData.category_id);
    data.append('total_seats', totalSeats.toString());
    data.append('ticketTypes', JSON.stringify(formData.ticketTypes));
    data.append('faqs', JSON.stringify(formData.faqs.filter(f => f.question && f.answer)));
    if (imageFile) data.append('image', imageFile);

    const res = await fetch('/api/events', {
      ...withAuth(),
      method: 'POST',
      body: data
    });

    if (res.ok) {
      setShowCreate(false);
      fetchEvents();
      setFormData({
        name: '',
        description: '',
        date: '',
        venue: '',
        category_id: '',
        total_seats: 100,
        ticketTypes: [{ name: 'General', price: 0, quantity: 100 }],
        faqs: [{ question: '', answer: '' }]
      });
      setImageFile(null);
    }
    setLoading(false);
  };

  const updateStatus = async (eventId: string, status: string) => {
    const res = await fetch(`/api/host/events/${eventId}/status`, withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, host_id: user?.id })
    }));
    if (res.ok) {
      fetchEvents();
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm('Are you sure you want to delete this event? This will remove all bookings and data associated with it.')) return;
    const res = await fetch(`/api/host/events/${id}`, withAuth({ method: 'DELETE' }));
    if (res.ok) fetchEvents();
  };

  const handleQuickEdit = async (event: EventType) => {
    const name = prompt('Edit event name', event.name) ?? event.name;
    const venue = prompt('Edit venue', event.venue) ?? event.venue;
    const date = prompt('Edit date (ISO format)', event.date) ?? event.date;
    const form = new FormData();
    form.append('host_id', user?.id || '');
    form.append('name', name);
    form.append('venue', venue);
    form.append('date', date);
    form.append('description', event.description || '');
    form.append('category_id', event.category_id);

    const res = await fetch(`/api/events/${event.id}`, withAuth({ method: 'PUT', body: form }));
    if (res.ok) fetchEvents();
  };

  const duplicateEvent = async (event: EventType) => {
    const date = prompt('New date ISO (optional)') || '';
    const res = await fetch(`/api/events/${event.id}/duplicate`, withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_id: user?.id, date: date || undefined }),
    }));
    if (res.ok) fetchEvents();
  };

  const scheduleRecurring = async (event: EventType) => {
    const recurrence_type = prompt('Recurrence type: weekly or monthly', 'weekly') || 'weekly';
    const count = Number(prompt('How many future instances?', '4') || '4');
    const res = await fetch(`/api/events/${event.id}/recurring`, withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_id: user?.id, recurrence_type, count }),
    }));
    if (res.ok) fetchEvents();
  };

  return (
    <div className="pt-40 pb-32 max-w-7xl mx-auto px-6 lg:px-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-10 mb-24">
        <div>
          <div className="micro-label mb-4">Host Center</div>
          <h1 className="editorial-title mb-6 text-5xl md:text-6xl">Host <span className="italic font-serif normal-case font-normal text-brand-500">Dashboard</span></h1>
          <p className="text-(--text-secondary) text-xl font-medium">Manage your events and track ticket sales in real-time.</p>
          <div className="mt-4 inline-flex items-center gap-3 px-4 py-2 rounded-full border border-brand-500/30 bg-brand-500/10 text-xs font-bold uppercase tracking-widest">
            Pending Sponsorship Requests
            <span className="min-w-5 h-5 px-1 rounded-full bg-brand-500 text-black text-[10px] flex items-center justify-center">
              {pendingRequests > 99 ? '99+' : pendingRequests}
            </span>
          </div>
        </div>
        <button 
          onClick={() => setShowCreate(true)}
          className="btn-luxury flex items-center gap-4 px-10 py-5 text-lg"
        >
          <Plus className="w-6 h-6" /> Create Event
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
        {events.map(event => (
          <div key={event.id} className="glass rounded-[3rem] overflow-hidden border border-(--line-color) group shadow-2xl">
            <div className="aspect-video relative overflow-hidden">
              <img 
                src={event.image || `https://picsum.photos/seed/${event.id}/800/450`} 
                alt={event.name} 
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
              />
              <div className={`absolute top-6 right-6 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-full shadow-2xl border border-white/20 ${
                event.status === 'approved' ? 'bg-emerald-500 text-white' : event.status === 'pending' ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white'
              }`}>
                {event.status}
              </div>
            </div>
            <div className="p-10">
              <h3 className="font-display font-bold text-2xl mb-8 group-hover:text-brand-500 transition-colors tracking-tight uppercase leading-tight">{event.name}</h3>
              <div className="space-y-6">
                <div className="flex items-center justify-between text-sm">
                  <div className="text-(--text-secondary) font-bold uppercase tracking-widest text-[10px]">Tickets Sold</div>
                  <div className="font-bold text-white">{event.total_seats - event.available_seats} / {event.total_seats}</div>
                </div>
                <div className="w-full bg-white/5 h-3 rounded-full overflow-hidden border border-white/5">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${((event.total_seats - event.available_seats) / event.total_seats) * 100}%` }}
                    className="bg-brand-500 h-full rounded-full shadow-[0_0_20px_rgba(242,125,38,0.4)]" 
                  />
                </div>
              </div>
              <div className="mt-10 pt-8 border-t border-(--line-color) flex items-center justify-between">
                <div className="text-[10px] font-bold uppercase tracking-widest text-(--text-secondary) flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-brand-500" />
                  {new Date(event.date).toLocaleDateString()}
                </div>
                <div className="flex gap-4">
                  {event.status === 'approved' && (
                    <>
                      <Link
                        to={`/sponsorship/requests?event_id=${encodeURIComponent(event.id)}`}
                        className="text-[10px] font-bold text-brand-500 uppercase tracking-widest hover:underline"
                      >
                        Request Sponsor
                      </Link>
                      <button
                        onClick={() => handleQuickEdit(event)}
                        className="text-[10px] font-bold text-brand-500 uppercase tracking-widest hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => duplicateEvent(event)}
                        className="text-[10px] font-bold text-brand-500 uppercase tracking-widest hover:underline"
                      >
                        Duplicate
                      </button>
                      <button
                        onClick={() => scheduleRecurring(event)}
                        className="text-[10px] font-bold text-brand-500 uppercase tracking-widest hover:underline"
                      >
                        Recurring
                      </button>
                      <Link to={`/host/events/${event.id}/attendees`} className="text-[10px] font-bold text-brand-500 uppercase tracking-widest hover:underline">Attendees</Link>
                      <button 
                        onClick={() => updateStatus(event.id, 'completed')}
                        className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest hover:underline"
                      >
                        Complete
                      </button>
                      <button 
                        onClick={() => updateStatus(event.id, 'cancelled')}
                        className="text-[10px] font-bold text-rose-500 uppercase tracking-widest hover:underline"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={() => handleDeleteEvent(event.id)}
                        className="text-[10px] font-bold text-rose-500 uppercase tracking-widest hover:underline"
                      >
                        Delete
                      </button>
                    </>
                  )}
                  <Link to={`/events/${event.id}`} className="text-[10px] font-bold text-brand-500 uppercase tracking-widest hover:underline">Details</Link>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreate(false)}
              className="absolute inset-0 bg-(--bg-color)/95 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 40 }}
              className="relative w-full max-w-4xl glass p-12 rounded-[3.5rem] border border-(--line-color) shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-12">
                <h2 className="editorial-title text-4xl">Create <span className="italic font-serif normal-case font-normal text-brand-500">Event</span></h2>
                <button onClick={() => setShowCreate(false)} className="p-3 hover:bg-white/5 rounded-full transition-colors">
                  <X className="w-8 h-8" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-10">
                {/* Image Upload */}
                <div className="space-y-6">
                  <label className="micro-label block">Event Poster</label>
                  <div 
                    onClick={() => document.getElementById('image-upload')?.click()}
                    className="relative aspect-21/9 rounded-[2.5rem] border-2 border-dashed border-(--line-color) hover:border-brand-500/50 transition-all cursor-pointer flex flex-col items-center justify-center gap-6 group overflow-hidden bg-white/5"
                  >
                    {imageFile ? (
                      <img src={URL.createObjectURL(imageFile)} className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform border border-white/10">
                          <Upload className="w-10 h-10 text-(--text-secondary)" />
                        </div>
                        <div className="text-center">
                          <div className="micro-label text-(--text-secondary)">Click to upload poster</div>
                          <div className="text-[10px] font-bold text-zinc-600 mt-2 uppercase tracking-widest">Recommended: 1200x600px</div>
                        </div>
                      </>
                    )}
                    <input 
                      id="image-upload"
                      type="file" 
                      accept="image/*"
                      className="hidden" 
                      onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div>
                    <label className="micro-label mb-4 block">Event Name</label>
                    <input 
                      type="text" required
                      placeholder="e.g. Tech Summit 2026"
                      className="input-luxury"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="micro-label mb-4 block">Category</label>
                    <select 
                      required
                      className="input-luxury appearance-none"
                      value={formData.category_id}
                      onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    >
                      <option value="">Select Category</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="micro-label mb-4 block">Description</label>
                  <textarea 
                    required rows={4}
                    placeholder="Tell us more about the event..."
                    className="input-luxury resize-none"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div>
                    <label className="micro-label mb-4 block">Date & Time</label>
                    <input 
                      type="datetime-local" required
                      className="input-luxury"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="micro-label mb-4 block">Venue</label>
                    <input 
                      type="text" required
                      placeholder="e.g. Main Auditorium"
                      className="input-luxury"
                      value={formData.venue}
                      onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                    />
                  </div>
                </div>

                <div className="border-t border-(--line-color) pt-10">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="font-display font-bold text-2xl uppercase tracking-tight">Ticket Tiers</h3>
                    <button 
                      type="button"
                      onClick={() => setFormData({ ...formData, ticketTypes: [...formData.ticketTypes, { name: '', price: 0, quantity: 0 }] })}
                      className="text-[10px] font-bold text-brand-500 uppercase tracking-widest hover:underline flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> Add Tier
                    </button>
                  </div>
                  <div className="space-y-6">
                    {formData.ticketTypes.map((tt, i) => (
                      <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-6 p-8 glass rounded-4xl border border-(--line-color)">
                        <input 
                          placeholder="Tier Name (e.g. VIP)"
                          className="input-luxury py-3"
                          value={tt.name}
                          onChange={(e) => {
                            const newTypes = [...formData.ticketTypes];
                            newTypes[i].name = e.target.value;
                            setFormData({ ...formData, ticketTypes: newTypes });
                          }}
                        />
                        <input 
                          type="number" placeholder="Price ($)"
                          className="input-luxury py-3"
                          value={tt.price}
                          onChange={(e) => {
                            const newTypes = [...formData.ticketTypes];
                            newTypes[i].price = Number(e.target.value);
                            setFormData({ ...formData, ticketTypes: newTypes });
                          }}
                        />
                        <div className="flex gap-4">
                          <input 
                            type="number" placeholder="Quantity"
                            className="flex-1 input-luxury py-3"
                            value={tt.quantity}
                            onChange={(e) => {
                              const newTypes = [...formData.ticketTypes];
                              newTypes[i].quantity = Number(e.target.value);
                              setFormData({ ...formData, ticketTypes: newTypes });
                            }}
                          />
                          {formData.ticketTypes.length > 1 && (
                            <button 
                              type="button"
                              onClick={() => {
                                const newTypes = formData.ticketTypes.filter((_, idx) => idx !== i);
                                setFormData({ ...formData, ticketTypes: newTypes });
                              }}
                              className="p-3 text-rose-500 hover:bg-rose-500/10 rounded-2xl transition-all border border-rose-500/20"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-(--line-color) pt-10">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="font-display font-bold text-2xl uppercase tracking-tight">Frequently Asked Questions</h3>
                    <button 
                      type="button"
                      onClick={() => setFormData({ ...formData, faqs: [...formData.faqs, { question: '', answer: '' }] })}
                      className="text-[10px] font-bold text-brand-500 uppercase tracking-widest hover:underline flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> Add FAQ
                    </button>
                  </div>
                  <div className="space-y-6">
                    {formData.faqs.map((faq, index) => (
                      <div key={index} className="space-y-4 p-8 glass rounded-4xl border border-(--line-color)">
                        <input 
                          type="text" placeholder="Question"
                          className="input-luxury text-sm"
                          value={faq.question}
                          onChange={(e) => {
                            const newFaqs = [...formData.faqs];
                            newFaqs[index].question = e.target.value;
                            setFormData({ ...formData, faqs: newFaqs });
                          }}
                        />
                        <textarea 
                          placeholder="Answer"
                          className="input-luxury text-sm min-h-25 resize-none"
                          value={faq.answer}
                          onChange={(e) => {
                            const newFaqs = [...formData.faqs];
                            newFaqs[index].answer = e.target.value;
                            setFormData({ ...formData, faqs: newFaqs });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-10 pt-10">
                  <button 
                    type="button" 
                    onClick={() => setShowCreate(false)}
                    className="btn-outline-luxury flex-1 py-5 text-lg"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={loading}
                    className="btn-luxury flex-1 py-5 text-lg"
                  >
                    {loading ? 'Creating...' : 'Submit for Approval'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const HostScanner = ({ user }: { user: UserType | null }) => {
  const navigate = useNavigate();
  const [hostEvents, setHostEvents] = useState<EventType[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [lastResult, setLastResult] = useState<any>(null);
  const [scanHistory, setScanHistory] = useState<any[]>([]);
  const [summary, setSummary] = useState<{ total_registered: number; verified_attendees: number; pending_attendees: number } | null>(null);
  const [manualTicketId, setManualTicketId] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isProcessingScanRef = useRef(false);

  // Fetch host's events
  useEffect(() => {
    if (!user || !['host', 'admin'].includes(user.role)) {
      navigate('/');
      return;
    }
    fetch('/api/events', withAuth())
      .then((res) => res.json())
      .then((data) => {
        const events = Array.isArray(data) ? data : [];
        const filtered = user.role === 'admin' ? events : events.filter((e: any) => e.host_id === user.id);
        setHostEvents(filtered);
        if (filtered.length > 0 && !selectedEventId) {
          setSelectedEventId(filtered[0].id);
        }
      });
  }, [user, navigate]);

  // Update summary when event changes or after a scan
  useEffect(() => {
    if (!selectedEventId) return;
    const loadSummary = () => {
      fetch(`/api/events/${selectedEventId}/tickets/summary`, withAuth())
        .then((res) => res.json())
        .then((data) => setSummary(data))
        .catch(() => {});
    };
    loadSummary();
  }, [selectedEventId, lastResult]);

  const [latestRemoteScan, setLatestRemoteScan] = useState<string | null>(null);

  // WebSocket for real-time updates
  useEffect(() => {
    if (!user || !selectedEventId) return;
    const ws = createUserSocket(user.id);
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'ticket_verified' && message.data.eventId === selectedEventId) {
          // Re-fetch summary to get latest counts
          fetch(`/api/events/${selectedEventId}/tickets/summary`, withAuth())
            .then((res) => res.json())
            .then((data) => setSummary(data))
            .catch(() => {});

          // If it's a remote scan (not by us), add to history
          // Note: We can tell if it's "us" if we just performed a scan, 
          // but simpler is to just check if we want to show ALL scans.
          // For now, let's show all scans but mark them as "Remote" if they come via WS.
          const isLocal = lastResult && lastResult.raw?.ticket?.ticket_id === message.data.ticketId;
          
          if (!isLocal) {
            const remoteResult = {
              tone: 'success',
              title: 'Remote Verification',
              detail: `${message.data.userName} verified (${message.data.ticketType})`,
              name: message.data.userName,
              time: new Date().toLocaleTimeString(),
              isRemote: true,
              raw: { ticket: { ticket_id: message.data.ticketId } }
            };
            setScanHistory((prev) => [remoteResult, ...prev].slice(0, 20));
            setLatestRemoteScan(message.data.userName);
            setTimeout(() => setLatestRemoteScan(null), 5000);
          }
        }
      } catch (err) {
        console.error('WS Error:', err);
      }
    };

    return () => ws.close();
  }, [user, selectedEventId, lastResult]);

  // Initialize camera scanner
  useEffect(() => {
    if (!selectedEventId || !user) return;
    const timeout = setTimeout(() => {
      const el = document.getElementById('qr-reader');
      if (!el) return;
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      scanner
        .start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 280, height: 280 } },
          async (decodedText) => {
            if (!selectedEventId || isProcessingScanRef.current) return;
            isProcessingScanRef.current = true;
            try {
              const res = await fetch('/api/tickets/verify', withAuth({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ qrData: decodedText, event_id: selectedEventId, source: 'scanner' }),
              }));
              const data = await res.json();
              let result: any;
              if (res.ok) {
                result = data.alreadyCheckedIn
                  ? { tone: 'warning', title: 'Already Checked In', detail: data.ticket?.ticket_id || 'Duplicate scan.', name: data.ticket?.user_name || 'Unknown', time: new Date().toLocaleTimeString(), raw: data }
                  : { tone: 'success', title: 'Verification Success', detail: `${data.ticket?.user_name || 'Student'} verified`, name: data.ticket?.user_name || 'Student', time: new Date().toLocaleTimeString(), raw: data };
              } else {
                result = { tone: 'error', title: 'Invalid Ticket', detail: data.error || 'Verification failed.', name: 'N/A', time: new Date().toLocaleTimeString(), raw: data };
              }
              setLastResult(result);
              setScanHistory((prev) => [result, ...prev].slice(0, 20));
            } finally {
              window.setTimeout(() => { isProcessingScanRef.current = false; }, 800);
            }
          },
          () => {}
        )
        .then(() => setScannerActive(true))
        .catch(() => {
          setLastResult({ tone: 'error', title: 'Camera Unavailable', detail: 'Check browser camera permissions.', time: new Date().toLocaleTimeString() });
        });
    }, 200);

    return () => {
      clearTimeout(timeout);
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
      scannerRef.current?.clear();
      setScannerActive(false);
    };
  }, [selectedEventId, user]);

  const verifyManual = async () => {
    if (!selectedEventId || (!manualTicketId && !manualEmail)) return;
    setManualLoading(true);
    const res = await fetch('/api/tickets/verify-manual', withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: selectedEventId, ticketId: manualTicketId || undefined, email: manualEmail || undefined }),
    }));
    const data = await res.json();
    setManualLoading(false);
    const result: any = res.ok
      ? { tone: data.alreadyCheckedIn ? 'warning' : 'success', title: data.alreadyCheckedIn ? 'Already Checked In' : 'Manual Verification Success', detail: data.ticket?.ticket_id || 'Done.', name: data.ticket?.user_name || 'Student', time: new Date().toLocaleTimeString(), raw: data }
      : { tone: 'error', title: 'Manual Verification Failed', detail: data.error || 'Unable to verify.', name: 'N/A', time: new Date().toLocaleTimeString(), raw: data };
    setLastResult(result);
    setScanHistory((prev) => [result, ...prev].slice(0, 20));
    if (res.ok) { setManualTicketId(''); setManualEmail(''); }
  };

  const selectedEvent = hostEvents.find((e) => e.id === selectedEventId);

  return (
    <div className="pt-40 pb-24 max-w-6xl mx-auto px-6 lg:px-12">
      <div className="flex items-end justify-between mb-12">
        <div>
          <div className="micro-label mb-4">Entry Ops</div>
          <h1 className="font-display font-bold text-5xl tracking-tight uppercase mb-4">QR Ticket <span className="italic font-serif normal-case font-normal text-brand-500">Scanner</span></h1>
          <p className="text-(--text-secondary) text-lg font-medium">Scan QR codes or verify tickets manually at the event gate.</p>
        </div>
        {scannerActive && (
          <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-widest">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /> Scanner Active
          </div>
        )}
      </div>

      {/* Event Selector + Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 glass p-6 rounded-3xl border border-(--line-color)">
          <label className="micro-label block mb-3">Select Event</label>
          {hostEvents.length > 0 ? (
            <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)} className="input-luxury appearance-none">
              {hostEvents.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.name} — {new Date(ev.date).toLocaleDateString()}</option>
              ))}
            </select>
          ) : (
            <div className="text-(--text-secondary) text-sm py-3">No events found. Create an event first.</div>
          )}
          {selectedEvent && (
            <div className="mt-4 flex items-center gap-4 text-xs text-(--text-secondary)">
              <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-brand-500" /> {selectedEvent.venue}</span>
              <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-brand-500" /> {new Date(selectedEvent.date).toLocaleString()}</span>
            </div>
          )}
        </div>
        {summary && (
          <div className="glass p-6 rounded-3xl border border-(--line-color) relative overflow-hidden">
            <div className="micro-label mb-4">Live Attendance</div>
            <div className="text-4xl font-display font-bold text-brand-500 mb-1">
              {summary.verified_attendees}<span className="text-lg text-(--text-secondary) font-normal"> / {summary.total_registered}</span>
            </div>
            
            <AnimatePresence>
              {latestRemoteScan && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="absolute top-6 right-6 flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-500 text-[10px] font-bold uppercase tracking-widest"
                >
                  <Wifi className="w-3 h-3 animate-pulse" /> {latestRemoteScan}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden mt-3 mb-3">
              <motion.div initial={{ width: 0 }} animate={{ width: `${summary.total_registered > 0 ? (summary.verified_attendees / summary.total_registered) * 100 : 0}%` }} className="bg-brand-500 h-full rounded-full shadow-[0_0_10px_rgba(var(--brand-500-rgb),0.3)]" />
            </div>
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-(--text-secondary)">
              <span className="text-emerald-400">{summary.verified_attendees} Verified</span>
              <span className="text-amber-300">{summary.pending_attendees} Pending</span>
            </div>
          </div>
        )}
      </div>

      {/* Scanner + Result */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div>
          <div id="qr-reader" className="glass rounded-3xl border border-(--line-color) overflow-hidden" />
        </div>
        <div className="flex flex-col gap-6">
          <AnimatePresence mode="wait">
            {lastResult && (
              <motion.div
                key={lastResult.time + lastResult.title}
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                className={`glass p-8 rounded-3xl border ${lastResult.tone === 'success' ? 'border-emerald-500/40 shadow-lg shadow-emerald-500/10' : lastResult.tone === 'warning' ? 'border-amber-500/40 shadow-lg shadow-amber-500/10' : 'border-rose-500/40 shadow-lg shadow-rose-500/10'}`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${lastResult.tone === 'success' ? 'bg-emerald-500/20' : lastResult.tone === 'warning' ? 'bg-amber-500/20' : 'bg-rose-500/20'}`}>
                    {lastResult.tone === 'success' ? <CheckCircle className="w-6 h-6 text-emerald-400" /> : lastResult.tone === 'warning' ? <Clock className="w-6 h-6 text-amber-400" /> : <XCircle className="w-6 h-6 text-rose-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-lg mb-1">{lastResult.title}</div>
                    <div className="text-sm text-(--text-secondary) break-all">{lastResult.detail}</div>
                    <div className="text-[10px] text-(--text-secondary) mt-2 uppercase tracking-widest">{lastResult.time}</div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="glass p-6 rounded-3xl border border-(--line-color)">
            <div className="micro-label mb-4">Manual Verification Fallback</div>
            <div className="grid grid-cols-1 gap-3">
              <input value={manualTicketId} onChange={(e) => setManualTicketId(e.target.value)} className="input-luxury" placeholder="Ticket ID (e.g. TKT-...)" />
              <input value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} className="input-luxury" placeholder="Student email" />
            </div>
            <button onClick={verifyManual} disabled={manualLoading || !selectedEventId} className="btn-luxury mt-4 w-full py-3 text-sm">
              {manualLoading ? 'Verifying...' : 'Verify Manually'}
            </button>
          </div>
        </div>
      </div>

      {/* Scan History */}
      {scanHistory.length > 0 && (
        <div className="glass p-8 rounded-3xl border border-(--line-color) relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 pointer-events-none opacity-5">
            <Clock className="w-24 h-24" />
          </div>
          
          <div className="flex items-center justify-between mb-8 relative">
            <div>
              <div className="micro-label mb-1">Session Log</div>
              <h3 className="font-display font-bold text-xl uppercase tracking-tight">Recent Scans</h3>
            </div>
            <button 
              onClick={() => setScanHistory([])} 
              className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-bold text-(--text-secondary) hover:text-white hover:bg-white/10 uppercase tracking-widest transition-all"
            >
              Clear Log
            </button>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
            <AnimatePresence initial={false}>
              {scanHistory.map((entry, idx) => (
                <motion.div 
                  key={idx + (entry.raw?.ticket?.id || entry.time)}
                  initial={{ opacity: 0, x: -20, scale: 0.98 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`flex items-center gap-5 p-5 rounded-[2.5rem] border transition-all hover:scale-[1.01] ${
                    entry.tone === 'success' 
                      ? 'border-emerald-500/20 bg-emerald-500/5' 
                      : entry.tone === 'warning' 
                        ? 'border-amber-500/20 bg-amber-500/5' 
                        : 'border-rose-500/20 bg-rose-500/5'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-[1.25rem] flex items-center justify-center shrink-0 shadow-lg ${
                    entry.tone === 'success' ? 'bg-emerald-500/20 shadow-emerald-500/5' : entry.tone === 'warning' ? 'bg-amber-500/20 shadow-amber-500/5' : 'bg-rose-500/20 shadow-rose-500/5'
                  }`}>
                    {entry.isRemote ? <Wifi className="w-5 h-5 text-brand-500" /> : (entry.tone === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : entry.tone === 'warning' ? <Clock className="w-5 h-5 text-amber-400" /> : <XCircle className="w-5 h-5 text-rose-400" />)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-bold truncate tracking-tight">{entry.title}</span>
                      {entry.isRemote && <span className="text-[9px] font-black bg-brand-500/20 text-brand-500 px-2 py-0.5 rounded-full uppercase tracking-widest">Remote</span>}
                      <span className="text-[9px] font-bold text-(--text-secondary) opacity-40 uppercase tracking-widest ml-auto shrink-0">{entry.time}</span>
                    </div>
                    <div className="text-[11px] text-(--text-secondary) truncate opacity-70 font-medium">{entry.detail}</div>
                  </div>
                  {entry.raw?.ticket?.ticket_id && (
                    <div className="hidden sm:block px-3 py-1.5 rounded-2xl bg-white/5 border border-white/10 group-hover:bg-white/10 transition-colors">
                      <div className="text-[9px] font-black font-mono text-(--text-secondary) opacity-40 uppercase tracking-tighter">{entry.raw.ticket.ticket_id}</div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
};

const HostAttendees = ({ user }: { user: UserType | null }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [attendees, setAttendees] = useState<Booking[]>([]);
  const [summary, setSummary] = useState<{ total_registered: number; verified_attendees: number; pending_attendees: number } | null>(null);
  const [filter, setFilter] = useState<'all' | 'verified' | 'pending'>('all');

  const loadAttendees = async () => {
    if (!id || !user) return;
    const filterQuery = filter === 'all' ? '' : `?verified=${filter}`;
    const [attendeeRes, summaryRes] = await Promise.all([
      fetch(`/api/events/${id}/attendees${filterQuery}`, withAuth()),
      fetch(`/api/events/${id}/tickets/summary`, withAuth()),
    ]);

    const attendeeRows = await attendeeRes.json();
    setAttendees(Array.isArray(attendeeRows) ? attendeeRows : []);

    if (summaryRes.ok) {
      setSummary(await summaryRes.json());
    }
  };

  useEffect(() => {
    if (!user || !['host', 'admin'].includes(user.role)) {
      navigate('/');
      return;
    }
    if (!id) return;
    loadAttendees();
  }, [id, user, navigate, filter]);

  const checkIn = async (bookingId: string) => {
    if (!user || !id) return;
    const res = await fetch(`/api/bookings/${bookingId}/check-in`, withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_id: user.id }),
    }));
    if (res.ok) {
      await loadAttendees();
    }
  };

  return (
    <div className="pt-40 pb-24 max-w-6xl mx-auto px-6 lg:px-12">
      <h1 className="font-display font-bold text-4xl uppercase mb-8">Attendee Check-in List</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="glass rounded-2xl border border-(--line-color) p-4">
          <div className="micro-label">Total Registered</div>
          <div className="text-3xl font-bold mt-2">{summary?.total_registered ?? attendees.length}</div>
        </div>
        <div className="glass rounded-2xl border border-emerald-500/30 p-4">
          <div className="micro-label">Verified</div>
          <div className="text-3xl font-bold mt-2 text-emerald-400">{summary?.verified_attendees ?? attendees.filter((a) => a.ticket_status === 'verified' || a.checked_in).length}</div>
        </div>
        <div className="glass rounded-2xl border border-amber-500/30 p-4">
          <div className="micro-label">Not Verified</div>
          <div className="text-3xl font-bold mt-2 text-amber-300">{summary?.pending_attendees ?? attendees.filter((a) => !(a.ticket_status === 'verified' || a.checked_in)).length}</div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => setFilter('all')} className={`btn-outline-luxury py-2 px-4 text-xs ${filter === 'all' ? 'bg-white/10' : ''}`}>All</button>
        <button onClick={() => setFilter('verified')} className={`btn-outline-luxury py-2 px-4 text-xs ${filter === 'verified' ? 'bg-emerald-500/20 border-emerald-500/40' : ''}`}>Verified</button>
        <button onClick={() => setFilter('pending')} className={`btn-outline-luxury py-2 px-4 text-xs ${filter === 'pending' ? 'bg-amber-500/20 border-amber-500/40' : ''}`}>Not Verified</button>
      </div>

      <div className="glass rounded-3xl border border-(--line-color) overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-white/5">
            <tr>
              <th className="p-4 micro-label">Name</th>
              <th className="p-4 micro-label">Email</th>
              <th className="p-4 micro-label">Ticket</th>
              <th className="p-4 micro-label">Status</th>
              <th className="p-4 micro-label">Action</th>
            </tr>
          </thead>
          <tbody>
            {attendees.map((a) => (
              <tr key={a.id} className="border-t border-(--line-color)">
                <td className="p-4">{a.user_name}</td>
                <td className="p-4">{a.user_email}</td>
                <td className="p-4">{a.ticket_id || a.booking_ref}</td>
                <td className="p-4">{a.ticket_status === 'verified' || a.checked_in ? 'Verified' : 'Pending'}</td>
                <td className="p-4">
                  {!(a.ticket_status === 'verified' || a.checked_in) && <button className="btn-outline-luxury py-1 px-3 text-xs" onClick={() => checkIn(a.id)}>Verify</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const WishlistPage = ({ user }: { user: UserType | null }) => {
  const [events, setEvents] = useState<EventType[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetch(`/api/wishlist/${user.id}`).then(res => res.json()).then((rows) => setEvents(Array.isArray(rows) ? rows : []));
  }, [user, navigate]);

  return (
    <div className="pt-40 pb-24 max-w-7xl mx-auto px-6 lg:px-12">
      <h1 className="font-display font-bold text-5xl uppercase mb-10">Saved Events</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
        {events.map((event) => <EventCard key={`wish-${event.id}`} event={event} />)}
      </div>
    </div>
  );
};

const HostAnalytics = ({ user }: { user: UserType | null }) => {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || user.role !== 'host') {
      navigate('/');
      return;
    }
    fetch(`/api/analytics/host/${user.id}`, withAuth()).then(res => res.json()).then(setData);
  }, [user, navigate]);

  if (!data) return <div className="pt-40 text-center">Loading analytics...</div>;

  const pieColors = ['#10b981', '#f59e0b', '#f43f5e', '#3b82f6'];

  return (
    <div className="pt-40 pb-24 max-w-7xl mx-auto px-6 lg:px-12 space-y-12">
      <h1 className="font-display font-bold text-5xl uppercase">Analytics Dashboard</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="glass p-6 rounded-3xl border border-(--line-color) h-96">
          <div className="micro-label mb-4">Ticket Sales Over Time</div>
          <ResponsiveContainer width="100%" height="90%">
            <LineChart data={data.salesOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Line dataKey="tickets" stroke="#10b981" strokeWidth={2} />
              <Line dataKey="revenue" stroke="#f59e0b" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="glass p-6 rounded-3xl border border-(--line-color) h-96">
          <div className="micro-label mb-4">Revenue Breakdown</div>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={data.revenueBreakdown}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="event_name" hide />
              <YAxis />
              <Tooltip />
              <Bar dataKey="revenue" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass p-6 rounded-3xl border border-(--line-color) h-96">
          <div className="micro-label mb-4">Attendee Demographics</div>
          <ResponsiveContainer width="100%" height="90%">
            <PieChart>
              <Pie data={data.attendeeDemographics} dataKey="count" nameKey="role" cx="50%" cy="50%" outerRadius={110} label>
                {data.attendeeDemographics.map((_, idx) => (
                  <Cell key={`cell-${idx}`} fill={pieColors[idx % pieColors.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="glass p-6 rounded-3xl border border-(--line-color) h-96">
          <div className="micro-label mb-4">Category Trends</div>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={data.categoryTrends}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="bookings" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

const SponsorshipRequestsCenter = ({ user }: { user: UserType | null }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [incoming, setIncoming] = useState<SponsorshipRequest[]>([]);
  const [outgoing, setOutgoing] = useState<SponsorshipRequest[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [selectedDealId, setSelectedDealId] = useState('');
  const [dealMessages, setDealMessages] = useState<DealMessage[]>([]);
  const [dealMessageInput, setDealMessageInput] = useState('');
  const [events, setEvents] = useState<Array<EventType & { analytics?: EventAnalyticsSnapshot }>>([]);
  const [sponsors, setSponsors] = useState<Array<Sponsor & { user_name?: string; user_email?: string }>>([]);
  const [tab, setTab] = useState<'incoming' | 'outgoing' | 'deals'>('incoming');
  const [createForm, setCreateForm] = useState({ event_id: '', sponsor_user_id: '', proposed_amount: '', message: '' });
  const [loading, setLoading] = useState(false);

  const selectedEvent = events.find((ev) => ev.id === createForm.event_id);

  const refresh = async () => {
    if (!user) return;
    const requests = await Promise.all([
      fetch('/api/sponsorship/requests?box=incoming', withAuth()),
      fetch('/api/sponsorship/requests?box=outgoing', withAuth()),
      fetch('/api/sponsorship/deals', withAuth()),
      fetch('/api/analytics/events?limit=100', withAuth()),
    ]);

    const [incomingRes, outgoingRes, dealsRes, eventsRes] = requests;
    if (incomingRes.ok) {
      const rows = await incomingRes.json();
      setIncoming(Array.isArray(rows) ? rows : []);
    }
    if (outgoingRes.ok) {
      const rows = await outgoingRes.json();
      setOutgoing(Array.isArray(rows) ? rows : []);
    }
    if (dealsRes.ok) {
      const rows = await dealsRes.json();
      setDeals(Array.isArray(rows) ? rows : []);
    }
    if (eventsRes.ok) {
      const rows = await eventsRes.json();
      setEvents(Array.isArray(rows) ? rows : []);
    }

    if (user.role === 'host' || user.role === 'admin') {
      const sponsorRes = await fetch('/api/sponsorship/sponsors', withAuth());
      if (sponsorRes.ok) {
        const rows = await sponsorRes.json();
        setSponsors(Array.isArray(rows) ? rows : []);
      }
    }
  };

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (!['sponsor', 'host', 'admin'].includes(user.role)) {
      navigate('/');
      return;
    }
    refresh();
  }, [user, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const eventId = params.get('event_id') || '';
    const sponsorUserId = params.get('sponsor_user_id') || '';
    if (eventId || sponsorUserId) {
      setCreateForm((prev) => ({ ...prev, event_id: eventId || prev.event_id, sponsor_user_id: sponsorUserId || prev.sponsor_user_id }));
    }
  }, [location.search]);

  useEffect(() => {
    if (!selectedDealId) {
      setDealMessages([]);
      return;
    }

    fetch(`/api/sponsorship/deals/${selectedDealId}/messages`, withAuth())
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => setDealMessages(Array.isArray(rows) ? rows : []));
  }, [selectedDealId]);

  const createRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    const payload: any = {
      event_id: createForm.event_id,
      message: createForm.message,
      proposed_amount: Number(createForm.proposed_amount || 0),
    };
    if (user.role === 'host' || user.role === 'admin') {
      payload.sponsor_user_id = createForm.sponsor_user_id;
    }

    const res = await fetch('/api/sponsorship/requests', withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }));

    setLoading(false);
    if (res.ok) {
      setCreateForm({ event_id: '', sponsor_user_id: '', proposed_amount: '', message: '' });
      await refresh();
      emitSponsorshipSync();
    }
  };

  const respond = async (id: string, status: 'accepted' | 'rejected') => {
    const res = await fetch(`/api/sponsorship/requests/${id}/respond`, withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }));
    if (res.ok) {
      await refresh();
      emitSponsorshipSync();
    }
  };

  const withdrawRequest = async (id: string) => {
    const res = await fetch(`/api/sponsorship/requests/${id}/withdraw`, withAuth({ method: 'POST' }));
    if (res.ok) {
      await refresh();
      emitSponsorshipSync();
    }
  };

  const updateDealStatus = async (id: string, status: 'active' | 'completed' | 'cancelled') => {
    const res = await fetch(`/api/sponsorship/deals/${id}/status`, withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }));
    if (res.ok) {
      await refresh();
      emitSponsorshipSync();
    }
  };

  const sendDealMessage = async () => {
    if (!selectedDealId || !dealMessageInput.trim()) return;
    const res = await fetch(`/api/sponsorship/deals/${selectedDealId}/messages`, withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: dealMessageInput.trim() }),
    }));

    if (res.ok) {
      setDealMessageInput('');
      const refreshed = await fetch(`/api/sponsorship/deals/${selectedDealId}/messages`, withAuth());
      if (refreshed.ok) {
        const rows = await refreshed.json();
        setDealMessages(Array.isArray(rows) ? rows : []);
      }
    }
  };

  const canRespond = (req: SponsorshipRequest) => req.status === 'pending' && req.receiver_user_id === user?.id;

  return (
    <div className="pt-40 pb-24 max-w-7xl mx-auto px-6 lg:px-12 space-y-8">
      <div>
        <div className="micro-label mb-2">Sponsorship Exchange</div>
        <h1 className="font-display font-bold text-5xl uppercase tracking-tight">Requests & Deals</h1>
        {user?.role === 'admin' && (
          <div className="mt-3 text-xs uppercase tracking-widest text-(--text-secondary)">
            Admin can both request sponsors and oversee sponsor-initiated proposals.
          </div>
        )}
      </div>

      <div className="glass p-6 rounded-3xl border border-(--line-color)">
        <h2 className="font-display font-bold text-2xl uppercase mb-4">Create New Request</h2>
        <form onSubmit={createRequest} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <select
            className="input-luxury"
            value={createForm.event_id}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, event_id: e.target.value }))}
            required
          >
            <option value="">Select event</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>

          {(user?.role === 'host' || user?.role === 'admin') && (
            <select
              className="input-luxury"
              value={createForm.sponsor_user_id}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, sponsor_user_id: e.target.value }))}
              required
            >
              <option value="">Select sponsor</option>
              {sponsors.map((s) => (
                <option key={s.id} value={s.user_id}>
                  {s.company_name} ({s.user_email || 'no-email'})
                </option>
              ))}
            </select>
          )}

          <input
            className="input-luxury"
            type="number"
            min={0}
            placeholder="Proposed amount"
            value={createForm.proposed_amount}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, proposed_amount: e.target.value }))}
            required
          />

          <input
            className="input-luxury"
            placeholder={user?.role === 'sponsor' ? 'Pitch your sponsorship proposal' : 'Describe your sponsorship request'}
            value={createForm.message}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, message: e.target.value }))}
            required
          />

          <div className="md:col-span-2 flex justify-end">
            <button type="submit" disabled={loading} className="btn-luxury px-6 py-3 text-sm">
              {loading ? 'Sending...' : user?.role === 'sponsor' ? 'Sponsor Event' : 'Request Sponsor'}
            </button>
          </div>
        </form>

        {selectedEvent?.analytics && (
          <div className="mt-4 p-4 rounded-2xl border border-white/10 bg-white/5">
            <div className="micro-label mb-2">Selected Event Analytics (30d)</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>Registrations: <span className="font-bold">{selectedEvent.analytics.total_registrations}</span></div>
              <div>Tickets Sold: <span className="font-bold">{selectedEvent.analytics.tickets_sold}</span></div>
              <div>Revenue: <span className="font-bold">${Number(selectedEvent.analytics.gross_revenue || 0).toFixed(2)}</span></div>
              <div>Conversion: <span className="font-bold">{selectedEvent.analytics.conversion_rate}%</span></div>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button className={`btn-outline-luxury py-2 px-4 text-xs ${tab === 'incoming' ? 'border-brand-500/40 text-brand-500' : ''}`} onClick={() => setTab('incoming')}>Incoming</button>
        <button className={`btn-outline-luxury py-2 px-4 text-xs ${tab === 'outgoing' ? 'border-brand-500/40 text-brand-500' : ''}`} onClick={() => setTab('outgoing')}>Outgoing</button>
        <button className={`btn-outline-luxury py-2 px-4 text-xs ${tab === 'deals' ? 'border-brand-500/40 text-brand-500' : ''}`} onClick={() => setTab('deals')}>Deals</button>
      </div>

      {tab !== 'deals' ? (
        <div className="glass p-6 rounded-3xl border border-(--line-color)">
          <div className="space-y-3 max-h-128 overflow-y-auto">
            {(tab === 'incoming' ? incoming : outgoing).map((r) => (
              <div key={r.id} className="p-4 rounded-2xl border border-white/10 bg-white/5">
                <div className="flex items-center justify-between gap-4 mb-2">
                  <div className="font-bold text-sm">{r.event_name || r.event_id || 'General sponsorship request'}</div>
                  <div className="text-[10px] uppercase tracking-widest">{r.status}</div>
                </div>
                <div className="text-xs text-(--text-secondary) mb-2">
                  {r.sender_name || r.sender_user_id} → {r.receiver_name || r.receiver_user_id}
                </div>
                <div className="text-sm mb-2">{r.message}</div>
                <div className="text-xs text-(--text-secondary)">Amount: ${Number(r.proposed_amount || 0).toFixed(2)}</div>

                {canRespond(r) && (
                  <div className="mt-3 flex gap-2">
                    <button className="btn-luxury py-1 px-3 text-xs" onClick={() => respond(r.id, 'accepted')}>Accept</button>
                    <button className="btn-outline-luxury py-1 px-3 text-xs" onClick={() => respond(r.id, 'rejected')}>Reject</button>
                  </div>
                )}

                {tab === 'outgoing' && r.status === 'pending' && r.sender_user_id === user?.id && (
                  <div className="mt-3 flex gap-2">
                    <button className="btn-outline-luxury py-1 px-3 text-xs" onClick={() => withdrawRequest(r.id)}>Withdraw</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass p-6 rounded-3xl border border-(--line-color)">
            <div className="space-y-3 max-h-128 overflow-y-auto">
              {deals.map((d) => (
                <div key={d.id} className="p-4 rounded-2xl border border-white/10 bg-white/5">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <div className="font-bold text-sm">{d.event_name || d.event_id}</div>
                    <div className="text-[10px] uppercase tracking-widest">{d.status}</div>
                  </div>
                  <div className="text-xs text-(--text-secondary) mb-1">Sponsor: {d.sponsor_company || d.sponsor_id}</div>
                  <div className="text-xs text-(--text-secondary) mb-3">Host: {d.host_name || d.host_id}</div>
                  <div className="text-sm mb-3">Agreed Amount: {d.currency} {Number(d.agreed_amount || 0).toFixed(2)}</div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-outline-luxury py-1 px-3 text-xs" onClick={() => setSelectedDealId(d.id)}>Open Thread</button>
                    <button className="btn-outline-luxury py-1 px-3 text-xs" onClick={() => updateDealStatus(d.id, 'active')}>Set Active</button>
                    <button className="btn-outline-luxury py-1 px-3 text-xs" onClick={() => updateDealStatus(d.id, 'completed')}>Complete</button>
                    <button className="btn-outline-luxury py-1 px-3 text-xs" onClick={() => updateDealStatus(d.id, 'cancelled')}>Cancel</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass p-6 rounded-3xl border border-(--line-color)">
            <div className="micro-label mb-3">Deal Messaging</div>
            {!selectedDealId ? (
              <div className="text-sm text-(--text-secondary)">Select a deal to open its message thread.</div>
            ) : (
              <>
                <div className="space-y-2 max-h-88 overflow-y-auto mb-4">
                  {dealMessages.map((m) => (
                    <div key={m.id} className="p-3 rounded-xl border border-white/10 bg-white/5">
                      <div className="text-[10px] uppercase tracking-widest text-(--text-secondary)">{m.sender_name || m.sender_user_id}</div>
                      <div className="text-sm">{m.message}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    className="input-luxury"
                    placeholder="Write a deal message"
                    value={dealMessageInput}
                    onChange={(e) => setDealMessageInput(e.target.value)}
                  />
                  <button className="btn-luxury py-2 px-4 text-xs" onClick={sendDealMessage}>Send</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const SponsorDashboard = ({ user }: { user: UserType | null }) => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Sponsor | null>(null);
  const [pendingIncomingRequests, setPendingIncomingRequests] = useState(0);
  const [events, setEvents] = useState<Array<EventType & { analytics?: EventAnalyticsSnapshot }>>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<string>('');
  const [messages, setMessages] = useState<DealMessage[]>([]);
  const [spots, setSpots] = useState<SponsorSpot[]>([]);
  const [spotEventId, setSpotEventId] = useState<string>('');
  const [bidBySpot, setBidBySpot] = useState<Record<string, string>>({});

  const [profileForm, setProfileForm] = useState({ company_name: '', website: '', contact_email: '' });
  const [proposalForm, setProposalForm] = useState({ event_id: '', proposal_amount: '', message: '' });
  const [dealMessage, setDealMessage] = useState('');

  const refreshDeals = async () => {
    const res = await fetch('/api/sponsorship/deals', withAuth());
    if (res.ok) {
      const rows = await res.json();
      setDeals(Array.isArray(rows) ? rows : []);
    }
  };

  const refreshPendingIncoming = async () => {
    const count = await fetchPendingSponsorshipCount(withAuth, 'incoming');
    setPendingIncomingRequests(count);
  };

  const refreshEvents = async () => {
    const res = await fetch('/api/analytics/events?limit=100', withAuth());
    if (res.ok) {
      const rows = await res.json();
      setEvents(Array.isArray(rows) ? rows : []);
    }
  };

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (user.role !== 'sponsor') {
      navigate('/');
      return;
    }

    const bootstrap = async () => {
      const profileRes = await fetch('/api/sponsors/profile', withAuth());
      if (profileRes.ok) {
        const p = await profileRes.json();
        setProfile(p);
        await Promise.all([refreshEvents(), refreshDeals(), refreshPendingIncoming()]);
      }
    };

    bootstrap();
  }, [user, navigate]);

  useEffect(() => {
    if (!selectedDealId) {
      setMessages([]);
      return;
    }

    fetch(`/api/sponsorship/deals/${selectedDealId}/messages`, withAuth())
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => setMessages(Array.isArray(rows) ? rows : []));
  }, [selectedDealId]);

  const createProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/sponsors/profile', withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileForm),
    }));
    if (res.ok) {
      const p = await res.json();
      setProfile(p);
      await Promise.all([refreshEvents(), refreshDeals()]);
    }
  };

  const submitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/sponsorship/requests', withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: proposalForm.event_id,
        proposal_amount: Number(proposalForm.proposal_amount || 0),
        message: proposalForm.message,
      }),
    }));
    if (res.ok) {
      setProposalForm({ event_id: '', proposal_amount: '', message: '' });
      await refreshDeals();
    }
  };

  const sendDealMessage = async () => {
    if (!selectedDealId || !dealMessage.trim()) return;
    const res = await fetch(`/api/sponsorship/deals/${selectedDealId}/messages`, withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: dealMessage.trim() }),
    }));
    if (res.ok) {
      setDealMessage('');
      const refreshed = await fetch(`/api/sponsorship/deals/${selectedDealId}/messages`, withAuth());
      if (refreshed.ok) {
        const rows = await refreshed.json();
        setMessages(Array.isArray(rows) ? rows : []);
      }
    }
  };

  const loadSpots = async (eventId: string) => {
    setSpotEventId(eventId);
    const res = await fetch(`/api/events/${eventId}/sponsor-spots`, withAuth());
    if (res.ok) {
      const rows = await res.json();
      setSpots(Array.isArray(rows) ? rows : []);
    }
  };

  const bookSpot = async (spotId: string) => {
    const res = await fetch(`/api/sponsor-spots/${spotId}/book`, withAuth({ method: 'POST' }));
    if (res.ok && spotEventId) {
      await Promise.all([loadSpots(spotEventId), refreshDeals()]);
    }
  };

  const placeBid = async (spotId: string) => {
    const amount = Number(bidBySpot[spotId] || 0);
    if (!amount || amount <= 0) return;
    const res = await fetch(`/api/sponsor-spots/${spotId}/bid`, withAuth({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    }));
    if (res.ok && spotEventId) {
      await loadSpots(spotEventId);
      setBidBySpot((prev) => ({ ...prev, [spotId]: '' }));
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="pt-40 pb-24 max-w-7xl mx-auto px-6 lg:px-12 space-y-10">
      <div>
        <div className="micro-label mb-3">Sponsor Console</div>
        <h1 className="font-display font-bold text-5xl tracking-tight uppercase">Sponsor Dashboard</h1>
        <div className="mt-3 inline-flex items-center gap-3 px-4 py-2 rounded-full border border-brand-500/30 bg-brand-500/10 text-xs font-bold uppercase tracking-widest">
          Pending Incoming Requests
          <span className="min-w-5 h-5 px-1 rounded-full bg-brand-500 text-black text-[10px] flex items-center justify-center">
            {pendingIncomingRequests > 99 ? '99+' : pendingIncomingRequests}
          </span>
        </div>
      </div>

      {!profile ? (
        <div className="glass p-8 rounded-3xl border border-(--line-color)">
          <h2 className="font-display font-bold text-2xl uppercase mb-6">Create Sponsor Profile</h2>
          <form onSubmit={createProfile} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              className="input-luxury"
              placeholder="Company name"
              value={profileForm.company_name}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, company_name: e.target.value }))}
              required
            />
            <input
              className="input-luxury"
              placeholder="Website"
              value={profileForm.website}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, website: e.target.value }))}
            />
            <input
              className="input-luxury md:col-span-2"
              placeholder="Contact email"
              value={profileForm.contact_email}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, contact_email: e.target.value }))}
            />
            <div className="md:col-span-2 flex justify-end">
              <button type="submit" className="btn-luxury px-6 py-3 text-sm">Create Sponsor Profile</button>
            </div>
          </form>
        </div>
      ) : (
        <>
          <div className="glass p-8 rounded-3xl border border-(--line-color)">
            <div className="micro-label mb-2">Sponsor Profile</div>
            <div className="text-xl font-bold">{profile.company_name}</div>
            <div className="text-sm text-(--text-secondary)">Status: {profile.approved ? 'Approved' : 'Disabled'}</div>
          </div>

          <div className="glass p-8 rounded-3xl border border-(--line-color)">
            <h2 className="font-display font-bold text-2xl uppercase mb-6">Submit Sponsorship Proposal</h2>
            <form onSubmit={submitProposal} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <select
                className="input-luxury"
                value={proposalForm.event_id}
                onChange={(e) => setProposalForm((prev) => ({ ...prev, event_id: e.target.value }))}
                required
              >
                <option value="">Select event</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
              <input
                className="input-luxury"
                placeholder="Amount"
                type="number"
                min={1}
                value={proposalForm.proposal_amount}
                onChange={(e) => setProposalForm((prev) => ({ ...prev, proposal_amount: e.target.value }))}
                required
              />
              <input
                className="input-luxury"
                placeholder="Message"
                value={proposalForm.message}
                onChange={(e) => setProposalForm((prev) => ({ ...prev, message: e.target.value }))}
              />
              <div className="md:col-span-2 flex justify-end">
                <button type="submit" className="btn-luxury px-6 py-3 text-sm">Send Proposal</button>
              </div>
            </form>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="glass p-6 rounded-3xl border border-(--line-color)">
              <div className="micro-label mb-4">Event Discovery & Analytics</div>
              <div className="space-y-3 max-h-120 overflow-y-auto">
                {events.map((ev) => (
                  <div key={ev.id} className="p-4 rounded-2xl border border-white/10 bg-white/5">
                    <div className="font-bold mb-1">{ev.name}</div>
                    <div className="text-xs text-(--text-secondary) mb-3">{new Date(ev.date).toLocaleString()} · {ev.venue}</div>
                    <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                      <div>Regs: <span className="font-bold">{ev.analytics?.total_registrations || 0}</span></div>
                      <div>Views: <span className="font-bold">{ev.analytics?.engagement?.views || 0}</span></div>
                      <div>Conv: <span className="font-bold">{ev.analytics?.conversion_rate || 0}%</span></div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setProposalForm((prev) => ({ ...prev, event_id: ev.id }))}
                        className="btn-luxury py-1 px-3 text-xs"
                      >
                        Sponsor Event
                      </button>
                      <button onClick={() => loadSpots(ev.id)} className="btn-outline-luxury py-1 px-3 text-xs">View Spots</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass p-6 rounded-3xl border border-(--line-color)">
              <div className="micro-label mb-4">Proposals & Negotiation Threads</div>
              <div className="space-y-3 max-h-64 overflow-y-auto mb-4">
                {deals.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setSelectedDealId(d.id)}
                    className={`w-full text-left p-3 rounded-xl border ${selectedDealId === d.id ? 'border-brand-500/40 bg-brand-500/10' : 'border-white/10 bg-white/5'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-sm">{d.event_name || d.event_id}</div>
                      <span className="text-[10px] uppercase tracking-widest">{d.status}</span>
                    </div>
                    <div className="text-xs text-(--text-secondary)">{d.event_name || d.event_id}</div>
                  </button>
                ))}
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
                {messages.map((m) => (
                  <div key={m.id} className="p-2 rounded-lg bg-white/5 border border-white/5">
                    <div className="text-[10px] uppercase tracking-widest text-(--text-secondary)">{m.sender_name || 'Sender'}</div>
                    <div className="text-sm">{m.message}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className="input-luxury"
                  placeholder="Send negotiation message"
                  value={dealMessage}
                  onChange={(e) => setDealMessage(e.target.value)}
                />
                <button onClick={sendDealMessage} className="btn-luxury px-4 py-2 text-xs">Send</button>
              </div>
            </div>
          </div>

          {spotEventId && (
            <div className="glass p-6 rounded-3xl border border-(--line-color)">
              <div className="micro-label mb-4">Spot Booking & Premium Bidding</div>
              <div className="space-y-3">
                {spots.map((spot) => (
                  <div key={spot.id} className="p-4 rounded-2xl border border-white/10 bg-white/5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-bold">{spot.label}</div>
                        <div className="text-xs text-(--text-secondary)">{spot.spot_type} · ${Number(spot.base_price || 0).toFixed(2)} · {spot.status}</div>
                      </div>
                      {!spot.is_premium ? (
                        <button
                          className="btn-outline-luxury py-1 px-3 text-xs"
                          disabled={spot.status !== 'open'}
                          onClick={() => bookSpot(spot.id)}
                        >
                          Book Spot
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            className="input-luxury w-32"
                            type="number"
                            min={1}
                            placeholder="Bid"
                            value={bidBySpot[spot.id] || ''}
                            onChange={(e) => setBidBySpot((prev) => ({ ...prev, [spot.id]: e.target.value }))}
                          />
                          <button
                            className="btn-luxury py-2 px-3 text-xs"
                            disabled={spot.status !== 'open'}
                            onClick={() => placeBid(spot.id)}
                          >
                            Place Bid
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const AdminSponsorshipDashboard = ({ user }: { user: UserType | null }) => {
  const navigate = useNavigate();
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [revenue, setRevenue] = useState<{ accepted_revenue?: number; accepted_deals?: number; total_deals?: number }>({});
  const [pendingRequests, setPendingRequests] = useState(0);
  const [spotId, setSpotId] = useState('');
  const [spotBids, setSpotBids] = useState<Bid[]>([]);

  const refresh = async () => {
    const [sponsorsRes, dealsRes, revRes, pendingRes] = await Promise.all([
      fetch('/api/admin/sponsors', withAuth()),
      fetch('/api/sponsorship/deals', withAuth()),
      fetch('/api/admin/sponsorship/revenue', withAuth()),
      fetch('/api/admin/sponsorship/requests/pending-count', withAuth()),
    ]);

    if (sponsorsRes.ok) {
      const rows = await sponsorsRes.json();
      setSponsors(Array.isArray(rows) ? rows : []);
    }
    if (dealsRes.ok) {
      const rows = await dealsRes.json();
      setDeals(Array.isArray(rows) ? rows : []);
    }
    if (revRes.ok) {
      setRevenue(await revRes.json());
    }
    if (pendingRes.ok) {
      const payload = await pendingRes.json();
      setPendingRequests(Number(payload?.pending_count || 0));
    }
  };

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/');
      return;
    }
    refresh();
  }, [user, navigate]);

  const setSponsorStatus = async (id: string, action: 'approve' | 'reject') => {
    const res = await fetch(`/api/admin/sponsors/${id}/${action}`, withAuth({ method: 'POST' }));
    if (res.ok) {
      await refresh();
    }
  };

  const loadBids = async () => {
    if (!spotId.trim()) return;
    const res = await fetch(`/api/sponsor-spots/${spotId.trim()}/bids`, withAuth());
    if (res.ok) {
      const rows = await res.json();
      setSpotBids(Array.isArray(rows) ? rows : []);
    }
  };

  const overrideBid = async (bidId: string) => {
    const res = await fetch(`/api/admin/bids/${bidId}/override`, withAuth({ method: 'POST' }));
    if (res.ok) {
      await loadBids();
      await refresh();
    }
  };

  return (
    <div className="pt-40 pb-24 max-w-7xl mx-auto px-6 lg:px-12 space-y-8">
      <div>
        <div className="micro-label mb-3">Admin</div>
        <h1 className="font-display font-bold text-5xl uppercase tracking-tight">Sponsorship Control</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass p-6 rounded-2xl border border-(--line-color)">
          <div className="micro-label mb-2">Accepted Revenue</div>
          <div className="text-3xl font-display font-bold">${Number(revenue.accepted_revenue || 0).toFixed(2)}</div>
        </div>
        <div className="glass p-6 rounded-2xl border border-(--line-color)">
          <div className="micro-label mb-2">Accepted Deals</div>
          <div className="text-3xl font-display font-bold">{Number(revenue.accepted_deals || 0)}</div>
        </div>
        <div className="glass p-6 rounded-2xl border border-(--line-color)">
          <div className="micro-label mb-2">Total Deals</div>
          <div className="text-3xl font-display font-bold">{Number(revenue.total_deals || 0)}</div>
        </div>
        <div className="glass p-6 rounded-2xl border border-(--line-color)">
          <div className="micro-label mb-2">Pending Requests</div>
          <div className="text-3xl font-display font-bold">{pendingRequests}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="glass p-6 rounded-3xl border border-(--line-color)">
          <div className="micro-label mb-4">Sponsor Approvals</div>
          <div className="space-y-3 max-h-112 overflow-y-auto">
            {sponsors.map((s) => (
              <div key={s.id} className="p-3 rounded-xl border border-white/10 bg-white/5 flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold">{s.company_name}</div>
                  <div className="text-xs text-(--text-secondary)">{s.contact_email || 'No email'} · {s.approved ? 'Approved' : 'Disabled'}</div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-outline-luxury py-1 px-3 text-xs" onClick={() => setSponsorStatus(s.id, 'approve')}>Approve</button>
                  <button className="btn-outline-luxury py-1 px-3 text-xs" onClick={() => setSponsorStatus(s.id, 'reject')}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass p-6 rounded-3xl border border-(--line-color)">
          <div className="micro-label mb-4">Deal Monitoring</div>
          <div className="space-y-3 max-h-112 overflow-y-auto">
            {deals.map((d) => (
              <div key={d.id} className="p-3 rounded-xl border border-white/10 bg-white/5">
                <div className="flex items-center justify-between">
                  <div className="font-bold">{d.event_name || d.event_id}</div>
                  <span className="text-[10px] uppercase tracking-widest">{d.status}</span>
                </div>
                <div className="text-xs text-(--text-secondary)">{d.sponsor_company || d.sponsor_id} · ${Number(d.agreed_amount || 0).toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass p-6 rounded-3xl border border-(--line-color)">
        <div className="micro-label mb-3">Bid Override</div>
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <input
            className="input-luxury"
            placeholder="Enter sponsor spot ID"
            value={spotId}
            onChange={(e) => setSpotId(e.target.value)}
          />
          <button className="btn-outline-luxury py-2 px-4 text-xs" onClick={loadBids}>Load Bids</button>
        </div>
        <div className="space-y-2">
          {spotBids.map((b) => (
            <div key={b.id} className="p-3 rounded-xl border border-white/10 bg-white/5 flex items-center justify-between">
              <div className="text-sm">
                <span className="font-bold">{b.company_name || b.sponsor_id}</span> bid ${Number(b.amount || 0).toFixed(2)} ({b.status})
              </div>
              <button className="btn-luxury py-1 px-3 text-xs" onClick={() => overrideBid(b.id)}>
                <Gavel className="w-3 h-3" /> Override
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const NotFound = () => {
  const navigate = useNavigate();
  return (
    <div className="relative pt-32 pb-20 flex flex-col items-center justify-center min-h-[90vh] max-w-5xl mx-auto px-6 text-center overflow-hidden">
      {/* Premium Background Elements */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 w-full h-full pointer-events-none opacity-20">
        <div className="absolute top-0 left-1/4 w-72 h-72 bg-brand-500/30 blur-[100px] animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-indigo-500/20 blur-[100px] animate-pulse delay-1000" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', damping: 20 }}
        className="relative mb-10"
      >
        <div className="absolute inset-0 bg-brand-500/20 blur-3xl rounded-full" />
        <div className="relative w-24 h-24 glass rounded-full flex items-center justify-center border border-white/10 shadow-2xl">
          <AlertTriangle className="w-12 h-12 text-brand-500" strokeWidth={1} />
        </div>
      </motion.div>

      <div className="relative z-10 w-full max-w-3xl">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex justify-center gap-1 mb-2"
        >
          {['4', '0', '4'].map((char, index) => (
            <motion.span
              key={index}
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 + (index * 0.1), type: 'spring', stiffness: 200 }}
              className={`font-display font-bold text-8xl md:text-[10rem] tracking-tighter uppercase ${index === 1 ? 'text-brand-500' : 'text-zinc-100'}`}
            >
              {char}
            </motion.span>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="px-4"
        >
          <h2 className="font-display font-bold text-2xl md:text-3xl uppercase tracking-[0.2em] mb-4">Lost in the Hub?</h2>
          <p className="text-(--text-secondary) text-base md:text-lg font-medium mb-10 max-w-md mx-auto leading-relaxed opacity-80">
            This event seems to have vanished into the digital void. Let's get you back to the main stage.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(-1)}
              className="btn-outline-luxury w-full sm:w-64 py-4 text-xs uppercase tracking-widest font-bold"
            >
              Take a Step Back
            </motion.button>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }} className="w-full sm:w-64">
              <Link to="/" className="btn-luxury block w-full py-4 text-xs uppercase tracking-widest font-bold">
                Return to Surface
              </Link>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* Subtle Grid Overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-5 -z-20" style={{ backgroundImage: 'radial-gradient(var(--brand-500) 1px, transparent 0)', backgroundSize: '40px 40px' }} />
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<UserType | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  const handleLogin = (u: UserType, token?: string) => {
    setUser(u);
    localStorage.setItem('user', JSON.stringify(u));
    if (token) {
      localStorage.setItem('authToken', token);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('authToken');
  };

  const handleUpdateUser = (u: UserType) => {
    setUser(u);
    localStorage.setItem('user', JSON.stringify(u));
  };

  return (
    <ThemeProvider>
      <Router>
        <div className="min-h-screen selection:bg-brand-500/30">
          <Navbar user={user} onLogout={handleLogout} />
          <main>
            <Routes>
              <Route path="/" element={<Home user={user} />} />
              <Route path="/events" element={<Events user={user} />} />
              <Route path="/events/:id" element={<EventDetails user={user} />} />
              <Route path="/login" element={<Login onLogin={handleLogin} />} />
              <Route path="/register" element={<Register onLogin={handleLogin} />} />
              <Route path="/my-bookings" element={<MyBookings user={user} />} />
              <Route path="/tickets/:id" element={<TicketPage user={user} />} />
              <Route path="/wishlist" element={<WishlistPage user={user} />} />
              <Route path="/profile" element={<Profile user={user} onUpdate={handleUpdateUser} />} />
              <Route path="/host/dashboard" element={<HostDashboard user={user} />} />
              <Route path="/host/scanner" element={<HostScanner user={user} />} />
              <Route path="/host/analytics" element={<HostAnalytics user={user} />} />
              <Route path="/host/events/:id/attendees" element={<HostAttendees user={user} />} />
              <Route path="/sponsorship/requests" element={<SponsorshipRequestsCenter user={user} />} />
              <Route path="/sponsor/dashboard" element={<SponsorDashboard user={user} />} />
              <Route path="/admin/dashboard" element={<AdminDashboard user={user} />} />
              <Route path="/admin/sponsorship" element={<AdminSponsorshipDashboard user={user} />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/communities" element={<Communities user={user} />} />
              <Route path="/communities/:id" element={<CommunityDetail user={user} />} />
              <Route path="/users/:id" element={<UserProfile user={user} />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          
          <footer className="glass border-t border-white/10 py-20 mt-32">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-16 mb-16">
              <div className="md:col-span-1">
                <Link to="/" className="flex items-center gap-3 mb-8 group">
                  <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/20">
                    <Ticket className="text-white w-6 h-6" />
                  </div>
                  <span className="font-display font-bold text-2xl tracking-tight">EventHub</span>
                </Link>
                <p className="text-zinc-500 text-sm leading-relaxed mb-8">
                  The ultimate platform for college events. Discover, book, and host with ease. Join thousands of students experiencing campus life to the fullest.
                </p>
                <div className="flex gap-4">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="w-10 h-10 glass rounded-xl flex items-center justify-center hover:bg-brand-500/20 hover:border-brand-500/50 cursor-pointer transition-all">
                      <div className="w-5 h-5 bg-zinc-700 rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-display font-bold text-lg mb-8">Quick Links</h4>
                <ul className="space-y-4 text-sm text-zinc-500">
                  <li><Link to="/events" className="hover:text-brand-500 transition-colors">Browse Events</Link></li>
                  <li><Link to="/categories" className="hover:text-brand-500 transition-colors">Categories</Link></li>
                  <li><Link to="/register?role=host" className="hover:text-brand-500 transition-colors">Host an Event</Link></li>
                  <li><Link to="/login" className="hover:text-brand-500 transition-colors">Login / Register</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-display font-bold text-lg mb-8">Support</h4>
                <ul className="space-y-4 text-sm text-zinc-500">
                  <li><a href="#" className="hover:text-brand-500 transition-colors">Help Center</a></li>
                  <li><a href="#" className="hover:text-brand-500 transition-colors">Terms of Service</a></li>
                  <li><a href="#" className="hover:text-brand-500 transition-colors">Privacy Policy</a></li>
                  <li><a href="#" className="hover:text-brand-500 transition-colors">Cookie Settings</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-display font-bold text-lg mb-8">Newsletter</h4>
                <p className="text-zinc-500 text-sm mb-6">Get the latest event updates delivered to your inbox.</p>
                <div className="relative">
                  <input type="email" placeholder="Email address" className="w-full px-4 py-3 glass rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500" />
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-brand-500 rounded-lg text-white">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className="pt-10 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6 text-zinc-600 text-xs">
              <p>© 2026 EventHub. Built with ❤️ for campus life.</p>
              <div className="flex gap-8">
                <a href="#" className="hover:text-zinc-400 transition-colors">Twitter</a>
                <a href="#" className="hover:text-zinc-400 transition-colors">Instagram</a>
                <a href="#" className="hover:text-zinc-400 transition-colors">LinkedIn</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </Router>
    </ThemeProvider>
  );
}
