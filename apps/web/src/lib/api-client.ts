/**
 * Centralized API configuration for FlowForge Web
 * Directs browser API calls through NEXT_PUBLIC_API_URL or the Next.js /api proxy rewrite
 */
export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    // In browser context: use configured public URL or empty string (using local /api rewrite proxy)
    return process.env.NEXT_PUBLIC_API_URL || "";
  }
  // Server-side context: resolve to internal service port
  return (
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    "http://localhost:4000"
  );
}
