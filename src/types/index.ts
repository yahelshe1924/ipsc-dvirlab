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

  // --- NEW: Split duty ---
  split_assignee_id?: string | null;
  split_passage_number?: number | null;
  split_plate_count?: number | null;
  split_completed?: boolean;
  split_completed_at?: string | null;
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

  medium_weekdays: number;
  medium_weekend_holiday: number;
  medium_total: number;

  split_assigned_total: number;
  split_completed_total: number;
  split_plates_total: number;
}
