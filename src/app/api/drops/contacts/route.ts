import { NextRequest, NextResponse } from 'next/server';
import { authenticateSession, unauthorizedResponse } from '@/lib/api/auth';
import { listTransferContacts } from '@/lib/drops/queries';

// Addresses this studio has sent transfers to, for the recipient picker.
export async function GET(request: NextRequest) {
  const auth = await authenticateSession(request);
  if (!auth.authenticated) return unauthorizedResponse(auth.error);
  return NextResponse.json({ contacts: await listTransferContacts() });
}
