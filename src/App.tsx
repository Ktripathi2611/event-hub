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
  Sun,
  Moon,
  Upload
} from 'lucide-react';
import { motion, AnimatePresence, useScroll, useTransform, useSpring } from 'motion/react';
import { User as UserType, Event as EventType, Category, Booking, TicketType } from './types';

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
        className="input-luxury py-4 px-6 min-h-[120px] resize-none"
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
        className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest hover:text-rose-500 transition-colors flex items-center gap-2"
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
              className="relative w-full max-w-lg glass p-10 rounded-[3rem] border border-[var(--line-color)] shadow-2xl"
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
                  <p className="text-[var(--text-secondary)] text-sm leading-relaxed">Please provide a reason for reporting this event. Our team will review it shortly.</p>
                  <textarea 
                    required
                    placeholder="Why are you reporting this event?"
                    className="input-luxury py-4 px-6 min-h-[150px] resize-none"
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
  const { theme, toggleTheme } = React.useContext(ThemeContext);
  const location = useLocation();

  const navLinks = [
    { name: 'Events', path: '/events', icon: Calendar },
    { name: 'Categories', path: '/categories', icon: TrendingUp },
  ];

  if (user) {
    navLinks.push({ name: 'My Bookings', path: '/my-bookings', icon: Ticket });
    if (user.role === 'host') {
      navLinks.push({ name: 'Host Dashboard', path: '/host/dashboard', icon: LayoutDashboard });
    }
    if (user.role === 'admin') {
      navLinks.push({ name: 'Admin Panel', path: '/admin/dashboard', icon: ShieldCheck });
    }
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-[var(--line-color)]">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="flex items-center justify-between h-24">
          <Link to="/" className="flex items-center gap-4 group">
            <div className="w-12 h-12 bg-[var(--text-primary)] rounded-full flex items-center justify-center shadow-2xl group-hover:scale-110 transition-all duration-500">
              <Ticket className="text-[var(--bg-color)] w-6 h-6" />
            </div>
            <span className="font-display font-black text-2xl uppercase tracking-tighter">EventHub</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-10">
            {navLinks.map((link) => (
              <Link 
                key={link.path} 
                to={link.path}
                className={`micro-label transition-all hover:opacity-100 ${location.pathname === link.path ? 'opacity-100 text-brand-500' : 'opacity-50'}`}
              >
                {link.name}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-8">
            <button 
              onClick={toggleTheme}
              className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            {user ? (
              <div className="flex items-center gap-6">
                <Link to="/profile" className="flex items-center gap-3 group">
                  <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:border-brand-500 transition-all">
                    <User className="w-4 h-4 text-[var(--text-secondary)] group-hover:text-brand-500" />
                  </div>
                  <span className="text-xs font-bold tracking-tight uppercase opacity-80">{user.name}</span>
                </Link>
                <button 
                  onClick={onLogout}
                  className="text-[var(--text-secondary)] hover:text-rose-500 transition-colors"
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
          <div className="md:hidden">
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
              className="fixed inset-0 bg-black/60 backdrop-blur-sm md:hidden"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-80 bg-zinc-950 border-l border-white/10 z-50 md:hidden p-8 flex flex-col"
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
                    {link.name}
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
      <div className="relative aspect-[4/5] rounded-[2rem] overflow-hidden mb-8 glass-card">
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

const Home = () => {
  const [events, setEvents] = useState<EventType[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
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
  }, []);

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
              <span className="w-12 h-px bg-[var(--line-color)]" />
              The Premier Campus Experience
              <span className="w-12 h-px bg-[var(--line-color)]" />
            </div>
            <h1 className="editorial-title mb-12">
              Live the <br />
              <span className="italic font-serif normal-case font-normal text-brand-500">Moment</span>
            </h1>
            <p className="text-[var(--text-secondary)] text-lg md:text-xl max-w-2xl mx-auto mb-16 leading-relaxed">
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
              <Link to={`/events?category=${cat.id}`} className="group relative aspect-square rounded-[2rem] overflow-hidden glass-card flex flex-col items-center justify-center p-8">
                <div className="text-5xl mb-6 group-hover:scale-110 transition-transform duration-500">{cat.icon}</div>
                <div className="font-display font-bold text-lg uppercase tracking-tight">{cat.name}</div>
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
    </div>
  );
};

const Events = () => {
  const [events, setEvents] = useState<EventType[]>([]);
  const [search, setSearch] = useState('');
  const [venue, setVenue] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const categoryId = queryParams.get('category');

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (categoryId) params.append('category', categoryId);
      if (venue) params.append('venue', venue);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const res = await fetch(`/api/events?${params.toString()}`);
      const data = await res.json();
      setEvents(data);
      setLoading(false);
    };
    fetchEvents();
  }, [categoryId, venue, startDate, endDate]);

  const filteredEvents = events.filter(e => 
    e.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="pt-40 pb-32 max-w-7xl mx-auto px-6 lg:px-12">
      <div className="mb-24">
        <div className="micro-label mb-6">Discovery</div>
        <h1 className="editorial-title mb-16">Find Your <span className="italic font-serif normal-case font-normal text-brand-500">Vibe</span></h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-2 relative group">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)] group-focus-within:text-brand-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Search event names..." 
              className="input-luxury pl-16 py-5 text-lg"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="relative group">
            <MapPin className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)] group-focus-within:text-brand-500 transition-colors" />
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
              <Skeleton className="aspect-[4/5] rounded-[2rem]" />
              <div className="space-y-4 px-4">
                <Skeleton className="h-10 w-3/4" />
                <Skeleton className="h-6 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredEvents.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {filteredEvents.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      ) : (
        <div className="text-center py-40 glass rounded-[3rem] border-dashed border-[var(--line-color)]">
          <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-8 border border-white/10">
            <Search className="w-10 h-10 text-[var(--text-secondary)]" />
          </div>
          <h3 className="font-display font-bold text-3xl mb-4 uppercase tracking-tight">No vibes found</h3>
          <p className="text-[var(--text-secondary)] max-w-md mx-auto text-lg">We couldn't find any events matching your criteria. Try adjusting your filters.</p>
        </div>
      )}
    </div>
  );
};

const Profile = ({ user, onUpdate }: { user: UserType | null, onUpdate: (u: UserType) => void }) => {
  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) navigate('/login');
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/auth/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user?.id, name, bio })
    });
    if (res.ok) {
      const updatedUser = await res.json();
      onUpdate(updatedUser);
      setMessage('Profile updated successfully!');
      setTimeout(() => setMessage(''), 3000);
    }
    setLoading(false);
  };

  if (!user) return null;

  return (
    <div className="pt-40 pb-32 max-w-5xl mx-auto px-6 lg:px-12">
      <div className="flex flex-col md:flex-row items-start md:items-center gap-12 mb-24">
        <div className="w-32 h-32 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shadow-2xl relative group">
          <User className="w-16 h-16 text-[var(--text-secondary)] group-hover:text-brand-500 transition-colors" />
          <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-brand-500 rounded-full flex items-center justify-center border-4 border-[var(--bg-color)]">
            <Award className="w-5 h-5 text-white" />
          </div>
        </div>
        <div>
          <div className="micro-label mb-4">Account Profile</div>
          <h1 className="font-display font-bold text-5xl md:text-7xl tracking-tighter uppercase mb-4">{user.name}</h1>
          <div className="flex items-center gap-6">
            <span className="px-4 py-1.5 bg-white/5 rounded-full text-[10px] font-bold uppercase tracking-widest text-brand-500 border border-brand-500/20">
              {user.role}
            </span>
            <span className="micro-label">Member since {new Date(user.created_at).getFullYear()}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-16">
        <div className="lg:col-span-2">
          <div className="glass p-12 rounded-[3rem] border border-[var(--line-color)]">
            <h2 className="font-display font-bold text-3xl mb-12 uppercase tracking-tight flex items-center gap-4">
              <Edit3 className="w-8 h-8 text-brand-500" /> Personal Details
            </h2>
            
            {message && <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-sm rounded-2xl mb-12 flex items-center gap-3">
              <CheckCircle className="w-5 h-5" /> {message}
            </div>}

            <form onSubmit={handleSubmit} className="space-y-10">
              <div>
                <label className="micro-label mb-4 block">Display Name</label>
                <input 
                  type="text" 
                  className="input-luxury"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="micro-label mb-4 block">Bio</label>
                <textarea 
                  rows={5}
                  placeholder="Tell us about yourself..."
                  className="input-luxury resize-none"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
              </div>
              <button type="submit" disabled={loading} className="btn-luxury px-16 py-4">
                {loading ? 'Saving...' : 'Update Profile'}
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-8">
          <div className="glass p-10 rounded-[2.5rem] border border-[var(--line-color)]">
            <div className="micro-label mb-8">Statistics</div>
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-6 border-b border-[var(--line-color)]">
                <span className="text-[var(--text-secondary)] text-sm font-medium">Role</span>
                <span className="font-bold uppercase tracking-tight text-sm">{user.role}</span>
              </div>
              {user.role === 'host' && (
                <div className="flex items-center justify-between pb-6 border-b border-[var(--line-color)]">
                  <span className="text-[var(--text-secondary)] text-sm font-medium">Organization</span>
                  <span className="font-bold uppercase tracking-tight text-sm">{user.host_org_name}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-secondary)] text-sm font-medium">Status</span>
                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase rounded-full border border-emerald-500/20">Active</span>
              </div>
            </div>
          </div>
          
          <div className="glass p-10 rounded-[2.5rem] border border-[var(--line-color)] bg-linear-to-br from-brand-500/5 to-transparent">
            <Award className="w-10 h-10 text-brand-500 mb-6" />
            <h3 className="font-display font-bold text-xl uppercase tracking-tight mb-4">Campus Legend</h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">You've joined the EventHub elite. Attend more events to unlock exclusive rewards and badges.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const EventDetails = ({ user }: { user: UserType | null }) => {
  const { id: eventId } = useParams();
  const [event, setEvent] = useState<EventType | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [bookingStatus, setBookingStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`/api/events/${eventId}`).then(res => res.json()).then(setEvent);
  }, [eventId]);

  const handleBooking = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (!selectedTicket) return;

    setBookingStatus('loading');
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.id,
        event_id: eventId,
        ticket_type_id: selectedTicket,
        quantity
      })
    });
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

  if (!event) return <div className="pt-40 text-center animate-pulse">Loading event details...</div>;

  const selectedTicketData = event.ticketTypes?.find(t => t.id === selectedTicket);

  return (
    <div className="pt-40 pb-32 max-w-7xl mx-auto px-6 lg:px-12">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-20">
        {/* Left Content */}
        <div className="lg:col-span-2">
          <div className="relative aspect-21/9 rounded-[3rem] overflow-hidden mb-16 glass border border-[var(--line-color)] shadow-2xl">
            <img 
              src={event.image || `https://picsum.photos/seed/${event.id}/1200/600`} 
              alt={event.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-linear-to-t from-[var(--bg-color)] via-transparent to-transparent opacity-80" />
          </div>
          
          <div className="flex flex-wrap items-center gap-6 mb-10">
            <span className="px-5 py-2 bg-brand-500/10 text-brand-500 text-[10px] font-bold uppercase tracking-[0.2em] rounded-full border border-brand-500/20">
              {event.category_name}
            </span>
            <div className="flex items-center gap-3 text-[var(--text-secondary)] text-sm font-medium">
              <Clock className="w-4 h-4 text-brand-500" />
              {new Date(event.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="flex items-center gap-3 text-[var(--text-secondary)] text-sm font-medium">
              <TrendingUp className="w-4 h-4 text-brand-500" />
              {event.total_seats - event.available_seats} People Attending
            </div>
          </div>

          <h1 className="editorial-title mb-12 text-6xl md:text-7xl lg:text-8xl">{event.name}</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-20">
            <div className="glass p-10 rounded-[2.5rem] flex items-start gap-6 group hover:border-brand-500/30 transition-all border border-[var(--line-color)]">
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
                  <Plus className="w-3 h-3" /> Add to Calendar
                </a>
              </div>
            </div>
            <div className="glass p-10 rounded-[2.5rem] flex items-start gap-6 group hover:border-brand-500/30 transition-all border border-[var(--line-color)]">
              <div className="w-16 h-16 bg-brand-500/10 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <MapPin className="w-8 h-8 text-brand-500" />
              </div>
              <div>
                <div className="micro-label mb-2">Venue</div>
                <div className="text-xl font-bold mb-3">{event.venue}</div>
                <button className="inline-flex items-center gap-2 text-[10px] font-bold text-brand-500 uppercase tracking-widest hover:text-brand-400 transition-colors">
                  <ArrowRight className="w-3 h-3" /> Get Directions
                </button>
              </div>
            </div>
          </div>

          <div className="mb-24">
            <div className="micro-label mb-8">About the Event</div>
            <p className="text-[var(--text-secondary)] text-xl leading-relaxed whitespace-pre-wrap font-medium">{event.description}</p>
          </div>

          {/* Host Info */}
          <div className="glass p-10 rounded-[3rem] mb-24 flex items-center gap-8 border border-[var(--line-color)]">
            <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
              <User className="w-10 h-10 text-[var(--text-secondary)]" />
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
                  <div key={faq.id} className="glass p-10 rounded-[2.5rem] border border-[var(--line-color)]">
                    <h4 className="font-display font-bold text-xl mb-4 uppercase tracking-tight">{faq.question}</h4>
                    <p className="text-[var(--text-secondary)] text-lg leading-relaxed font-medium">{faq.answer}</p>
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
                <span className="text-[var(--text-secondary)] text-sm font-medium">({event.reviews?.length || 0} reviews)</span>
              </div>
            </div>

            {user && (
              <div className="glass p-10 rounded-[2.5rem] border border-[var(--line-color)] mb-12 bg-linear-to-br from-brand-500/5 to-transparent">
                <h4 className="font-display font-bold text-xl mb-8 uppercase tracking-tight">Write a Review</h4>
                <ReviewForm eventId={event.id} userId={user.id} onReviewAdded={() => {
                  fetch(`/api/events/${eventId}`).then(res => res.json()).then(setEvent);
                }} />
              </div>
            )}

            <div className="grid grid-cols-1 gap-8">
              {event.reviews?.length ? event.reviews.map(review => (
                <div key={review.id} className="glass p-10 rounded-[2.5rem] border border-[var(--line-color)]">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                        <User className="w-6 h-6 text-[var(--text-secondary)]" />
                      </div>
                      <div className="font-bold text-lg">{review.user_name}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-4 h-4 ${i < review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-white/10'}`} />
                      ))}
                    </div>
                  </div>
                  <p className="text-[var(--text-secondary)] text-lg leading-relaxed font-medium">{review.comment}</p>
                </div>
              )) : (
                <div className="text-center py-20 glass rounded-[2.5rem] border-dashed border-[var(--line-color)]">
                  <MessageSquare className="w-12 h-12 text-[var(--text-secondary)]/20 mx-auto mb-6" />
                  <p className="text-[var(--text-secondary)] text-lg font-medium">No reviews yet. Be the first to share your experience!</p>
                </div>
              )}
            </div>
          </div>

          {/* Report Button */}
          {user && (
            <div className="flex justify-center">
              <ReportButton eventId={event.id} userId={user.id} />
            </div>
          )}
        </div>

        {/* Sidebar Booking */}
        <div className="lg:col-span-1">
          <div className="sticky top-40 glass p-12 rounded-[3.5rem] border border-[var(--line-color)] shadow-2xl bg-linear-to-br from-white/5 to-transparent">
            <h3 className="font-display text-3xl font-bold mb-10 tracking-tight uppercase">Reserve <span className="italic font-serif normal-case font-normal text-brand-500">Spot</span></h3>
            
            <div className="space-y-5 mb-12">
              {event.ticketTypes?.map(tt => (
                <label 
                  key={tt.id} 
                  className={`block p-8 rounded-[2rem] border-2 transition-all cursor-pointer relative overflow-hidden group ${selectedTicket === tt.id ? 'border-brand-500 bg-brand-500/5' : 'border-white/5 hover:border-white/20 bg-white/5'}`}
                >
                  <input 
                    type="radio" 
                    name="ticket" 
                    className="hidden" 
                    onChange={() => setSelectedTicket(tt.id)}
                    checked={selectedTicket === tt.id}
                  />
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-xl">{tt.name}</span>
                    <span className="text-brand-500 font-bold text-2xl">${tt.price}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-widest">
                      {tt.quantity - tt.sold} available
                    </div>
                    {selectedTicket === tt.id && (
                      <motion.div layoutId="active-tick" className="w-6 h-6 bg-brand-500 rounded-full flex items-center justify-center">
                        <CheckCircle className="w-4 h-4 text-white" />
                      </motion.div>
                    )}
                  </div>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-between mb-12 px-4">
              <span className="micro-label">Quantity</span>
              <div className="flex items-center gap-8">
                <button 
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-12 h-12 rounded-full glass flex items-center justify-center hover:bg-white/10 transition-colors text-xl font-bold border border-white/10"
                >
                  -
                </button>
                <span className="font-display font-bold text-3xl w-8 text-center">{quantity}</span>
                <button 
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-12 h-12 rounded-full glass flex items-center justify-center hover:bg-white/10 transition-colors text-xl font-bold border border-white/10"
                >
                  +
                </button>
              </div>
            </div>

            <div className="border-t border-[var(--line-color)] pt-10 mb-12">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[var(--text-secondary)] font-bold uppercase tracking-widest text-[10px]">Total Amount</span>
                <span className="text-4xl font-display font-bold text-white">
                  ${selectedTicketData ? (selectedTicketData.price * quantity).toFixed(2) : '0.00'}
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-secondary)] text-right uppercase tracking-widest font-bold">Includes all fees</p>
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
            
            <p className="mt-8 text-center text-[10px] text-[var(--text-secondary)] flex items-center justify-center gap-3 font-bold uppercase tracking-widest">
              <ShieldCheck className="w-4 h-4 text-brand-500" /> Secure checkout
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const Login = ({ onLogin }: { onLogin: (user: UserType) => void }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (res.ok) {
      const user = await res.json();
      onLogin(user);
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
        className="max-w-xl w-full glass p-16 rounded-[3rem] border border-[var(--line-color)] shadow-2xl"
      >
        <div className="text-center mb-16">
          <div className="w-20 h-20 bg-[var(--text-primary)] rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl">
            <Ticket className="text-[var(--bg-color)] w-10 h-10" />
          </div>
          <h1 className="font-display font-bold text-5xl mb-4 tracking-tighter uppercase">Welcome <span className="italic font-serif normal-case font-normal text-brand-500">Back</span></h1>
          <p className="text-[var(--text-secondary)] text-lg">Sign in to continue your campus journey.</p>
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
        <p className="mt-12 text-center text-sm text-[var(--text-secondary)] font-medium">
          New to EventHub? <Link to="/register" className="text-brand-500 font-bold hover:underline">Create an account</Link>
        </p>
      </motion.div>
    </div>
  );
};

const Register = ({ onLogin }: { onLogin: (user: UserType) => void }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'student' as 'student' | 'host',
    host_org_name: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    if (res.ok) {
      const user = await res.json();
      onLogin(user);
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
        className="max-w-xl w-full glass p-16 rounded-[3rem] border border-[var(--line-color)] shadow-2xl"
      >
        <div className="text-center mb-16">
          <h1 className="font-display font-bold text-5xl mb-4 tracking-tighter uppercase">Join <span className="italic font-serif normal-case font-normal text-brand-500">EventHub</span></h1>
          <p className="text-[var(--text-secondary)] text-lg">The heart of campus life starts here.</p>
        </div>
        
        {error && <div className="p-6 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm rounded-2xl mb-12 flex items-center gap-4">
          <XCircle className="w-6 h-6" /> {error}
        </div>}

        <form onSubmit={handleSubmit} className="space-y-10">
          <div className="flex p-2 glass rounded-2xl mb-12">
            <button 
              type="button"
              onClick={() => setFormData({ ...formData, role: 'student' })}
              className={`flex-1 py-4 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all ${formData.role === 'student' ? 'bg-[var(--text-primary)] text-[var(--bg-color)] shadow-2xl' : 'text-[var(--text-secondary)] hover:bg-white/5'}`}
            >
              Student
            </button>
            <button 
              type="button"
              onClick={() => setFormData({ ...formData, role: 'host' })}
              className={`flex-1 py-4 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all ${formData.role === 'host' ? 'bg-[var(--text-primary)] text-[var(--bg-color)] shadow-2xl' : 'text-[var(--text-secondary)] hover:bg-white/5'}`}
            >
              Host
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
          {formData.role === 'host' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-4"
            >
              <label className="micro-label mb-4 block">Organization Name</label>
              <input 
                type="text" 
                required
                placeholder="Event Masters"
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
        <p className="mt-12 text-center text-sm text-[var(--text-secondary)] font-medium">
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

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetch(`/api/bookings/user/${user.id}`)
      .then(res => res.json())
      .then(data => {
        setBookings(data);
        setLoading(false);
      });
  }, [user]);

  return (
    <div className="pt-40 pb-32 max-w-7xl mx-auto px-6 lg:px-12">
      <div className="flex items-end justify-between mb-24">
        <div>
          <div className="micro-label mb-4">My Collection</div>
          <h1 className="editorial-title mb-6">Your <span className="italic font-serif normal-case font-normal text-brand-500">Tickets</span></h1>
          <p className="text-[var(--text-secondary)] text-xl font-medium">Your upcoming experiences and past memories.</p>
        </div>
        <div className="hidden md:flex items-center gap-4 px-6 py-3 bg-white/5 rounded-full border border-white/10 text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-widest">
          <Ticket className="w-5 h-5 text-brand-500" /> {bookings.length} Total Tickets
        </div>
      </div>
      
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-80 rounded-[3rem]" />
          ))}
        </div>
      ) : bookings.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {bookings.map((booking) => (
            <motion.div 
              key={booking.id} 
              whileHover={{ y: -10 }}
              className="glass rounded-[3rem] overflow-hidden flex flex-col md:flex-row border border-[var(--line-color)] shadow-2xl group"
            >
              <div className="p-12 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-4 mb-8">
                    <span className="px-4 py-1.5 bg-brand-500/10 text-brand-500 text-[10px] font-bold uppercase tracking-[0.2em] rounded-full border border-brand-500/20">
                      {booking.ticket_type_name}
                    </span>
                    <span className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-[0.2em]">{booking.booking_ref}</span>
                  </div>
                  <h3 className="font-display font-bold text-3xl mb-6 group-hover:text-brand-500 transition-colors tracking-tight uppercase leading-tight">{booking.event_name}</h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 text-[var(--text-secondary)] text-sm font-medium">
                      <Calendar className="w-5 h-5 text-brand-500" />
                      <span>{new Date(booking.event_date!).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                    <div className="flex items-center gap-4 text-[var(--text-secondary)] text-sm font-medium">
                      <MapPin className="w-5 h-5 text-brand-500" />
                      <span className="line-clamp-1">{booking.venue}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-10 mt-10 border-t border-[var(--line-color)]">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Tickets: <span className="text-white font-bold">{booking.quantity}</span></div>
                  <div className="text-3xl font-display font-bold text-white">${booking.total_price.toFixed(2)}</div>
                </div>
              </div>
              <div className="bg-white p-12 flex flex-col items-center justify-center shrink-0 border-l border-[var(--line-color)] md:w-56">
                <div className="p-4 bg-white rounded-2xl shadow-inner border border-zinc-100 mb-6">
                  <img src={booking.qr_code} alt="QR Code" className="w-32 h-32" />
                </div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] text-center">Scan at Entry</span>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-40 glass rounded-[3rem] border-dashed border-[var(--line-color)]">
          <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-10 border border-white/10">
            <Ticket className="w-10 h-10 text-[var(--text-secondary)]" />
          </div>
          <h3 className="font-display font-bold text-3xl mb-4 uppercase tracking-tight">No tickets yet</h3>
          <p className="text-[var(--text-secondary)] mb-12 max-w-md mx-auto text-lg font-medium">Your ticket wallet is empty. Start exploring the most exciting campus events today!</p>
          <Link to="/events" className="btn-luxury px-12 py-5 text-lg">Browse Events</Link>
        </div>
      )}
    </div>
  );
};

const AdminDashboard = ({ user }: { user: UserType | null }) => {
  const [pendingEvents, setPendingEvents] = useState<EventType[]>([]);
  const [allEvents, setAllEvents] = useState<EventType[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'all' | 'reports'>('pending');
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/');
      return;
    }
    fetchData();
  }, [user, activeTab]);

  const fetchData = () => {
    if (activeTab === 'pending') fetch('/api/admin/events/pending').then(res => res.json()).then(data => Array.isArray(data) ? setPendingEvents(data) : setPendingEvents([]));
    if (activeTab === 'all') fetch('/api/events').then(res => res.json()).then(data => Array.isArray(data) ? setAllEvents(data) : setAllEvents([]));
    if (activeTab === 'reports') fetch('/api/admin/reports').then(res => res.json()).then(data => Array.isArray(data) ? setReports(data) : setReports([]));
  };

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    const res = await fetch(`/api/admin/events/${id}/${action}`, { method: 'POST' });
    if (res.ok) fetchData();
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm('Are you sure you want to delete this event? This will remove all bookings and data associated with it.')) return;
    const res = await fetch(`/api/admin/events/${id}`, { method: 'DELETE' });
    if (res.ok) fetchData();
  };

  const handleReportAction = async (id: string, action: 'approve' | 'dismiss') => {
    const res = await fetch(`/api/admin/reports/${id}/${action}`, { method: 'POST' });
    if (res.ok) fetchData();
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
            <p className="text-[var(--text-secondary)] text-lg font-medium">Moderate events and manage the platform.</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4 p-2 glass rounded-3xl border border-[var(--line-color)]">
          <button 
            onClick={() => setActiveTab('pending')}
            className={`px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'pending' ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20' : 'text-[var(--text-secondary)] hover:bg-white/5'}`}
          >
            Pending
          </button>
          <button 
            onClick={() => setActiveTab('all')}
            className={`px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'all' ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20' : 'text-[var(--text-secondary)] hover:bg-white/5'}`}
          >
            All Events
          </button>
          <button 
            onClick={() => setActiveTab('reports')}
            className={`px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'reports' ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20' : 'text-[var(--text-secondary)] hover:bg-white/5'}`}
          >
            Reports
          </button>
        </div>
      </div>

      <div className="glass rounded-[3rem] overflow-hidden border border-[var(--line-color)] shadow-2xl">
        {activeTab === 'pending' && (
          <>
            <div className="p-10 border-b border-[var(--line-color)] flex items-center justify-between bg-white/5">
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
                  <tbody className="divide-y divide-[var(--line-color)]">
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
                        <td className="p-8 text-[var(--text-secondary)] font-medium">{event.host_name}</td>
                        <td className="p-8 text-[var(--text-secondary)] font-medium">{new Date(event.date).toLocaleDateString()}</td>
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
                <p className="text-[var(--text-secondary)] text-lg font-medium">No events are waiting for approval at the moment.</p>
              </div>
            )}
          </>
        )}

        {activeTab === 'all' && (
          <>
            <div className="p-10 border-b border-[var(--line-color)] flex items-center justify-between bg-white/5">
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
                <tbody className="divide-y divide-[var(--line-color)]">
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
                      <td className="p-8 text-[var(--text-secondary)] font-medium">{event.host_name}</td>
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
            <div className="p-10 border-b border-[var(--line-color)] flex items-center justify-between bg-white/5">
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
                  <tbody className="divide-y divide-[var(--line-color)]">
                    {reports.map(report => (
                      <tr key={report.id} className="hover:bg-white/5 transition-colors group">
                        <td className="p-8 font-bold text-lg">{report.event_name}</td>
                        <td className="p-8 text-[var(--text-secondary)] font-medium">{report.user_name}</td>
                        <td className="p-8 text-[var(--text-secondary)] font-medium max-w-xs truncate">{report.reason}</td>
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
                              className="px-6 py-2 bg-white/5 text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-widest rounded-xl border border-white/10 hover:bg-white/10 transition-all"
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
                <p className="text-[var(--text-secondary)] text-lg font-medium">No active reports to review.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const HostDashboard = ({ user }: { user: UserType | null }) => {
  const [events, setEvents] = useState<EventType[]>([]);
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
    const res = await fetch(`/api/host/events/${eventId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, host_id: user?.id })
    });
    if (res.ok) {
      fetchEvents();
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm('Are you sure you want to delete this event? This will remove all bookings and data associated with it.')) return;
    const res = await fetch(`/api/admin/events/${id}`, { method: 'DELETE' }); // Using the same admin endpoint as it handles the logic
    if (res.ok) fetchEvents();
  };

  return (
    <div className="pt-40 pb-32 max-w-7xl mx-auto px-6 lg:px-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-10 mb-24">
        <div>
          <div className="micro-label mb-4">Host Center</div>
          <h1 className="editorial-title mb-6 text-5xl md:text-6xl">Host <span className="italic font-serif normal-case font-normal text-brand-500">Dashboard</span></h1>
          <p className="text-[var(--text-secondary)] text-xl font-medium">Manage your events and track ticket sales in real-time.</p>
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
          <div key={event.id} className="glass rounded-[3rem] overflow-hidden border border-[var(--line-color)] group shadow-2xl">
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
                  <div className="text-[var(--text-secondary)] font-bold uppercase tracking-widest text-[10px]">Tickets Sold</div>
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
              <div className="mt-10 pt-8 border-t border-[var(--line-color)] flex items-center justify-between">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-brand-500" />
                  {new Date(event.date).toLocaleDateString()}
                </div>
                <div className="flex gap-4">
                  {event.status === 'approved' && (
                    <>
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
              className="absolute inset-0 bg-[var(--bg-color)]/95 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 40 }}
              className="relative w-full max-w-4xl glass p-12 rounded-[3.5rem] border border-[var(--line-color)] shadow-2xl max-h-[90vh] overflow-y-auto"
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
                    className="relative aspect-21/9 rounded-[2.5rem] border-2 border-dashed border-[var(--line-color)] hover:border-brand-500/50 transition-all cursor-pointer flex flex-col items-center justify-center gap-6 group overflow-hidden bg-white/5"
                  >
                    {imageFile ? (
                      <img src={URL.createObjectURL(imageFile)} className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform border border-white/10">
                          <Upload className="w-10 h-10 text-[var(--text-secondary)]" />
                        </div>
                        <div className="text-center">
                          <div className="micro-label text-[var(--text-secondary)]">Click to upload poster</div>
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

                <div className="border-t border-[var(--line-color)] pt-10">
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
                      <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-6 p-8 glass rounded-[2rem] border border-[var(--line-color)]">
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

                <div className="border-t border-[var(--line-color)] pt-10">
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
                      <div key={index} className="space-y-4 p-8 glass rounded-[2rem] border border-[var(--line-color)]">
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
                          className="input-luxury text-sm min-h-[100px] resize-none"
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

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<UserType | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  const handleLogin = (u: UserType) => {
    setUser(u);
    localStorage.setItem('user', JSON.stringify(u));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
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
              <Route path="/" element={<Home />} />
              <Route path="/events" element={<Events />} />
              <Route path="/events/:id" element={<EventDetails user={user} />} />
              <Route path="/login" element={<Login onLogin={handleLogin} />} />
              <Route path="/register" element={<Register onLogin={handleLogin} />} />
              <Route path="/my-bookings" element={<MyBookings user={user} />} />
              <Route path="/profile" element={<Profile user={user} onUpdate={handleUpdateUser} />} />
              <Route path="/host/dashboard" element={<HostDashboard user={user} />} />
              <Route path="/admin/dashboard" element={<AdminDashboard user={user} />} />
              <Route path="/categories" element={<div className="pt-40 text-center text-zinc-500">Categories Page (Coming Soon)</div>} />
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
