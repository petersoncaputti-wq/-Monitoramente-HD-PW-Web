import { isIP } from 'node:net';
import { ipKeyGenerator } from 'express-rate-limit';

export function normalizeClientIp(value) {
  const address = String(value ?? '').trim();
  if (isIP(address)) return address;

  // Azure may append the client port to IPv4 or bracketed IPv6.
  const endpoint = address.match(/^\[([^\]]+)\]:(\d+)$/)
    || address.match(/^(\d+\.\d+\.\d+\.\d+):(\d+)$/);
  if (endpoint && isIP(endpoint[1])) return endpoint[1];
  return null;
}

export function clientIpKeyGenerator(request) {
  const address = normalizeClientIp(request.ip)
    || normalizeClientIp(request.socket?.remoteAddress);
  return address ? ipKeyGenerator(address) : 'unknown-client';
}
