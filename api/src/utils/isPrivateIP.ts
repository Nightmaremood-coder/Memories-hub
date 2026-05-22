export function isPrivateIP(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/, '');
  return (
    /^10\./.test(clean) ||
    /^192\.168\./.test(clean) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(clean) ||
    clean === '127.0.0.1' ||
    clean === '::1'
  );
}
