import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE_NAME = "erp_session";

function getJwtSecret(): Uint8Array {
  const secret =
    process.env.AUTH_SECRET ||
    "dev-secret-key-erp-manajemen-secure-32-chars-token";
  return new TextEncoder().encode(secret);
}

/**
 * Map of URL prefixes → required permissions (ANY one is enough).
 * Checked top-to-bottom; first match wins.
 * Order: most-specific first.
 */
const ROUTE_PERMISSION_MAP: Array<{ prefix: string; permissions: string[] }> = [
  // Admin-only
  { prefix: "/dashboard/admin", permissions: ["company.manage"] },
  { prefix: "/dashboard/audit", permissions: ["audit.view"] },

  // Accounting
  {
    prefix: "/dashboard/accounting/periods",
    permissions: ["accounting.manage"],
  },
  {
    prefix: "/dashboard/accounting",
    permissions: ["accounting.view"],
  },

  // Finance / AR / AP
  {
    prefix: "/dashboard/ar-ap/payments",
    permissions: ["finance.manage"],
  },
  {
    prefix: "/dashboard/ar-ap",
    permissions: ["finance.view"],
  },
  {
    prefix: "/dashboard/finance",
    permissions: ["finance.view"],
  },

  // Intercompany & Consolidation
  {
    prefix: "/dashboard/intercompany",
    permissions: ["intercompany.view"],
  },
  {
    prefix: "/dashboard/consolidation",
    permissions: ["reports.view"],
  },
  {
    prefix: "/dashboard/analysis",
    permissions: ["reports.view"],
  },

  // Assets
  {
    prefix: "/dashboard/assets",
    permissions: ["asset.view"],
  },

  // Inventory
  {
    prefix: "/dashboard/inventory/receiving",
    permissions: ["inventory.manage"],
  },
  {
    prefix: "/dashboard/inventory/transfers",
    permissions: ["inventory.manage"],
  },
  {
    prefix: "/dashboard/inventory/adjustments",
    permissions: ["inventory.manage"],
  },
  {
    prefix: "/dashboard/inventory",
    permissions: ["inventory.view"],
  },

  // Purchasing
  {
    prefix: "/dashboard/purchasing",
    permissions: ["purchasing.view"],
  },

  // Sales
  {
    prefix: "/dashboard/sales",
    permissions: ["sales.view"],
  },

  // Master Data - RESTRICTED TO SUPER ADMIN ONLY
  {
    prefix: "/dashboard/master",
    permissions: ["master_data.access"], // Dummy permission, Super Admin bypasses
  },

  // Dashboard & approvals
  {
    prefix: "/dashboard/approvals",
    permissions: [
      "purchasing.manage",
      "sales.manage",
      "finance.manage",
      "inventory.manage",
    ],
  },
  {
    prefix: "/dashboard",
    permissions: ["dashboard.view"],
  },
];

interface JwtPayload {
  userId: number;
  roles: string[];
  permissions: string[];
  companyIds: number[];
  [key: string]: unknown;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  let isAuthenticated = false;
  let payload: JwtPayload | null = null;

  if (sessionCookie) {
    try {
      const secret = getJwtSecret();
      const { payload: p } = await jwtVerify(sessionCookie, secret);
      payload = p as unknown as JwtPayload;
      isAuthenticated = true;
    } catch {
      isAuthenticated = false;
    }
  }

  // ─── 1. Login redirect if already authenticated ───────────────────────────
  if (pathname === "/login" && isAuthenticated) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard"; // Next.js will auto-prefix with /silete
    return NextResponse.redirect(url);
  }

  // ─── 2. Dashboard routes require authentication ───────────────────────────
  if (pathname.startsWith("/dashboard")) {
    if (!isAuthenticated) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }

    // SUPER_ADMIN bypasses all permission checks
    if (!payload?.roles?.includes("SUPER_ADMIN")) {
      const matchedRule = ROUTE_PERMISSION_MAP.find((rule) =>
        pathname.startsWith(rule.prefix)
      );

      if (matchedRule) {
        const userPerms: string[] = payload?.permissions ?? [];
        const hasAccess = matchedRule.permissions.some((p) =>
          userPerms.includes(p)
        );

        if (!hasAccess) {
          const url = req.nextUrl.clone();
          url.pathname = "/login";
          url.searchParams.set("error", "forbidden");
          return NextResponse.redirect(url);
        }
      }
    }
  }

  // ─── 3. Protected API routes ──────────────────────────────────────────────
  if (pathname.startsWith("/api/")) {
    const isPublicApi =
      pathname.startsWith("/api/auth/login") ||
      pathname.startsWith("/api/auth/logout") ||
      pathname.startsWith("/api/health");

    if (!isPublicApi && !isAuthenticated) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unauthenticated: Autentikasi server-side diperlukan untuk mengakses API ini.",
        },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/api/:path*"],
};
