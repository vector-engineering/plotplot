# http://flask.pocoo.org/docs/1.0/tutorial/database/
import sqlite3

import click
from flask import current_app, g
from flask.cli import with_appcontext
import os
import numpy as np
import io
import platformdirs

from plotplot.plotplot_config import get_plotplot_config

SCHEMA = """
CREATE TABLE sessions (
    id UUID PRIMARY KEY NOT NULL,
    created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    json_state TEXT NOT NULL,
    filename TEXT NOT NULL,
    email TEXT NOT NULL,
    math_vars TEXT
);

CREATE TABLE subsets (
  id INT PRIMARY KEY,
  session UUID NOT NULL,
  id_in_session INT NOT NULL,
  name TEXT NOT NULL,
  pd_idx ARRAY
);

CREATE TABLE user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  profile_pic TEXT NOT NULL
);
"""

try:
    DATABASE = get_plotplot_config()['plotplot general']['DATABASE_FILE']
except KeyError:
    DATABASE = ''

if len(DATABASE) == 0:
    # No database entry, use the default location.
    DATABASE = os.path.join(
        platformdirs.user_data_dir('plotplot', 'plotplot'), 'plotplot.db')

if not os.path.exists(DATABASE):
    # Database does not exist, create one.
    print(f'Plotplot database does not exist, creating one at: {DATABASE}')
    os.makedirs(os.path.dirname(DATABASE), exist_ok=True)
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    cursor.executescript(SCHEMA)
    conn.commit()
    conn.close()

# sqlite + numpy: https://stackoverflow.com/a/18622264/730138
def adapt_array(arr):
    out = io.BytesIO()
    np.savez_compressed(out, a=arr)
    out.seek(0)
    return sqlite3.Binary(out.read())


def convert_array(text):
    out = io.BytesIO(text)
    out.seek(0)
    return np.load(out)['a']


# Converts np.array to TEXT when inserting
sqlite3.register_adapter(np.ndarray, adapt_array)

# Converts TEXT to np.array when selecting
sqlite3.register_converter("array", convert_array)


def get_db(in_thread=False):
    if in_thread:
        db = sqlite3.connect(DATABASE, detect_types=sqlite3.PARSE_DECLTYPES)
        db.row_factory = sqlite3.Row
        return db

    if "db" not in g:
        g.db = sqlite3.connect(DATABASE, detect_types=sqlite3.PARSE_DECLTYPES)
        g.db.row_factory = sqlite3.Row

    return g.db


def close_db(e=None):
    db = g.pop("db", None)

    if db is not None:
        db.close()


def init_db():
    db = get_db()

    with current_app.open_resource("schema.sql") as f:
        db.executescript(f.read().decode("utf8"))


@click.command("init-db")
@with_appcontext
def init_db_command():
    """Clear the existing data and create new tables."""
    init_db()
    click.echo("Initialized the database.")


def init_app(app):
    app.teardown_appcontext(close_db)
    app.cli.add_command(init_db_command)


def insert_db(query, args=()):
    db = get_db()
    cur = db.execute(query, args)
    db.commit()


def query_db(query, args=(), one=False, in_thread=False):
    db = get_db(in_thread)
    #cur = get_db().execute(query, args)
    cur = db.cursor().execute(query, args)
    rv = cur.fetchall()
    cur.close()
    return (rv[0] if rv else None) if one else rv
