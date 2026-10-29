/**
 * ResourceBridge — Campus Timezone & DateTime Utilities
 *
 * Configured specifically for Indian educational institutions in Asia/Kolkata (IST).
 * Indian Standard Time is fixed at UTC+05:30 with no Daylight Saving Time (DST).
 */

export const CAMPUS_TIMEZONE = 'Asia/Kolkata';
export const CAMPUS_TZ_OFFSET = '+05:30';

/**
 * Returns today's calendar date on campus (IST) formatted as YYYY-MM-DD.
 */
export function getCampusTodayDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CAMPUS_TIMEZONE }).format(new Date());
}

/**
 * Converts a campus calendar date (YYYY-MM-DD) and campus local time (HH:00 or HH:MM)
 * into an absolute ISO-8601 UTC timestamp string suitable for PostgreSQL TIMESTAMPTZ.
 *
 * Example:
 *   toCampusTimestamp('2026-10-29', '10:00') => '2026-10-29T04:30:00.000Z'
 */
export function toCampusTimestamp(date: string, time: string): string {
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  const isoWithOffset = `${date}T${normalizedTime}${CAMPUS_TZ_OFFSET}`;
  return new Date(isoWithOffset).toISOString();
}

/**
 * Formats an ISO UTC timestamp or date into campus local time (HH:MM IST).
 */
export function formatCampusTime(isoString: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CAMPUS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(isoString));
}

/**
 * Formats an ISO UTC timestamp or date into campus local date & time (e.g. "29 Oct 2026, 10:00 IST").
 */
export function formatCampusDateTime(isoString: string): string {
  const d = new Date(isoString);
  const datePart = new Intl.DateTimeFormat('en-GB', {
    timeZone: CAMPUS_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
  const timePart = new Intl.DateTimeFormat('en-GB', {
    timeZone: CAMPUS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return `${datePart}, ${timePart} IST`;
}
