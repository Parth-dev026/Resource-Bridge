import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Info,
  MapPin,
  ShieldCheck,
  Wrench,
  X,
} from 'lucide-react';
import { BookingRequest, NEXT_STEP_GUIDE, Resource, User } from '../types';
import { getCampusTodayDate } from '../lib/dateTime';
import { ResilientImage } from './ResilientImage';

interface ResourceDetailModalProps {
  resource: Resource;
  bookings: BookingRequest[];
  currentUser: User | null;
  onClose: () => void;
  onRequireSignIn: () => void;
  onSubmitBooking: (payload: {
    resourceId: string;
    date: string;
    startTime: string;
    durationHours: number;
    purpose: string;
    courseOrProjectCode: string;
    supervisorName: string;
    agreedToSafetyRules: boolean;
    selfDeclaredEligible: boolean;
  }) => Promise<BookingRequest>;
  onNavigateToMyBookings: () => void;
}

function parseHour(timeStr: string): number {
  const [hh] = timeStr.split(':').map(Number);
  return Number.isFinite(hh) ? hh : 0;
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function intervalsOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const a0 = parseHour(startA);
  const a1 = parseHour(endA);
  const b0 = parseHour(startB);
  const b1 = parseHour(endB);
  return a0 < b1 && b0 < a1;
}

export const ResourceDetailModal: React.FC<ResourceDetailModalProps> = ({
  resource,
  bookings,
  currentUser,
  onClose,
  onRequireSignIn,
  onSubmitBooking,
  onNavigateToMyBookings,
}) => {
  const [date, setDate] = useState(() => getCampusTodayDate());
  const [startTime, setStartTime] = useState(resource.availableTimeSlots[0] || '10:00');
  const [durationHours, setDurationHours] = useState(
    Math.min(2, Math.max(resource.minDurationHours, 1))
  );
  const [purpose, setPurpose] = useState('');
  const [courseOrProjectCode, setCourseOrProjectCode] = useState('Science & Tech Exhibition 2026');
  const [supervisorName, setSupervisorName] = useState('Mrs. Priya Sharma');
  const [selfDeclaredEligible, setSelfDeclaredEligible] = useState(false);
  const [agreedToSafetyRules, setAgreedToSafetyRules] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedBooking, setSubmittedBooking] = useState<BookingRequest | null>(null);

  const computedEndTime = useMemo(() => {
    return formatHour(parseHour(startTime) + Number(durationHours));
  }, [startTime, durationHours]);

  // Existing bookings on the selected date for this resource
  const bookingsOnDate = useMemo(() => {
    return bookings.filter(
      (b) =>
        b.resourceId === resource.id &&
        b.date === date &&
        ['Approved', 'CheckedIn', 'Pending', 'Waitlisted'].includes(b.status)
    );
  }, [bookings, resource.id, date]);

  const overlappingApproved = useMemo(() => {
    return bookingsOnDate.find(
      (b) =>
        (b.status === 'Approved' || b.status === 'CheckedIn') &&
        intervalsOverlap(startTime, computedEndTime, b.startTime, b.endTime)
    );
  }, [bookingsOnDate, startTime, computedEndTime]);

  const overlappingPending = useMemo(() => {
    return bookingsOnDate.filter(
      (b) =>
        b.status === 'Pending' &&
        intervalsOverlap(startTime, computedEndTime, b.startTime, b.endTime)
    );
  }, [bookingsOnDate, startTime, computedEndTime]);

  const studentUsedHours = useMemo(() => {
    if (!currentUser) return 0;
    return bookings
      .filter(
        (b) =>
          b.studentId === currentUser.id &&
          b.resourceId === resource.id &&
          ['Approved', 'CheckedIn', 'Completed'].includes(b.status)
      )
      .reduce((sum, b) => sum + b.durationHours, 0);
  }, [bookings, currentUser, resource.id]);

  const durationOptions = useMemo(() => {
    const opts: number[] = [];
    for (let h = resource.minDurationHours; h <= resource.maxDurationHours; h++) {
      opts.push(h);
    }
    return opts;
  }, [resource.minDurationHours, resource.maxDurationHours]);

  const isUnavailable = resource.status === 'Maintenance' || resource.status === 'Restricted';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentUser) {
      onRequireSignIn();
      return;
    }

    const campusToday = getCampusTodayDate();
    if (!date || date < campusToday) {
      setError(`Please select a valid date (today, ${campusToday}, or a future school day).`);
      return;
    }

    if (!purpose.trim() || purpose.trim().length < 8) {
      setError('Please explain briefly why you need this resource (at least 8 characters).');
      return;
    }

    if (!selfDeclaredEligible || !agreedToSafetyRules) {
      setError('Please tick the boxes to confirm eligibility and agree to follow school equipment rules.');
      return;
    }

    if (overlappingApproved) {
      setError(
        `Avoid Double Bookings: This time slot (${startTime}–${computedEndTime}) is already approved for another student. Please pick a different slot or day.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const created = await onSubmitBooking({
        resourceId: resource.id,
        date,
        startTime,
        durationHours: Number(durationHours),
        purpose: purpose.trim(),
        courseOrProjectCode: courseOrProjectCode.trim(),
        supervisorName: supervisorName.trim(),
        agreedToSafetyRules,
        selfDeclaredEligible,
      });
      setSubmittedBooking(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit booking request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resource-detail-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg max-w-4xl w-full p-6 shadow-xl my-8 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-mono">
              <span className="font-semibold text-teal-700">{resource.code}</span>
              <span aria-hidden="true">·</span>
              <span>{resource.category}</span>
              <span aria-hidden="true">·</span>
              <span>{resource.resourceType}</span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-500">School Shared Resource</span>
            </div>
            <h2 id="resource-detail-title" className="text-xl font-bold text-slate-900 mt-1">
              {resource.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-md"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2-Column Content */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
          {/* Left Column: Image, details, rules */}
          <div className="lg:col-span-7 space-y-5">
            <div className="aspect-4/3 w-full rounded-md overflow-hidden border border-slate-200 bg-slate-100">
              <ResilientImage
                src={resource.imageUrl}
                alt={resource.name}
                code={resource.code}
                category={resource.category}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Status & Condition Bar */}
            <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-900">
                  Status:{' '}
                  <span
                    className={
                      resource.status === 'Available'
                        ? 'text-emerald-700'
                        : resource.status === 'In Use'
                        ? 'text-teal-700'
                        : 'text-amber-700'
                    }
                  >
                    {resource.status === 'Available' ? 'Available to Book' : resource.status}
                  </span>
                </span>
                <span className="text-slate-600">Teacher / Manager: {resource.managerName}</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                <span className="font-semibold text-slate-900">Condition:</span> {resource.conditionSummary}
              </p>
            </div>

            {/* Description */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-1.5">What This Resource Is</h3>
              <p className="text-sm text-slate-700 leading-relaxed">{resource.description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-500" />
                  {resource.location}
                </span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  Hours: {resource.operatingHours}
                </span>
              </div>
            </div>

            {/* Specifications & Included Items */}
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-bold text-slate-900 mb-2.5">Specifications &amp; What's Included</h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                {Object.entries(resource.specifications).map(([key, val]) => (
                  <div key={key} className="border-b border-slate-100 pb-1.5">
                    <dt className="text-slate-500">{key}</dt>
                    <dd className="font-medium text-slate-900 mt-0.5">{val}</dd>
                  </div>
                ))}
                <div className="border-b border-slate-100 pb-1.5">
                  <dt className="text-slate-500">Booking Length Limit</dt>
                  <dd className="font-mono font-medium text-slate-900 mt-0.5 tabular-nums">
                    {resource.minDurationHours}h to {resource.maxDurationHours}h per session
                  </dd>
                </div>
                <div className="border-b border-slate-100 pb-1.5">
                  <dt className="text-slate-500">Fair Sharing Weekly Cap</dt>
                  <dd className="font-mono font-medium text-slate-900 mt-0.5 tabular-nums">
                    Max {resource.weeklyLimitHoursPerStudent}h per student per week
                  </dd>
                </div>
              </dl>
            </div>

            {/* Who Can Use & Usage Rules */}
            <div className="border-t border-slate-200 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h3 className="text-xs font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-teal-700" />
                  Check Who Can Use This Resource
                </h3>
                <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                  {resource.eligibilityRequirements.map((req, i) => (
                    <li key={i}>{req}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                  <Wrench className="w-4 h-4 text-slate-700" />
                  Simple Usage &amp; Return Rules
                </h3>
                <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                  {resource.safetyRules.map((rule, i) => (
                    <li key={i}>{rule}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Right Column: 8-Step Easy Booking Form */}
          <div className="lg:col-span-5">
            <div className="border border-slate-200 rounded-lg p-5 bg-slate-50/60 space-y-4">
              <div>
                <span className="text-[11px] font-mono text-teal-700 font-semibold uppercase">
                  STEPS 2–5 · EASY BOOKING
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">Book This Resource</h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Pick an available time slot and write a short reason. Requests go to {resource.managerName} for approval.
                </p>
              </div>

              {submittedBooking ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-md space-y-3">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-bold text-emerald-950">
                        Request Submitted! ({submittedBooking.id})
                      </div>
                      <p className="text-xs text-emerald-900 mt-1">
                        Status: <strong>Waiting for Approval</strong> on <span className="font-mono">{submittedBooking.date}</span> ({submittedBooking.startTime}–{submittedBooking.endTime}).
                      </p>
                    </div>
                  </div>
                  <div className="p-3 bg-white/80 rounded border border-emerald-200 text-xs text-emerald-900 space-y-1">
                    <div className="font-semibold">What happens next:</div>
                    <p className="text-slate-700">
                      Step 6: The teacher or lab manager reviews your request. Once approved, open <strong>My Bookings</strong>, click <strong>Check In</strong> to record the item's condition, and use it!
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onNavigateToMyBookings();
                      }}
                      className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 whitespace-nowrap shrink-0"
                    >
                      View in My Bookings
                    </button>
                    <button
                      type="button"
                      onClick={() => setSubmittedBooking(null)}
                      className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
                    >
                      Book Another Slot
                    </button>
                  </div>
                </div>
              ) : isUnavailable ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-md space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                    Resource Under Maintenance
                  </div>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    {resource.conditionSummary} Bookings will re-open once maintenance is completed.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Step 2: Check when it is available */}
                  <div className="p-3 bg-white border border-slate-200 rounded-md space-y-2">
                    <div className="text-xs font-semibold text-slate-900 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-teal-700" />
                        Step 2: Check Schedule for Date
                      </span>
                      <span className="font-mono text-slate-500 tabular-nums">{date}</span>
                    </div>

                    {bookingsOnDate.length === 0 ? (
                      <p className="text-xs text-emerald-700">
                        All slots are free on this date. No double-bookings!
                      </p>
                    ) : (
                      <div className="space-y-1 text-xs font-mono">
                        {bookingsOnDate.map((b) => (
                          <div key={b.id} className="flex items-center justify-between text-slate-700">
                            <span>
                              {b.startTime}–{b.endTime} ({b.id})
                            </span>
                            <span
                              className={
                                b.status === 'Approved' || b.status === 'CheckedIn'
                                  ? 'text-red-700 font-semibold'
                                  : 'text-amber-700'
                              }
                            >
                              {b.status === 'Approved' || b.status === 'CheckedIn'
                                ? 'Booked (Approved)'
                                : 'Pending Request'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {overlappingApproved && (
                      <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                        Avoid Double Bookings: This slot ({startTime}–{computedEndTime}) is already booked by another student. Please pick another time.
                      </div>
                    )}
                  </div>

                  {/* Step 3: Select date and time */}
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-slate-900 flex items-center justify-between">
                      <span>Step 3: Select Date, Time (IST), and Duration</span>
                      <span className="text-[10px] font-mono text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                        Campus Time (UTC+05:30)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="bkg-date" className="block text-[11px] text-slate-600 mb-1">
                          Date
                        </label>
                        <input
                          id="bkg-date"
                          type="date"
                          min={getCampusTodayDate()}
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-900 focus:border-teal-600 focus:outline-none"
                          required
                        />
                      </div>

                      <div>
                        <label htmlFor="bkg-time" className="block text-[11px] text-slate-600 mb-1">
                          Start Time Slot (Indian Standard Time · IST)
                        </label>
                        <select
                          id="bkg-time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-900 focus:border-teal-600 focus:outline-none"
                        >
                          {resource.availableTimeSlots.map((slot) => (
                            <option key={slot} value={slot}>
                              {slot} hrs
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-600">Duration</span>
                        <span className="font-mono text-teal-700 font-semibold tabular-nums">
                          {startTime} to {computedEndTime} ({durationHours} hours)
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {durationOptions.map((hrs) => (
                          <button
                            key={hrs}
                            type="button"
                            onClick={() => setDurationHours(hrs)}
                            className={`flex-1 py-1.5 text-xs font-mono font-medium rounded-md border transition-colors ${
                              durationHours === hrs
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {hrs} hour{hrs > 1 ? 's' : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Step 4: Explain why it is needed */}
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-slate-900">
                      Step 4: Explain Briefly Why It Is Needed
                    </div>

                    <div>
                      <label htmlFor="bkg-purpose" className="block text-[11px] text-slate-600 mb-1">
                        Why do you need this resource?
                      </label>
                      <textarea
                        id="bkg-purpose"
                        rows={2}
                        value={purpose}
                        onChange={(e) => setPurpose(e.target.value)}
                        placeholder="e.g. Building an ultrasonic distance sensor circuit for science exhibition..."
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="bkg-course" className="block text-[11px] text-slate-600 mb-1">
                          Subject or Project Name
                        </label>
                        <input
                          id="bkg-course"
                          type="text"
                          value={courseOrProjectCode}
                          onChange={(e) => setCourseOrProjectCode(e.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor="bkg-teacher" className="block text-[11px] text-slate-600 mb-1">
                          Teacher / Club Mentor
                        </label>
                        <input
                          id="bkg-teacher"
                          type="text"
                          value={supervisorName}
                          onChange={(e) => setSupervisorName(e.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Step 5: Simple rules agreement */}
                  <div className="p-3 bg-white border border-slate-200 rounded-md space-y-2 text-xs">
                    <div className="font-semibold text-slate-900">
                      Step 5: Confirm Rules and Submit
                    </div>

                    <label className="flex items-start gap-2 text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selfDeclaredEligible}
                        onChange={(e) => setSelfDeclaredEligible(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-600"
                      />
                      <span>
                        I am an eligible school/college student and have done the basic lab safety orientation.
                      </span>
                    </label>

                    <label className="flex items-start gap-2 text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agreedToSafetyRules}
                        onChange={(e) => setAgreedToSafetyRules(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-600"
                      />
                      <span>
                        I will record the item's condition at check-in, handle it carefully, and record return condition at check-out.
                      </span>
                    </label>
                  </div>

                  {error && (
                    <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-800" role="alert">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || Boolean(overlappingApproved)}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-teal-700 rounded-md hover:bg-teal-800 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {submitting
                      ? 'Submitting...'
                      : currentUser
                      ? 'Submit Booking Request'
                      : 'Sign In to Submit Request'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
