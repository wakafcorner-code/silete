"use client";

import { useState, useEffect } from "react";
import { UserSessionPayload } from "@/services/session-service";

/**
 * Client-side hook to fetch and cache the current user's session.
 * Fetches from /api/auth/me on mount.
 */
export function useSession() {
  const [session, setSession] = useState<UserSessionPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.success && data.user) {
            setSession(data.user);
          }
        }
      } catch {
        // silently fail; protected pages will redirect via middleware
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  /**
   * Returns true if the user has ANY of the given permissions.
   * SUPER_ADMIN always returns true regardless of permission check.
   */
  function hasPermission(requiredPermissions?: string[]): boolean {
    if (!session) return false;
    if (!requiredPermissions || requiredPermissions.length === 0) return true;
    // SUPER_ADMIN sees everything
    if (session.roles?.includes("SUPER_ADMIN")) return true;
    const userPerms = (session.permissions ?? []) as string[];
    return requiredPermissions.some((p) => userPerms.includes(p));
  }

  return { session, loading, hasPermission };
}
