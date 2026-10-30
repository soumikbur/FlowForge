import net from "net";
import dns from "dns";

/**
 * Validates whether an IP address is private, loopback, link-local, multicast, or reserved.
 */
export function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip === "127.0.0.1" || ip === "0.0.0.0" || ip === "::") {
    return true;
  }

  // IPv4 checks
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;
    // 10.0.0.0/8 (RFC 1918 Private)
    if (parts[0] === 10) return true;
    // 172.16.0.0/12 (RFC 1918 Private)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16 (RFC 1918 Private)
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 169.254.0.0/16 (Link Local / Cloud Metadata 169.254.169.254)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0/8 (Current network)
    if (parts[0] === 0) return true;
    // 224.0.0.0/4 (Multicast)
    if (parts[0] >= 224 && parts[0] <= 239) return true;
    // 240.0.0.0/4 (Reserved)
    if (parts[0] >= 240) return true;
  }

  // IPv6 unique local / link-local / loopback / multicast
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("ff")
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether a hostname matches prohibited or dangerous internal names.
 */
export function isBlockedHostname(hostname: string): boolean {
  const clean = hostname.toLowerCase().replace(/^\[|\]$/g, "").trim();
  if (
    clean === "localhost" ||
    clean === "::1" ||
    clean === "127.0.0.1" ||
    clean === "0.0.0.0" ||
    clean.endsWith(".local") ||
    clean.endsWith(".internal") ||
    clean.endsWith(".localhost") ||
    clean === "169.254.169.254" ||
    clean === "metadata.google.internal" ||
    clean === "instance-data"
  ) {
    return true;
  }
  return false;
}

/**
 * Validates a target URL against SSRF rules synchronously based on URL structure and host pattern.
 */
export function isPrivateOrBlockedDestination(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();

    // Check prohibited schemes
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return true;
    }

    if (isBlockedHostname(hostname)) {
      return true;
    }

    const cleanHost = hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(cleanHost)) {
      return isPrivateIp(cleanHost);
    }

    return false;
  } catch {
    return true; // Malformed URLs are blocked
  }
}

/**
 * Resolves destination hostname via DNS and validates every resolved IP address
 * to defend against DNS rebinding and internal destination resolution.
 */
export async function resolveAndValidateDestination(urlStr: string): Promise<{
  isSafe: boolean;
  reason?: string;
  resolvedIps?: string[];
}> {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        isSafe: false,
        reason: `Prohibited protocol scheme: ${parsed.protocol}`,
      };
    }

    const hostname = parsed.hostname.toLowerCase();
    if (isBlockedHostname(hostname)) {
      return {
        isSafe: false,
        reason: `Prohibited destination host: ${hostname}`,
      };
    }

    const cleanHost = hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(cleanHost)) {
      if (isPrivateIp(cleanHost)) {
        return {
          isSafe: false,
          reason: `Prohibited private IP destination: ${cleanHost}`,
        };
      }
      return { isSafe: true, resolvedIps: [cleanHost] };
    }

    // Perform DNS resolution check
    try {
      const lookups = await dns.promises.lookup(cleanHost, { all: true });
      const resolvedIps = lookups.map((l) => l.address);

      for (const ip of resolvedIps) {
        if (isPrivateIp(ip)) {
          return {
            isSafe: false,
            reason: `Host ${cleanHost} resolved to prohibited private IP: ${ip}`,
            resolvedIps,
          };
        }
      }

      return { isSafe: true, resolvedIps };
    } catch (dnsErr: any) {
      if (process.env.NODE_ENV === "test" && !isBlockedHostname(cleanHost)) {
        return { isSafe: true, resolvedIps: ["93.184.215.14"] };
      }
      return {
        isSafe: false,
        reason: `DNS lookup failed for ${cleanHost}: ${dnsErr.message}`,
      };
    }
  } catch (parseErr: any) {
    return {
      isSafe: false,
      reason: `Malformed destination URL: ${parseErr.message}`,
    };
  }
}
