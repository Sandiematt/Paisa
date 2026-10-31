/**
 * A database without a migration yet answers with these codes: an unknown
 * column, table or function. Features built on that migration switch off
 * instead of breaking what already worked, so an app update reaching people
 * before the database does keeps loading their ledger.
 */
const MISSING_SCHEMA_CODES = new Set([
  '42703', // undefined_column
  '42P01', // undefined_table
  '42883', // undefined_function
  'PGRST202', // function not in the schema cache
  'PGRST204', // column not in the schema cache
  'PGRST205', // table not in the schema cache
]);

export function isMissingSchema(error: {code?: string | null} | null | undefined): boolean {
  return typeof error?.code === 'string' && MISSING_SCHEMA_CODES.has(error.code);
}
