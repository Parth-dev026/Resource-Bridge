import React, { useState } from 'react';
import {
  CheckCircle2,
  FileWarning,
  ShieldCheck,
} from 'lucide-react';
import {
  BookingRequest,
  IncidentCategory,
  IncidentReport,
  IncidentSeverity,
  IncidentStatus,
  Resource,
  ResourceStatus,
  User,
} from '../types';

interface IncidentsViewProps {
  user: User;
  resources: Resource[];
  bookings: BookingRequest[];
  incidents: IncidentReport[];
  preselectedBooking?: BookingRequest | null;
  onClearPreselectedBooking?: () => void;
  onCreateIncident: (payload: {
    resourceId: string;
    bookingId?: string;
    category: IncidentCategory;
    severity: IncidentSeverity;
    description: string;
    supportingImageRef?: string;
  }) => Promise<void>;
  onUpdateIncident: (
    incidentId: string,
    payload: {
      status?: IncidentStatus;
      managerReviewNotes?: string;
      updateResourceStatus?: ResourceStatus;
    }
  ) => Promise<void>;
}

const INCIDENT_CATEGORIES: IncidentCategory[] = [
  'Broken or not working',
  'Returned late',
  'Missing parts or cables',
  'Safety concern',
  'Other problem',
];

const SEVERITIES: IncidentSeverity[] = ['Low', 'Moderate', 'High', 'Critical'];

const INCIDENT_STATUSES: IncidentStatus[] = ['Reported', 'Under Review', 'Resolved', 'Closed'];

export const IncidentsView: React.FC<IncidentsViewProps> = ({
  user,
  resources,
  bookings,
  incidents,
  preselectedBooking,
  onClearPreselectedBooking,
  onCreateIncident,
  onUpdateIncident,
}) => {
  const [resourceId, setResourceId] = useState(
    preselectedBooking?.resourceId || resources[0]?.id || ''
  );
  const [bookingId, setBookingId] = useState(preselectedBooking?.id || '');
  const [category, setCategory] = useState<IncidentCategory>('Broken or not working');
  const [severity, setSeverity] = useState<IncidentSeverity>('Moderate');
  const [description, setDescription] = useState('');
  const [supportingImageRef, setSupportingImageRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Manager review form states per incident
  const [reviewNotesMap, setReviewNotesMap] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<'All' | IncidentStatus>('All');

  const isStaff = user.role === 'manager' || user.role === 'admin';

  const myBookings = bookings.filter((b) => b.studentId === user.id);

  const filteredIncidents =
    statusFilter === 'All'
      ? incidents
      : incidents.filter((i) => i.status === statusFilter);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!resourceId || !description.trim() || description.trim().length < 8) {
      setFeedback({
        type: 'error',
        text: 'Please select a resource and enter a clear description (at least 8 characters).',
      });
      return;
    }

    setSubmitting(true);
    try {
      await onCreateIncident({
        resourceId,
        bookingId: bookingId || undefined,
        category,
        severity,
        description: description.trim(),
        supportingImageRef: supportingImageRef.trim() || undefined,
      });
      setDescription('');
      setSupportingImageRef('');
      if (onClearPreselectedBooking) onClearPreselectedBooking();
      setFeedback({
        type: 'success',
        text: 'Problem report sent! A teacher or lab manager will review it.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not submit report.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleManagerUpdate = async (
    incident: IncidentReport,
    nextStatus: IncidentStatus,
    updateResourceStatus?: ResourceStatus
  ) => {
    setFeedback(null);
    try {
      await onUpdateIncident(incident.id, {
        status: nextStatus,
        managerReviewNotes:
          reviewNotesMap[incident.id] !== undefined
            ? reviewNotesMap[incident.id]
            : incident.managerReviewNotes,
        updateResourceStatus,
      });
      setFeedback({
        type: 'success',
        text: `Problem ${incident.id} status updated to '${nextStatus}'.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update problem report.',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <div className="text-xs font-mono text-teal-700 font-semibold">
          CARE &amp; MAINTENANCE · REPORT A PROBLEM
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">
          Report a Problem &amp; Manager Review
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          Report broken items, missing cables or wires, late returns, or safety concerns so teachers and lab coordinators can repair or replace them quickly.
        </p>
      </div>

      {/* Fair Review Guarantee Banner */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-700 leading-relaxed">
          <strong className="text-slate-900">Managers Review Important Decisions:</strong> We never apply automated penalties or account restrictions. All reported problems and missing parts are reviewed by a human teacher or lab manager.
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-md border text-xs flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
          role="status"
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="underline font-semibold ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 2-Column Split: Form (5 cols) + List (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 5 cols: Submit Form */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <FileWarning className="w-4 h-4 text-teal-700" />
            Report a New Problem
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Let the lab coordinator know what happened so the item can be inspected.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label htmlFor="inc-resource" className="block text-xs font-semibold text-slate-800 mb-1">
                Resource or Space Involved
              </label>
              <select
                id="inc-resource"
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                required
              >
                {resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} — {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="inc-booking" className="block text-xs font-semibold text-slate-800 mb-1">
                Related Booking (Optional)
              </label>
              <select
                id="inc-booking"
                value={bookingId}
                onChange={(e) => {
                  const val = e.target.value;
                  setBookingId(val);
                  const found = bookings.find((b) => b.id === val);
                  if (found) setResourceId(found.resourceId);
                }}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-teal-600 focus:outline-none"
              >
                <option value="">None / General Lab Issue</option>
                {(isStaff ? bookings : myBookings).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id} · {b.resourceCode} ({b.date} {b.startTime}–{b.endTime})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="inc-category" className="block text-xs font-semibold text-slate-800 mb-1">
                  Problem Type
                </label>
                <select
                  id="inc-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as IncidentCategory)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                >
                  {INCIDENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="inc-severity" className="block text-xs font-semibold text-slate-800 mb-1">
                  How Serious Is It?
                </label>
                <select
                  id="inc-severity"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="inc-description" className="block text-xs font-semibold text-slate-800 mb-1">
                What Happened?
              </label>
              <textarea
                id="inc-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Red jumper wire has a loose pin, or Arduino USB cable is faulty..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                required
              />
            </div>

            <div>
              <label htmlFor="inc-image-ref" className="block text-xs font-semibold text-slate-800 mb-1">
                Photo or Note Reference (Optional)
              </label>
              <input
                id="inc-image-ref"
                type="text"
                value={supportingImageRef}
                onChange={(e) => setSupportingImageRef(e.target.value)}
                placeholder="e.g. Photo of bent pin or multimeter reading"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit Problem Report'}
            </button>
          </form>
        </div>

        {/* Right 7 cols: Reported Problems List */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900">
              Reported Problems ({filteredIncidents.length})
            </h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {(['All', ...INCIDENT_STATUSES] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === st
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {filteredIncidents.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-2">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" />
              <div className="text-sm font-bold text-slate-900">No problems reported in this status</div>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredIncidents.map((inc) => (
                <article
                  key={inc.id}
                  className="bg-white border border-slate-200 rounded-lg p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                    <div className="flex flex-wrap items-center gap-2 text-slate-600">
                      <span className="font-bold text-slate-900">{inc.id}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-teal-700 font-semibold">{inc.resourceCode}</span>
                      {inc.bookingId && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Booking {inc.bookingId}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>{new Date(inc.createdAt).toLocaleString()}</span>
                    </div>

                    <span
                      className={`font-sans font-semibold ${
                        inc.status === 'Resolved' || inc.status === 'Closed'
                          ? 'text-emerald-700'
                          : inc.status === 'Under Review'
                          ? 'text-amber-700'
                          : 'text-red-700'
                      }`}
                    >
                      Status: {inc.status}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-900">{inc.resourceName}</h3>
                    <div className="text-xs text-slate-600 mt-0.5">
                      Issue: <strong>{inc.category}</strong> · Severity: <strong>{inc.severity}</strong> · Reported by: {inc.reportedByName}
                    </div>
                  </div>

                  <p className="text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-md p-3 leading-relaxed">
                    {inc.description}
                  </p>

                  {inc.managerReviewNotes && (
                    <div className="text-xs text-slate-700 border-t border-slate-100 pt-2.5">
                      <span className="font-semibold text-slate-900">
                        Teacher/Manager Note ({inc.reviewedByName || 'Lab Coordinator'}):
                      </span>{' '}
                      {inc.managerReviewNotes}
                    </div>
                  )}

                  {/* Manager Resolution Controls */}
                  {isStaff && (
                    <div className="pt-3 border-t border-slate-200 space-y-2.5">
                      <div className="text-xs font-semibold text-slate-800">
                        Manager Actions &amp; Notes
                      </div>
                      <input
                        type="text"
                        value={
                          reviewNotesMap[inc.id] !== undefined
                            ? reviewNotesMap[inc.id]
                            : inc.managerReviewNotes || ''
                        }
                        onChange={(e) =>
                          setReviewNotesMap((prev) => ({ ...prev, [inc.id]: e.target.value }))
                        }
                        placeholder="e.g. 'Replaced broken jumper wire with spare.' or 'Sent for maintenance'..."
                        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleManagerUpdate(inc, 'Under Review', 'Maintenance')}
                          className="px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-100 border border-amber-300 rounded-md hover:bg-amber-200 whitespace-nowrap shrink-0"
                        >
                          Mark Under Review (Put in Maintenance)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleManagerUpdate(inc, 'Resolved', 'Available')}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 rounded-md hover:bg-emerald-800 whitespace-nowrap shrink-0"
                        >
                          Mark Resolved (Make Available)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleManagerUpdate(inc, 'Closed')}
                          className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 whitespace-nowrap shrink-0"
                        >
                          Close Issue
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
