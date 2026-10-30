import net from "net";

/**
 * Validates whether a target URL or hostname points to a dangerous internal/private network.
 */
export function isPrivateOrBlockedDestination(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();

    // Check prohibited schemes
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return true;
    }

    // Strip square brackets if IPv6 URL format (e.g., [::1])
    const cleanHost = hostname.replace(/^\[|\]$/g, "");

    // Check dangerous hostnames
    if (
      cleanHost === "localhost" ||
      cleanHost === "::1" ||
      cleanHost.endsWith(".local") ||
      cleanHost.endsWith(".internal") ||
      cleanHost === "169.254.169.254" || // AWS / GCP / Azure metadata
      cleanHost === "metadata.google.internal"
    ) {
      return true;
    }

    // If hostname is an IP literal, inspect its range
    if (net.isIP(cleanHost)) {
      return isPrivateIp(cleanHost);
    }

    return false;
  } catch {
    return true; // Malformed URLs are blocked
  }
}

export function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip === "127.0.0.1") return true;

  // IPv4 checks
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;
    // 10.0.0.0/8 (RFC 1918)
    if (parts[0] === 10) return true;
    // 172.16.0.0/12 (RFC 1918)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16 (RFC 1918)
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 169.254.0.0/16 (Link Local / Metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0
    if (parts[0] === 0) return true;
  }

  // IPv6 unique local / link-local / loopback
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (
      normalized === "::1" ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd")
    ) {
      return true;
    }
  }

  return false;
}
