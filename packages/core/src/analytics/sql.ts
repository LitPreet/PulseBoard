import { sql, type SQL } from "drizzle-orm";
import type { PropertyFilter } from "./types";

/** SQL that renders a timestamp (without tz, already in UTC) as an ISO string. */
export const iso = (expr: SQL) => sql`to_char(${expr}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

/**
 * Compile property filters into a WHERE fragment. Keys and values are bound parameters;
 * `alias` is a fixed table alias from our own code, never user input.
 */
export function filtersSql(filters: PropertyFilter[] | undefined, alias?: "e"): SQL {
  if (!filters?.length) return sql``;
  const props = alias ? sql.raw(`${alias}.properties`) : sql.raw("properties");
  const parts = filters.map((f) => {
    const val = sql`(${props} ->> ${f.key})`;
    const v = f.value === undefined ? "" : String(f.value);
    switch (f.op) {
      case "eq":
        return sql`${val} = ${v}`;
      case "neq":
        return sql`${val} is distinct from ${v}`;
      case "contains":
        return sql`${val} ilike ${"%" + escapeLike(v) + "%"}`;
      case "not_contains":
        return sql`coalesce(${val}, '') not ilike ${"%" + escapeLike(v) + "%"}`;
      case "is_set":
        return sql`${val} is not null`;
      case "is_not_set":
        return sql`${val} is null`;
      case "gt":
      case "lt": {
        const num = sql`case when ${val} ~ '^-?[0-9]+(\\.[0-9]+)?$' then ${val}::numeric end`;
        return f.op === "gt" ? sql`${num} > ${Number(v)}` : sql`${num} < ${Number(v)}`;
      }
    }
  });
  return sql` and ${sql.join(parts, sql` and `)}`;
}

function escapeLike(v: string) {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`);
}
