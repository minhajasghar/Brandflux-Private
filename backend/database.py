import os
import logging
from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from config import DATABASE_URL, DEFAULT_SQLITE_PATH

logger = logging.getLogger(__name__)

SQLALCHEMY_DATABASE_URL = DATABASE_URL

engine_args = {}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine_args["connect_args"] = {"check_same_thread": False, "timeout": 30}
else:
    # PostgreSQL connection pool configuration
    engine_args["pool_pre_ping"] = True
    engine_args["pool_size"] = 10
    engine_args["max_overflow"] = 20

try:
    engine = create_engine(SQLALCHEMY_DATABASE_URL, **engine_args)
except Exception as e:
    logger.warning(f"Could not initialize primary database engine ({SQLALCHEMY_DATABASE_URL}): {e}. Falling back to SQLite.")
    SQLALCHEMY_DATABASE_URL = f"sqlite:///{DEFAULT_SQLITE_PATH}"
    engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False, "timeout": 30})

if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        try:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.close()
        except Exception:
            pass

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def upgrade_database_schema(db_engine):
    """Ensure newly introduced columns and tables exist in the active database engine."""
    from sqlalchemy import inspect, text
    try:
        # Create any newly defined tables (e.g. payment_requests)
        Base.metadata.create_all(bind=db_engine)
        inspector = inspect(db_engine)
        tables = inspector.get_table_names()
        if "users" in tables:
            columns = [c["name"] for c in inspector.get_columns("users")]
            with db_engine.begin() as conn:
                if "is_approved" not in columns:
                    logger.info("Migrating schema: adding users.is_approved")
                    conn.execute(text("ALTER TABLE users ADD COLUMN is_approved BOOLEAN DEFAULT 0"))
                if "approved_at" not in columns:
                    logger.info("Migrating schema: adding users.approved_at")
                    conn.execute(text("ALTER TABLE users ADD COLUMN approved_at DATETIME"))
                if "approved_by_id" not in columns:
                    logger.info("Migrating schema: adding users.approved_by_id")
                    conn.execute(text("ALTER TABLE users ADD COLUMN approved_by_id VARCHAR(36)"))
                if "is_non_payment" not in columns:
                    logger.info("Migrating schema: adding users.is_non_payment")
                    conn.execute(text("ALTER TABLE users ADD COLUMN is_non_payment BOOLEAN DEFAULT 0"))
                # Ensure all admins are approved
                conn.execute(text("UPDATE users SET is_approved = 1, is_verified = 1, is_non_payment = 1 WHERE role IN ('admin', 'support_admin')"))
    except Exception as e:
        logger.warning(f"Schema upgrade check notice: {e}")
