// types/index.ts

export interface Member {
  id: string;
  full_name: string;
  email: string;
  active: boolean;
  color_index: number;
  medium_replacement_calendar_enabled: boolean;
  email_on_assignment: boolean;
  email_on_removal: boolean;
  email_on_self_assignment: boolean;
  created_at: string;
}

export interface DutyAssignment {
  id: string;
  duty_date: string; // "YYYY-MM-DD"
  member_id: string | null;
  member_name?: string | null;
  member_email?: string | null;
  color_index?: number | null;
  volume_ml: number | null;
  notes: string;
  gcal_event_id?: string | null;
  updated_at: string;

  // --- Split duty fields ---
  split_assignee_id?: string | null;
  split_passage_number?: number | null;
  split_plate_count?: number | null;
  split_maintenance_plate_count?: number | null;
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

// -----------------------------
// Split records / split logic
// -----------------------------

export interface SplitRecord {
  id: string;
  batch_id: string;
  split_number: number;
  status: string;
  performed_date: string | null;
  completed_at: string | null;
  completed_by_member_id: string | null;
  duty_assignment_id: string | null;
  maintenance_plate_count: number;
  flow_plate_count: number;
  actual_plate_count: number | null;
  created_at: string;
}

export interface SplitCounts {
  actual: number;
  flow: number;
  maintenance: number;
}

export interface SplitValidationInput {
  currentSplit: SplitRecord;
  newCurrentCounts: SplitCounts;
  prevSplit: SplitRecord | null;
  prevPrevSplit: SplitRecord | null;
  nextSplit: SplitRecord | null;
}

export type SplitValidationResult = {
  allowed: boolean;
  error: string | null;
  warning: string | null;
  newCurrentTotal: number;
  requiredPrevMaintenance: number;
  resultingCapacity: number;
  shouldWarnAboutExtraMaintenance: boolean;
};
