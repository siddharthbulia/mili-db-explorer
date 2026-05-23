import { group, test, eq } from '../harness';
import { generateCreateScript } from '../../src/shared/sql-generators';
import type { TableDetails } from '../../src/shared/types';

function tbl(over: Partial<TableDetails> = {}): TableDetails {
  return {
    schema: 'public', name: 'users', kind: 'r', comment: null,
    estimatedRows: 0, size: '8 kB',
    columns: [
      { name: 'id', dataType: 'uuid', fullType: 'uuid', nullable: false, default: 'gen_random_uuid()', isPrimaryKey: true, isIdentity: false, position: 1, comment: null, maxLength: null },
      { name: 'email', dataType: 'varchar', fullType: 'varchar(255)', nullable: false, default: null, isPrimaryKey: false, isIdentity: false, position: 2, comment: null, maxLength: 255 },
      { name: 'created_at', dataType: 'timestamptz', fullType: 'timestamptz', nullable: false, default: 'now()', isPrimaryKey: false, isIdentity: false, position: 3, comment: null, maxLength: null },
    ],
    indexes: [],
    foreignKeys: [],
    constraints: [],
    triggers: [],
    ...over,
  };
}

group('sql-generators — generateCreateScript', () => {
  test('basic table emits CREATE TABLE with columns', () => {
    const out = generateCreateScript(tbl());
    eq(out.startsWith('CREATE TABLE "public"."users" ('), true);
  });
  test('preserves NOT NULL and DEFAULT', () => {
    const out = generateCreateScript(tbl());
    eq(out.includes('"id" uuid NOT NULL DEFAULT gen_random_uuid()'), true);
    eq(out.includes('"email" varchar(255) NOT NULL'), true);
  });
  test('emits PRIMARY KEY clause', () => {
    const out = generateCreateScript(tbl());
    eq(out.includes('PRIMARY KEY ("id")'), true);
  });
  test('emits COMMENT ON TABLE when present', () => {
    const out = generateCreateScript(tbl({ comment: 'app users' }));
    eq(out.includes(`COMMENT ON TABLE "public"."users" IS 'app users';`), true);
  });
  test('escapes single quotes in comments', () => {
    const out = generateCreateScript(tbl({ comment: "it's mine" }));
    eq(out.includes(`'it''s mine'`), true);
  });
  test('emits non-primary index definitions', () => {
    const out = generateCreateScript(tbl({
      indexes: [
        { name: 'pk', definition: 'CREATE UNIQUE INDEX pk', isUnique: true, isPrimary: true, size: '' },
        { name: 'idx_email', definition: 'CREATE INDEX idx_email ON public.users (email)', isUnique: false, isPrimary: false, size: '' },
      ],
    }));
    eq(out.includes('CREATE UNIQUE INDEX pk'), false); // skipped — covered by PK clause
    eq(out.includes('CREATE INDEX idx_email'), true);
  });
  test('emits FOREIGN KEY constraints', () => {
    const out = generateCreateScript(tbl({
      foreignKeys: [
        { name: 'fk_owner', columns: ['owner_id'], refSchema: 'public', refTable: 'orgs', refColumns: ['id'], onDelete: 'CASCADE', onUpdate: 'NO ACTION' },
      ],
    }));
    eq(out.includes('ADD CONSTRAINT "fk_owner" FOREIGN KEY ("owner_id") REFERENCES "public"."orgs" ("id") ON DELETE CASCADE'), true);
  });
});
