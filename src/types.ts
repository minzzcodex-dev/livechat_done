export type Session = {
  id: string;
  created_at: string; // ISO
  visitor_name?: string;
  visitor_email?: string;
  user_agent?: string;
  ip?: string;
  last_seen_at: string; // ISO
  closed: number; // 0/1
};

export type Message = {
  id: string;
  session_id: string;
  role: 'visitor' | 'admin' | 'system';
  text: string;
  created_at: string; // ISO
};
