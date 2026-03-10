// types/index.ts

export interface Member {
  id: string;
  full_name: string;
  email: string;
  active: boolean;
  color_index: number;
  created_at: string;
}

export interface DutyAssignment {
  id: string;
  duty_date: string;       // "YYYY-MM-DD"
  member_id: string | null;
  member_name?: string | null;
  member_email?: string | null;
  color_index?: number | null;
  volume_ml: number | null;
  notes: string;
  gcal_event_id?: string | null;
  updated_at: string;
}

export interface Settings {
  id: 1;
  responsible_name: string;
  responsible_email: string;
  updated_at: string;
}

export interface AssignmentAudit {
  id: string;
  duty_date: string;
  old_member_id: string | null;
  new_member_id: string | null;
  changed_by_id: string | null;
  changed_at: string;
}

// Used in statistics screen
export interface MemberStats {
  member: Member;
  weekdays: number;
  weekend_holiday: number;
  total: number;
}
