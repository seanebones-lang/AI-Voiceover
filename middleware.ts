// Updated with CORS + CSRF
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { generateCSRF, validateCSRF } from '@/lib/security';

// CORS origins
export const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://*.railway.app',
  'https://*.vercel.app',
];

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // CORS
  const origin = request.headers.get('origin') ?? '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  // CSRF for non-GET
  if (request.method !== 'GET') {
    const csrfToken = request.headers.get('x-csrf-token');
    const sessionToken = request.cookies.get('csrf')?.value;
    if (!validateCSRF(csrfToken || '', sessionToken || '')) {
      return NextResponse.json({ error: 'Invalid CSRF' }, { status: 403 });
    }
  }

  return response;
}

export const config = {
  matcher: '/((?!api|_next/static|_next/image|favicon.ico).*)',
};