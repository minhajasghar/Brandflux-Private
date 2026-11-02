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
