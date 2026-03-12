export interface User {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'host' | 'admin';
  bio?: string;
  avatar?: string;
  host_org_name?: string;
  host_verified: number;
  blocked: number;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface TicketType {
  id: string;
  event_id: string;
  name: string;
  price: number;
  quantity: number;
  sold: number;
}

export interface Event {
  id: string;
  host_id: string;
  name: string;
  description: string;
  date: string;
  venue: string;
  category_id: string;
  category_name?: string;
  host_name?: string;
  image?: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';
  featured: number;
  total_seats: number;
  available_seats: number;
  created_at: string;
  ticketTypes?: TicketType[];
  reviews?: Review[];
  faqs?: FAQ[];
}

export interface FAQ {
  id: string;
  event_id: string;
  question: string;
  answer: string;
}

export interface Booking {
  id: string;
  booking_ref: string;
  user_id: string;
  event_id: string;
  ticket_type_id: string;
  quantity: number;
  total_price: number;
  qr_code: string;
  status: string;
  created_at: string;
  event_name?: string;
  event_date?: string;
  venue?: string;
  ticket_type_name?: string;
}

export interface Review {
  id: string;
  user_id: string;
  user_name?: string;
  event_id: string;
  rating: number;
  comment: string;
  created_at: string;
}
