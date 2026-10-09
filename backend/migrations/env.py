from logging.config import fileConfig

from alembic import context
from sqlalchemy import DateTime, engine_from_config, pool

import app.modules.profile.models  # noqa: F401  (register tables on Base.metadata)
from app.core.config import get_settings
from app.core.db import Base, UTCDateTime

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# A URL set programmatically (e.g. by tests) wins over application settings.
if not config.get_main_option("sqlalchemy.url"):
    config.set_main_option("sqlalchemy.url", get_settings().database_url)

target_metadata = Base.metadata


def render_item(type_, obj, autogen_context):  # type: ignore[no-untyped-def]
    """Render app-specific column types as plain SQLAlchemy types in migration files."""
    if type_ == "type" and isinstance(obj, UTCDateTime):
        return repr(DateTime(timezone=True)).replace("DateTime", "sa.DateTime")
    return False


def _configure_kwargs() -> dict:
    return {
        "target_metadata": target_metadata,
        "render_item": render_item,
        # SQLite cannot ALTER most column properties; batch mode recreates tables instead.
        "render_as_batch": True,
        "compare_type": True,
    }


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        **_configure_kwargs(),
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, **_configure_kwargs())
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
