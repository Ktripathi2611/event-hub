export interface User {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'host' | 'admin' | 'sponsor';
  bio?: string;
  avatar?: string;
  host_org_name?: string;
  referral_code?: string;
  host_verified: number;
  blocked: number;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  event_count?: number;
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
  latitude?: number;
  longitude?: number;
  series_id?: string;
  recurrence_type?: 'none' | 'weekly' | 'monthly';
  share_count?: number;
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
  referral_code_used?: string;
  discount_amount?: number;
  checked_in?: number;
  checked_in_at?: string;
  checked_in_by?: string;
  ticket_id?: string;
  ticket_status?: 'pending' | 'verified';
  ticket_verification_status?: 'PENDING_VERIFICATION' | 'VERIFIED_ATTENDANCE';
  ticket_issued_at?: string;
  ticket_verified_at?: string;
  ticket_expires_at?: string;
  created_at: string;
  event_name?: string;
  event_date?: string;
  venue?: string;
  ticket_type_name?: string;
  user_name?: string;
  user_email?: string;
}

export interface TicketRecord {
  id: string;
  ticket_id: string;
  booking_id: string;
  user_id: string;
  event_id: string;
  status: 'pending' | 'verified';
  verification_status?: 'PENDING_VERIFICATION' | 'VERIFIED_ATTENDANCE';
  issued_at: string;
  verified_at?: string;
  verified_by?: string;
  expires_at?: string;
  booking_ref?: string;
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

export interface Community {
  id: string;
  name: string;
  description: string;
  image?: string;
  creator_id: string;
  creator_name?: string;
  member_count?: number;
  created_at: string;
}

export interface CommunityMember {
  id: string;
  name: string;
  avatar?: string;
  role: 'member' | 'admin' | 'moderator';
}

export interface CommunityPost {
  id: string;
  community_id: string;
  user_id: string;
  user_name?: string;
  user_avatar?: string;
  content: string;
  image?: string;
  created_at: string;
}

export interface CommunityMessage {
  id: string;
  community_id: string;
  user_id: string;
  user_name?: string;
  user_avatar?: string;
  message: string;
  created_at: string;
}

export interface Discussion {
  id: string;
  event_id: string;
  user_id: string;
  user_name?: string;
  user_avatar?: string;
  parent_id?: string | null;
  message: string;
  created_at: string;
  replies?: Discussion[];
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  data_json?: any;
  is_read: number;
  created_at: string;
}

export interface Sponsor {
  id: string;
  user_id: string;
  company_name: string;
  website?: string | null;
  contact_email?: string | null;
  approved: number;
  created_at: string;
  updated_at: string;
}

export interface SponsorshipDeal {
  id: string;
  event_id: string;
  host_id: string;
  sponsor_id: string;
  title: string;
  proposal_amount: number;
  status: 'proposed' | 'negotiating' | 'accepted' | 'rejected' | 'cancelled';
  created_at: string;
  updated_at: string;
  event_name?: string;
  sponsor_company?: string;
  host_name?: string;
}

export interface SponsorSpot {
  id: string;
  event_id: string;
  label: string;
  spot_type: 'booth' | 'banner' | 'stall' | 'premium';
  base_price: number;
  is_premium: number;
  status: 'open' | 'reserved' | 'booked';
  reserved_deal_id?: string | null;
  created_at: string;
}

export interface Bid {
  id: string;
  spot_id: string;
  sponsor_id: string;
  amount: number;
  status: 'active' | 'outbid' | 'won' | 'overridden';
  created_at: string;
  company_name?: string;
}

export interface WaitlistEntry {
  id: string;
  event_id: string;
  user_id: string;
  status: 'waiting' | 'promoted' | 'removed';
  promoted_at?: string | null;
  created_at: string;
  position?: number;
}

export interface AnalyticsSummary {
  salesOverTime: Array<{ day: string; revenue: number; tickets: number }>;
  revenueBreakdown: Array<{ event_name: string; revenue: number }>;
  attendeeDemographics: Array<{ role: string; count: number }>;
  categoryTrends: Array<{ category: string; bookings: number; revenue: number }>;
}

export interface EventAnalyticsSnapshot {
  event_id: string;
  window_type: '7d' | '30d' | '90d' | 'all';
  total_registrations: number;
  tickets_sold: number;
  gross_revenue: number;
  engagement: {
    unique_views: number;
    views: number;
    clicks: number;
  };
  conversion_rate: number;
  audience_demographics: Array<{ role: string; count: number }>;
  computed_at: string;
}

export interface SponsorshipRequest {
  id: string;
  direction: 'sponsor_to_host' | 'host_to_sponsor' | 'admin_to_sponsor';
  sender_user_id: string;
  sender_role: 'sponsor' | 'host' | 'admin';
  receiver_user_id: string;
  receiver_role: 'sponsor' | 'host';
  sponsor_id?: string | null;
  host_id?: string | null;
  event_id?: string | null;
  message: string;
  proposed_amount: number;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'expired';
  responded_by?: string | null;
  responded_at?: string | null;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
  sender_name?: string;
  receiver_name?: string;
  event_name?: string;
  sponsor_company?: string;
}

export interface Deal {
  id: string;
  request_id: string;
  event_id: string;
  sponsor_id: string;
  host_id: string;
  admin_owner_id?: string | null;
  agreed_amount: number;
  currency: string;
  status: 'active' | 'completed' | 'cancelled';
  start_at?: string | null;
  end_at?: string | null;
  cancel_reason?: string | null;
  created_at: string;
  updated_at: string;
  event_name?: string;
  sponsor_company?: string;
  host_name?: string;
}

export interface DealMessage {
  id: string;
  deal_id: string;
  sender_user_id: string;
  sender_name?: string;
  message: string;
  created_at: string;
}
