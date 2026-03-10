// middleware.ts  (project root, next to package.json)
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) { return request.cookies.get(name)?.value; },
        set(name, value, options) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name, options) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();
  const pathname = request.nextUrl.pathname;

  // Allow public paths
  if (pathname.startsWith("/auth") || pathname.startsWith("/_next") || pathname.startsWith("/api/auth")) {
    return response;
  }

  // Not logged in → redirect to /auth/login
  if (!session) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  // ── Email whitelist check ──────────────────────────────────────────────────
  // We query the members table. Use the service-role key here so RLS doesn't
  // block the check itself. Store it only server-side (not NEXT_PUBLIC_).
  const { data: member } = await supabase
    .from("members")
    .select("id, active")
    .eq("email", session.user.email!)
    .single();

  if (!member) {
    // Email not in members table → sign out and show not-allowed page
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/auth/not-allowed", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
