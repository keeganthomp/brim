/** Local tools only need a direct loopback DSN. pg query options can override its host or load TLS files. */
export function localDatabaseUrl(connectionString: string): URL | null {
  const url = URL.parse(connectionString);
  return url &&
    ['postgres:', 'postgresql:'].includes(url.protocol) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
    !url.search &&
    !url.hash
    ? url
    : null;
}
