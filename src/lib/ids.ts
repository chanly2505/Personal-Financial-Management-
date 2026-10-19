const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True for a well-formed UUID. Record ids from URLs are checked before they
 * reach the database: PostgreSQL rejects a malformed uuid with an error, which
 * would show "Something went wrong" instead of "Not found".
 */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
