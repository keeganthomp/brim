import { describe, expect, it } from 'vitest';
import { localDatabaseUrl } from '../../../infra/local/database';

describe('local database configuration boundary', () => {
  it.each([
    'postgres://user:password@localhost:5432/brim',
    'postgresql://user:password@127.0.0.1:5432/brim',
    'postgres://user:password@[::1]:5432/brim',
  ])('accepts a direct loopback database URL', (value) => {
    expect(localDatabaseUrl(value)).toBeInstanceOf(URL);
  });

  it.each([
    'postgres://database.example/brim',
    'https://localhost/brim',
    'postgres://localhost/brim?application_name=brim',
    'postgres://localhost/brim#fragment',
    'invalid',
  ])('rejects remote, query-bearing, or malformed local configuration', (value) => {
    expect(localDatabaseUrl(value)).toBeNull();
  });
});
