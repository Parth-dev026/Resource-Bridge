import React, { useState } from 'react';
import { CheckCircle2, ClipboardCheck, ShieldAlert, X } from 'lucide-react';
import { BookingRequest, ConditionReport, EquipmentConditionRating, Resource } from '../types';

interface CheckInOutModalProps {
  booking: BookingRequest;
  resource?: Resource;
  mode: 'checkin' | 'checkout';
  onClose: () => void;
  onSubmit: (
    bookingId: string,
    mode: 'checkin' | 'checkout',
    payload: {
      rating: EquipmentConditionRating;
      checklistVerified: boolean;
      accessoriesPresent: boolean;
      notes: string;
    }
  ) => Promise<void>;
}

const CONDITION_RATINGS: EquipmentConditionRating[] = [
  'Excellent — Clean & Working',
  'Good — Minor Wear, Fully Working',
  'Needs Attention — Missing Parts or Loose Wire',
  'Damaged or Not Working',
];

export const CheckInOutModal: React.FC<CheckInOutModalProps> = ({
  booking,
  resource,
  mode,
  onClose,
  onSubmit,
}) => {
  const [rating, setRating] = useState<EquipmentConditionRating>('Excellent — Clean & Working');
  const [checklistVerified, setChecklistVerified] = useState(false);
  const [accessoriesPresent, setAccessoriesPresent] = useState(true);
  const [notes, setNotes] = useState(
    mode === 'checkin'
      ? 'Checked the kit/room. All cables, parts, and sensors look clean and ready for project work.'
      : 'Session finished. Cleaned up, packed all components into the box, and powered off the equipment.'
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCheckIn = mode === 'checkin';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!checklistVerified) {
      setError('Please check the confirmation box to confirm you inspected the item.');
      return;
    }
    if (!notes.trim()) {
      setError('Please add a short note describing the item condition.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(booking.id, mode, {
        rating,
        checklistVerified,
        accessoriesPresent,
        notes: notes.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save condition report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkinout-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg max-w-2xl w-full p-6 shadow-xl my-8">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="text-xs font-mono text-teal-700 font-semibold">
              {booking.id} · {booking.resourceCode} · {isCheckIn ? 'STEP 7 OF 8' : 'STEP 8 OF 8'}
            </div>
            <h2 id="checkinout-modal-title" className="text-xl font-bold text-slate-900 mt-1">
              {isCheckIn
                ? 'Check In & Condition Before Use'
                : 'Check Out & Condition After Use'}
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

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Booking Summary */}
          <div className="bg-slate-50 border border-slate-200 rounded-md p-4 text-sm">
            <div className="font-semibold text-slate-900">{booking.resourceName}</div>
            <div className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-2 font-mono tabular-nums">
              <span>Date: {booking.date}</span>
              <span aria-hidden="true">·</span>
              <span>
                Time Slot: {booking.startTime}–{booking.endTime} ({booking.durationHours}h)
              </span>
              <span aria-hidden="true">·</span>
              <span>Location: {booking.resourceLocation}</span>
            </div>
            {booking.beforeConditionReport && !isCheckIn && (
              <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-700">
                <span className="font-semibold text-slate-900">Recorded Condition Before Use:</span>{' '}
                {booking.beforeConditionReport.rating} — "{booking.beforeConditionReport.notes}"
              </div>
            )}
          </div>

          {/* Simple Rules Reminder */}
          {resource && resource.safetyRules.length > 0 && (
            <div className="border border-slate-200 rounded-md p-4">
              <div className="text-xs font-semibold text-slate-900 mb-2">
                {isCheckIn ? 'Important Rules While Using This Resource' : 'Check-Out & Cleanup Checklist'}
              </div>
              <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                {resource.safetyRules.map((rule, idx) => (
                  <li key={idx}>{rule}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Condition Rating Options */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              {isCheckIn ? 'Observed Condition Before Starting' : 'Condition Now (When Returning)'}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {CONDITION_RATINGS.map((option) => {
                const selected = rating === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setRating(option)}
                    className={`text-left px-3.5 py-2.5 rounded-md border text-xs font-medium transition-colors ${
                      selected
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            {rating === 'Damaged or Not Working' && (
              <p className="text-xs text-red-700 mt-2 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                This will alert the resource manager so the item can be tested or repaired before the next student books it.
              </p>
            )}
          </div>

          {/* Checkbox Confirmations */}
          <div className="space-y-3 pt-1">
            <label className="flex items-start gap-3 text-sm text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={checklistVerified}
                onChange={(e) => setChecklistVerified(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-600"
              />
              <span>
                {isCheckIn
                  ? 'I have visually inspected the resource, confirmed it is in working order, and will follow lab rules.'
                  : 'I have turned off the equipment, cleaned the desk area, and packed all components back in place.'}
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={accessoriesPresent}
                onChange={(e) => setAccessoriesPresent(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-600"
              />
              <span>
                All cables, sensors, adapters, and tools that came with this resource are accounted for.
              </span>
            </label>
          </div>

          {/* Inspection Notes */}
          <div>
            <label htmlFor="condition-notes" className="block text-sm font-semibold text-slate-900 mb-1.5">
              Condition Notes (Recorded in Item History)
            </label>
            <textarea
              id="condition-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe item appearance, any missing wires, or special notes..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              required
            />
          </div>

          {error && (
            <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-800" role="alert">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 rounded-md hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {isCheckIn ? <ClipboardCheck className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              {submitting
                ? 'Saving...'
                : isCheckIn
                ? 'Save Condition & Check In'
                : 'Save Condition & Complete Return'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
