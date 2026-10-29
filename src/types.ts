export type UserRole = 'student' | 'manager' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  department: string;
  academicStanding: string;
  role: UserRole;
  completedSafetyModules: string[];
  activeRestrictions: string | null;
}

export type ResourceCategory =
  | 'Electronics & Coding Kits'
  | 'Computers & Laptops'
  | '3D Printing & Making'
  | 'Science & Physics Labs'
  | 'Project Rooms & Spaces'
  | 'Robotics & Mechatronics'
  | 'Electronics & RF Test'
  | 'Additive Manufacturing'
  | 'High-Performance Computing'
  | 'Supervised Laboratories';

export type ResourceType = 'Equipment' | 'Workstation' | 'Laboratory Space' | 'Kit' | 'Room';

export type ResourceStatus = 'Available' | 'In Use' | 'Maintenance' | 'Restricted';

export interface Resource {
  id: string;
  code: string;
  name: string;
  category: ResourceCategory;
  resourceType: ResourceType;
  location: string;
  building: string;
  description: string;
  imageUrl: string;
  status: ResourceStatus;
  conditionSummary: string;
  operatingHours: string;
  availableTimeSlots: string[];
  minDurationHours: number;
  maxDurationHours: number;
  weeklyLimitHoursPerStudent: number;
  cooldownHours: number;
  eligibilityRequirements: string[];
  requiredSafetyModule: string;
  safetyRules: string[];
  managerId: string;
  managerName: string;
  isDemoListing: boolean;
  specifications: Record<string, string>;
}

export type BookingStatus =
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'Waitlisted'
  | 'CheckedIn'
  | 'Completed'
  | 'Cancelled';

export const DISPLAY_BOOKING_STATUS: Record<BookingStatus, string> = {
  Pending: 'Waiting for Approval',
  Approved: 'Approved',
  Rejected: 'Not Approved',
  Waitlisted: 'Waitlisted',
  CheckedIn: 'Checked In (In Use)',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
};

export const NEXT_STEP_GUIDE: Record<BookingStatus, string> = {
  Pending: 'Next: The teacher or resource manager will check availability and make a decision.',
  Approved: 'Next: Go to the lab/room at your booked time, click "Check In", record item condition, and begin your session.',
  Rejected: 'Next: Request was not approved. Check the manager note below, or pick a different time slot.',
  Waitlisted: 'Next: You are on the waitlist. If an earlier booking cancels, this slot will open for you.',
  CheckedIn: 'Next: Finish your work, clean up, and click "Check Out" to record the return condition.',
  Completed: 'Next: Session finished. Thank you for returning the resource in good condition!',
  Cancelled: 'Next: This booking was cancelled. Feel free to browse and request another resource.',
};

export type EquipmentConditionRating =
  | 'Excellent — Clean & Working'
  | 'Good — Minor Wear, Fully Working'
  | 'Needs Attention — Missing Parts or Loose Wire'
  | 'Damaged or Not Working'
  | 'Nominal — Clean & Calibrated'
  | 'Minor Wear — Fully Functional'
  | 'Degraded — Needs Calibration'
  | 'Damaged — Unsafe / Faulty';

export interface ConditionReport {
  id: string;
  bookingId: string;
  resourceId: string;
  submittedByUserId: string;
  submittedByName: string;
  phase: 'Before-Use' | 'After-Use';
  rating: EquipmentConditionRating;
  checklistVerified: boolean;
  accessoriesPresent: boolean;
  notes: string;
  timestamp: string;
}

export interface BookingRequest {
  id: string;
  resourceId: string;
  resourceName: string;
  resourceCode: string;
  resourceLocation: string;
  studentId: string;
  studentName: string;
  studentDepartment: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:00 (24h)
  durationHours: number;
  endTime: string; // HH:00 (24h)
  purpose: string;
  courseOrProjectCode: string;
  supervisorName: string;
  agreedToSafetyRules: boolean;
  selfDeclaredEligible: boolean;
  status: BookingStatus;
  managerDecisionNote?: string;
  decidedByName?: string;
  decidedAt?: string;
  createdAt: string;
  checkInAt?: string;
  checkOutAt?: string;
  beforeConditionReport?: ConditionReport;
  afterConditionReport?: ConditionReport;
  flaggedMissingReport?: boolean;
}

export type IncidentCategory =
  | 'Broken or not working'
  | 'Returned late'
  | 'Missing parts or cables'
  | 'Safety concern'
  | 'Other problem'
  | 'Damage or malfunction'
  | 'Missing equipment'
  | 'Other incident';

export type IncidentSeverity = 'Low' | 'Moderate' | 'High' | 'Critical';

export type IncidentStatus = 'Reported' | 'Under Review' | 'Resolved' | 'Closed';

export interface IncidentReport {
  id: string;
  resourceId: string;
  resourceName: string;
  resourceCode: string;
  bookingId?: string;
  reportedByUserId: string;
  reportedByName: string;
  reportedByRole: UserRole;
  category: IncidentCategory;
  severity: IncidentSeverity;
  description: string;
  supportingImageRef?: string;
  status: IncidentStatus;
  managerReviewNotes?: string;
  reviewedByName?: string;
  humanReviewRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  actionType:
    | 'BOOKING_SUBMITTED'
    | 'BOOKING_APPROVED'
    | 'BOOKING_REJECTED'
    | 'BOOKING_WAITLISTED'
    | 'BOOKING_CANCELLED'
    | 'CHECK_IN_COMPLETED'
    | 'CHECK_OUT_COMPLETED'
    | 'INCIDENT_REPORTED'
    | 'INCIDENT_STATUS_UPDATED'
    | 'RESOURCE_CREATED'
    | 'RESOURCE_UPDATED'
    | 'ROLE_UPDATED'
    | 'POLICY_UPDATED';
  targetType: 'Resource' | 'Booking' | 'Incident' | 'User' | 'Policy';
  targetId: string;
  summary: string;
  metadata?: string;
}

export interface PlatformPolicySettings {
  maxActivePendingRequestsPerStudent: number;
  defaultWeeklyHoursCapPerStudent: number;
  defaultCooldownHoursBetweenBookings: number;
  requireBeforeAndAfterConditionReports: boolean;
  enforceHumanReviewForAllIncidents: boolean;
  allowWaitlistOnConflict: boolean;
  institutionName: string;
  environmentMode: 'Single-Instance Server & Demo Dataset';
}

export interface AppDatabaseState {
  users: User[];
  resources: Resource[];
  bookings: BookingRequest[];
  incidents: IncidentReport[];
  auditEvents: AuditEvent[];
  policy: PlatformPolicySettings;
}
