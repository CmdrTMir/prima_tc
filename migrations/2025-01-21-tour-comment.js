export async function up(db) {
    await db.schema
        .alterTable('tour')
        .addColumn('comment', 'varchar', (col) => col.defaultTo(null))
        .execute();
}

export async function down(db) {
    await db.schema
        .alterTable('tour')
        .dropColumn('comment')
        .execute();
}
