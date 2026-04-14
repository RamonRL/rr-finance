"""
migrate_sqlite_to_postgres.py

Reads all data from a local SQLite file and inserts it into a PostgreSQL
database, respecting foreign-key dependency order.

Environment variables:
  SQLITE_PATH   – path to the SQLite file (default: ./database/rr_finance.db)
  DATABASE_URL  – PostgreSQL connection URL (read from .env if present)

Usage:
  SQLITE_PATH=database/rr_finance.db python migrate_sqlite_to_postgres.py
"""

import os
import sys

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text, MetaData, Table
from sqlalchemy.dialects.postgresql import insert as pg_insert

load_dotenv()

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SQLITE = os.path.join(SCRIPT_DIR, "database", "rr_finance.db")

SQLITE_PATH = os.getenv("SQLITE_PATH", DEFAULT_SQLITE)
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable is not set.")
    sys.exit(1)

if not os.path.exists(SQLITE_PATH):
    print(f"ERROR: SQLite file not found: {SQLITE_PATH}")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Connect to both databases
# ---------------------------------------------------------------------------

sqlite_engine = create_engine(f"sqlite:///{SQLITE_PATH}", connect_args={"check_same_thread": False})
pg_engine = create_engine(DATABASE_URL)

# ---------------------------------------------------------------------------
# Reflect SQLite schema
# ---------------------------------------------------------------------------

sqlite_inspector = inspect(sqlite_engine)
sqlite_meta = MetaData()
sqlite_meta.reflect(bind=sqlite_engine)

# ---------------------------------------------------------------------------
# Determine table order (respect foreign keys)
# ---------------------------------------------------------------------------

def topological_sort(tables):
    """Return tables in dependency order (dependencies first)."""
    graph = {t.name: set() for t in tables}
    table_map = {t.name: t for t in tables}

    for table in tables:
        for fk in table.foreign_keys:
            dep = fk.column.table.name
            if dep in graph and dep != table.name:
                graph[table.name].add(dep)

    visited = set()
    result = []

    def visit(name):
        if name in visited:
            return
        visited.add(name)
        for dep in graph.get(name, []):
            visit(dep)
        result.append(name)

    for name in graph:
        visit(name)

    return [table_map[name] for name in result]

ordered_tables = topological_sort(list(sqlite_meta.tables.values()))

# ---------------------------------------------------------------------------
# Migrate data
# ---------------------------------------------------------------------------

BATCH_SIZE = 500
migrated = {}
failed = []

with sqlite_engine.connect() as sqlite_conn, pg_engine.connect() as pg_conn:
    pg_meta = MetaData()
    pg_meta.reflect(bind=pg_engine)

    for table in ordered_tables:
        table_name = table.name

        # Check if target table exists in PostgreSQL
        if table_name not in pg_meta.tables:
            print(f"  WARNING: Table '{table_name}' does not exist in PostgreSQL — skipping.")
            continue

        pg_table = pg_meta.tables[table_name]

        # Check if destination already has data
        row_count_result = pg_conn.execute(text(f'SELECT COUNT(*) FROM "{table_name}"'))
        existing_count = row_count_result.scalar()
        if existing_count > 0:
            print(f"  SKIP: '{table_name}' already has {existing_count} rows — skipping to avoid duplicates.")
            migrated[table_name] = 0
            continue

        try:
            rows = sqlite_conn.execute(table.select()).mappings().all()
            rows = [dict(r) for r in rows]

            if not rows:
                print(f"  INFO: '{table_name}' is empty in SQLite — nothing to migrate.")
                migrated[table_name] = 0
                continue

            inserted = 0
            for i in range(0, len(rows), BATCH_SIZE):
                batch = rows[i : i + BATCH_SIZE]
                pg_conn.execute(pg_table.insert(), batch)
                inserted += len(batch)

            pg_conn.commit()
            migrated[table_name] = inserted
            print(f"  OK: '{table_name}' — {inserted} rows migrated.")

        except Exception as exc:
            print(f"  ERROR: '{table_name}' — {exc}")
            failed.append(table_name)
            try:
                pg_conn.rollback()
            except Exception:
                pass

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

print()
print("Migration complete:")
for table_name, count in migrated.items():
    print(f"  {table_name:<20} {count} rows migrated")

if failed:
    print()
    print("Tables with errors:")
    for t in failed:
        print(f"  - {t}")
    sys.exit(1)
