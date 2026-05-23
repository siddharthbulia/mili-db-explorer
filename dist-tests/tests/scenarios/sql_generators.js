"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const harness_1 = require("../harness");
const sql_generators_1 = require("../../src/shared/sql-generators");
function tbl(over = {}) {
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
(0, harness_1.group)('sql-generators — generateCreateScript', () => {
    (0, harness_1.test)('basic table emits CREATE TABLE with columns', () => {
        const out = (0, sql_generators_1.generateCreateScript)(tbl());
        (0, harness_1.eq)(out.startsWith('CREATE TABLE "public"."users" ('), true);
    });
    (0, harness_1.test)('preserves NOT NULL and DEFAULT', () => {
        const out = (0, sql_generators_1.generateCreateScript)(tbl());
        (0, harness_1.eq)(out.includes('"id" uuid NOT NULL DEFAULT gen_random_uuid()'), true);
        (0, harness_1.eq)(out.includes('"email" varchar(255) NOT NULL'), true);
    });
    (0, harness_1.test)('emits PRIMARY KEY clause', () => {
        const out = (0, sql_generators_1.generateCreateScript)(tbl());
        (0, harness_1.eq)(out.includes('PRIMARY KEY ("id")'), true);
    });
    (0, harness_1.test)('emits COMMENT ON TABLE when present', () => {
        const out = (0, sql_generators_1.generateCreateScript)(tbl({ comment: 'app users' }));
        (0, harness_1.eq)(out.includes(`COMMENT ON TABLE "public"."users" IS 'app users';`), true);
    });
    (0, harness_1.test)('escapes single quotes in comments', () => {
        const out = (0, sql_generators_1.generateCreateScript)(tbl({ comment: "it's mine" }));
        (0, harness_1.eq)(out.includes(`'it''s mine'`), true);
    });
    (0, harness_1.test)('emits non-primary index definitions', () => {
        const out = (0, sql_generators_1.generateCreateScript)(tbl({
            indexes: [
                { name: 'pk', definition: 'CREATE UNIQUE INDEX pk', isUnique: true, isPrimary: true, size: '' },
                { name: 'idx_email', definition: 'CREATE INDEX idx_email ON public.users (email)', isUnique: false, isPrimary: false, size: '' },
            ],
        }));
        (0, harness_1.eq)(out.includes('CREATE UNIQUE INDEX pk'), false); // skipped — covered by PK clause
        (0, harness_1.eq)(out.includes('CREATE INDEX idx_email'), true);
    });
    (0, harness_1.test)('emits FOREIGN KEY constraints', () => {
        const out = (0, sql_generators_1.generateCreateScript)(tbl({
            foreignKeys: [
                { name: 'fk_owner', columns: ['owner_id'], refSchema: 'public', refTable: 'orgs', refColumns: ['id'], onDelete: 'CASCADE', onUpdate: 'NO ACTION' },
            ],
        }));
        (0, harness_1.eq)(out.includes('ADD CONSTRAINT "fk_owner" FOREIGN KEY ("owner_id") REFERENCES "public"."orgs" ("id") ON DELETE CASCADE'), true);
    });
});
