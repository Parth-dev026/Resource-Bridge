import React, { useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  FileWarning,
  Info,
  XCircle,
} from 'lucide-react';
import { BookingRequest, BookingStatus, DISPLAY_BOOKING_STATUS, NEXT_STEP_GUIDE } from '../types';

interface MyBookingsViewProps {
  bookings: BookingRequest[];
  currentUserId: string;
  onCancelBooking: (bookingId: string) => Promise<void>;
  onOpenCheckInOut: (booking: BookingRequest, mode: 'checkin' | 'checkout') => void;
  onOpenReportIncidentForBooking: (booking: BookingRequest) => void;
  onBrowseCatalogue: () => void;
}

const STATUS_TABS: { key: 'All' | BookingStatus; label: string }[] = [
  { key: 'All', label: 'All Bookings' },
  { key: 'Pending', label: 'Waiting for Approval' },
  { key: 'Approved', label: 'Approved' },
  { key: 'CheckedIn', label: 'In Use (Checked In)' },
  { key: 'Waitlisted', label: 'Waitlisted' },
  { key: 'Completed', label: 'Completed' },
  { key: 'Rejected', label: 'Not Approved' },
  { key: 'Cancelled', label: 'Cancelled' },
];

export const MyBookingsView: React.FC<MyBookingsViewProps> = ({
  bookings,
  currentUserId,
  onCancelBooking,
  onOpenCheckInOut,
  onOpenReportIncidentForBooking,
  onBrowseCatalogue,
}) => {
  const [selectedTab, setSelectedTab] = useState<'All' | BookingStatus>('All');
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const myBookings = useMemo(() => {
    return bookings.filter((b) => b.studentId === currentUserId);
  }, [bookings, currentUserId]);

  const filteredBookings = useMemo(() => {
    if (selectedTab === 'All') return myBookings;
    return myBookings.filter((b) => b.status === selectedTab);
  }, [myBookings, selectedTab]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { All: myBookings.length };
    for (const tab of STATUS_TABS) {
      if (tab.key !== 'All') {
        map[tab.key] = myBookings.filter((b) => b.status === tab.key).length;
      }
    }
    return map;
  }, [myBookings]);

  const handleCancel = async (bookingId: string) => {
    setFeedbackError(null);
    setBusyBookingId(bookingId);
    try {
      await onCancelBooking(bookingId);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Unable to cancel booking.');
    } finally {
      setBusyBookingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="text-xs font-mono text-teal-700 font-semibold">
            MY BOOKINGS · CHECK-IN &amp; CHECK-OUT · EQUIPMENT CONDITION
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">My Bookings</h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Track your requests, check in when starting your session, record item condition before and after use, or cancel a request if your plans change.
          </p>
        </div>
        <button
          type="button"
          onClick={onBrowseCatalogue}
          className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          Book Another Resource
        </button>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-2">
        {STATUS_TABS.map((tab) => {
          const active = selectedTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSelectedTab(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {tab.label} <span className="font-mono ml-1 tabular-nums">({counts[tab.key] ?? 0})</span>
            </button>
          );
        })}
      </div>

      {feedbackError && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-800" role="alert">
          {feedbackError}
        </div>
      )}

      {/* Bookings List */}
      {filteredBookings.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center space-y-3">
          <Calendar className="w-8 h-8 text-slate-400 mx-auto" />
          <h2 className="text-base font-bold text-slate-900">
            No bookings found in this view
          </h2>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            Browse available school resources to book an Arduino kit, computer lab slot, or 3D printer.
          </p>
          <button
            type="button"
            onClick={onBrowseCatalogue}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800"
          >
            Browse Resources
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBookings.map((booking) => {
            const canCancel = ['Pending', 'Approved', 'Waitlisted'].includes(booking.status);
            const canCheckIn = booking.status === 'Approved';
            const canCheckOut = booking.status === 'CheckedIn';

            return (
              <article
                key={booking.id}
                className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    {/* Status and ID */}
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                      <span className="font-semibold text-slate-900">{booking.id}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-teal-700 font-semibold">{booking.resourceCode}</span>
                      <span aria-hidden="true">·</span>
                      <span>{booking.courseOrProjectCode}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-sans font-semibold ${
                          booking.status === 'Approved' || booking.status === 'Completed'
                            ? 'text-emerald-700'
                            : booking.status === 'CheckedIn'
                            ? 'text-teal-700'
                            : booking.status === 'Pending' || booking.status === 'Waitlisted'
                            ? 'text-amber-700'
                            : 'text-red-700'
                        }`}
                      >
                        Status: {DISPLAY_BOOKING_STATUS[booking.status]}
                      </span>
                    </div>

                    <h2 className="text-base font-bold text-slate-900">{booking.resourceName}</h2>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 font-mono tabular-nums">
                      <span>Date: {booking.date}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Time: {booking.startTime}–{booking.endTime} ({booking.durationHours} hours)
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-sans">{booking.resourceLocation}</span>
                    </div>

                    <p className="text-xs text-slate-700 pt-1">
                      <span className="font-semibold text-slate-900">Why needed:</span> {booking.purpose}
                    </p>

                    {/* Next Step Explanation */}
                    <div className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-700 flex items-start gap-2">
                      <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                      <div>{NEXT_STEP_GUIDE[booking.status]}</div>
                    </div>

                    {booking.managerDecisionNote && (
                      <p className="text-xs text-slate-700 bg-amber-50/70 border border-amber-200/80 rounded px-3 py-2 mt-2">
                        <span className="font-semibold text-slate-900">
                          Teacher/Manager Note ({booking.decidedByName || 'Lab Coordinator'}):
                        </span>{' '}
                        {booking.managerDecisionNote}
                      </p>
                    )}
                  </div>

                  {/* Contextual Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {canCheckIn && (
                      <button
                        type="button"
                        onClick={() => onOpenCheckInOut(booking, 'checkin')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 rounded-md hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
                      >
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        Check In &amp; Record Condition
                      </button>
                    )}

                    {canCheckOut && (
                      <button
                        type="button"
                        onClick={() => onOpenCheckInOut(booking, 'checkout')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Check Out &amp; Return Item
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onOpenReportIncidentForBooking(booking)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
                    >
                      <FileWarning className="w-3.5 h-3.5" />
                      Report a Problem
                    </button>

                    {canCancel && (
                      <button
                        type="button"
                        disabled={busyBookingId === booking.id}
                        onClick={() => handleCancel(booking.id)}
                        className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        {busyBookingId === booking.id ? 'Cancelling...' : 'Cancel Booking'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Condition Reports Before & After Use */}
                {(booking.beforeConditionReport || booking.afterConditionReport) && (
                  <div className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {booking.beforeConditionReport && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1">
                        <div className="flex items-center justify-between text-slate-600 font-mono tabular-nums">
                          <span className="font-sans font-semibold text-slate-900">
                            Condition When Checked In (Before Use)
                          </span>
                          <span>{new Date(booking.beforeConditionReport.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="font-semibold text-teal-800">{booking.beforeConditionReport.rating}</div>
                        <p className="text-slate-600">{booking.beforeConditionReport.notes}</p>
                      </div>
                    )}

                    {booking.afterConditionReport && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1">
                        <div className="flex items-center justify-between text-slate-600 font-mono tabular-nums">
                          <span className="font-sans font-semibold text-slate-900">
                            Condition When Returned (After Use)
                          </span>
                          <span>{new Date(booking.afterConditionReport.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="font-semibold text-emerald-800">{booking.afterConditionReport.rating}</div>
                        <p className="text-slate-600">{booking.afterConditionReport.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
