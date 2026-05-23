// Generate DDL / scripts from a parsed schema. Pure, no side effects.

import type { ColumnDef, TableDetails } from './types';

function quoteIdent(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"';
}

/**
 * Produce a best-effort CREATE TABLE statement. Includes column types,
 * NULL/NOT NULL, defaults, and a PRIMARY KEY clause if PKs exist. Indexes,
 * foreign keys, and constraints are appended as separate statements.
 */
export function generateCreateScript(d: TableDetails): string {
  const target = quoteIdent(d.schema) + '.' + quoteIdent(d.name);
  const lines: string[] = [];

  const colLines = d.columns.map((c) => formatColumn(c));
  const pkCols = d.columns.filter((c) => c.isPrimaryKey).map((c) => c.name);

  let create = `CREATE TABLE ${target} (\n  ${colLines.join(',\n  ')}`;
  if (pkCols.length) {
    create += `,\n  PRIMARY KEY (${pkCols.map(quoteIdent).join(', ')})`;
  }
  create += '\n);';
  lines.push(create);

  if (d.comment) {
    lines.push(
      `COMMENT ON TABLE ${target} IS ${quoteLit(d.comment)};`,
    );
  }
  for (const c of d.columns) {
    if (c.comment) {
      lines.push(
        `COMMENT ON COLUMN ${target}.${quoteIdent(c.name)} IS ${quoteLit(c.comment)};`,
      );
    }
  }

  for (const idx of d.indexes) {
    if (idx.isPrimary) continue; // already in PK
    lines.push(idx.definition + ';');
  }
  for (const fk of d.foreignKeys) {
    lines.push(
      `ALTER TABLE ${target} ADD CONSTRAINT ${quoteIdent(fk.name)} FOREIGN KEY (${fk.columns.map(quoteIdent).join(', ')}) REFERENCES ${quoteIdent(fk.refSchema)}.${quoteIdent(fk.refTable)} (${fk.refColumns.map(quoteIdent).join(', ')})${fk.onDelete && fk.onDelete !== 'NO ACTION' ? ' ON DELETE ' + fk.onDelete : ''}${fk.onUpdate && fk.onUpdate !== 'NO ACTION' ? ' ON UPDATE ' + fk.onUpdate : ''};`,
    );
  }

  return lines.join('\n\n');
}

function formatColumn(c: ColumnDef): string {
  const parts = [quoteIdent(c.name), c.fullType];
  if (!c.nullable) parts.push('NOT NULL');
  if (c.default) parts.push('DEFAULT ' + c.default);
  return parts.join(' ');
}

function quoteLit(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}
