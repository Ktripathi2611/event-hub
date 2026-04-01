type AnyObject = Record<string, any>;

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

const assert = (condition: any, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const requestJson = async (
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<{ status: number; data: any }> => {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (!headers['Content-Type'] && options.body) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { status: response.status, data };
};

const login = async (email: string, password: string) => {
  const { status, data } = await requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  assert(status === 200, `Login failed for ${email}: ${status} ${JSON.stringify(data)}`);
  assert(data?.token, `Missing token for ${email}`);
  return data;
};

const registerStudent = async (suffix: string) => {
  const payload = {
    name: `QA Student ${suffix}`,
    email: `qa-student-${suffix}@college.com`,
    password: 'admin123',
    role: 'student',
  };

  const { status, data } = await requestJson('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  assert(status === 200, `Student registration failed: ${status} ${JSON.stringify(data)}`);
  return data;
};

const getFirstBookableTicket = async () => {
  const { status: eventsStatus, data: events } = await requestJson('/api/events');
  assert(eventsStatus === 200, 'Failed to list events');
  assert(Array.isArray(events) && events.length > 0, 'No approved events available for QA booking');

  for (const event of events) {
    const { status: detailStatus, data: detail } = await requestJson(`/api/events/${event.id}`);
    if (detailStatus !== 200) continue;
    if (Array.isArray(detail.ticketTypes) && detail.ticketTypes.length > 0) {
      return { event: detail, ticketType: detail.ticketTypes[0] };
    }
  }

  throw new Error('No event with available ticket types found');
};

const bookTicket = async (studentToken: string, studentId: string) => {
  const { event, ticketType } = await getFirstBookableTicket();
  const { status, data } = await requestJson(
    '/api/bookings',
    {
      method: 'POST',
      body: JSON.stringify({
        user_id: studentId,
        event_id: event.id,
        ticket_type_id: ticketType.id,
        quantity: 1,
      }),
    },
    studentToken
  );

  assert(status === 200, `Booking failed: ${status} ${JSON.stringify(data)}`);
  assert(data?.ticket_id, 'Booking response missing ticket_id');
  return { booking: data, event };
};

const verifyTicket = async (hostToken: string, input: AnyObject) => {
  return requestJson(
    '/api/verify-ticket',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    hostToken
  );
};

const run = async () => {
  const host = await login('host@college.com', 'admin123');

  const suffix = `${Date.now()}`;
  const student = await registerStudent(suffix);
  const { booking, event } = await bookTicket(student.token, student.id);

  const validScan = await verifyTicket(host.token, {
    ticketId: booking.ticket_id,
    eventId: event.id,
  });
  assert(validScan.status === 200, `Valid scan failed: ${validScan.status} ${JSON.stringify(validScan.data)}`);
  assert(validScan.data?.ticket?.verification_status === 'VERIFIED_ATTENDANCE', 'Ticket status did not move to VERIFIED_ATTENDANCE');

  const duplicateScan = await verifyTicket(host.token, {
    ticketId: booking.ticket_id,
    eventId: event.id,
  });
  assert(duplicateScan.status === 200, 'Duplicate scan should be handled idempotently');
  assert(duplicateScan.data?.alreadyCheckedIn === true, 'Duplicate scan should report already checked in');

  const invalidScan = await verifyTicket(host.token, {
    qrToken: 'definitely-invalid-token',
    eventId: event.id,
  });
  assert(invalidScan.status === 400, 'Invalid QR token should return 400');

  const statusRes = await requestJson(`/api/ticket-status?ticketId=${encodeURIComponent(booking.ticket_id)}`, {}, student.token);
  assert(statusRes.status === 200, `Ticket status endpoint failed: ${statusRes.status}`);
  assert(statusRes.data?.status === 'VERIFIED_ATTENDANCE', 'Ticket status endpoint should return VERIFIED_ATTENDANCE');

  const studentB = await registerStudent(`${Date.now()}-b`);
  const { booking: bookingB } = await bookTicket(studentB.token, studentB.id);

  const [raceA, raceB] = await Promise.all([
    verifyTicket(host.token, { ticketId: bookingB.ticket_id, eventId: event.id }),
    verifyTicket(host.token, { ticketId: bookingB.ticket_id, eventId: event.id }),
  ]);

  const raceOk = [raceA, raceB].every((x) => x.status === 200);
  assert(raceOk, 'Concurrent verify requests should be handled safely');
  const alreadyCount = [raceA.data, raceB.data].filter((x) => x?.alreadyCheckedIn === true).length;
  assert(alreadyCount >= 1, 'At least one concurrent verify response should report already checked in');

  console.log('QA PASS: ticket verification flow validated (valid, duplicate, invalid, concurrent, status endpoint).');
};

run().catch((error) => {
  console.error('QA FAIL:', error.message || error);
  process.exit(1);
});
