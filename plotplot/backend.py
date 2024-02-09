import time
from flask import Flask
from flask import jsonify
from flask import request
from flask import g
from flask import send_from_directory
import pandas as pd
import json
import plotly
import plotly.express as px
import plotly.graph_objects as go
import sys
import numpy as np
import colorcet
import html
import os
import datetime
from flask_login import (
    LoginManager,
    current_user,
    login_required,
)
from plotplot.api_utils import get_str, get_strp, get_float, get_floatp, get_int, get_intp, invalid_session_id_err_str, exception_decorator


from plotplot.db import insert_db

from plotplot.login import app_login
from plotplot.load_and_resume import app_load_and_resume
from plotplot.user import User
from plotplot.globals import g_process_lock, g_processes
from plotplot.session_worker import call_worker
from plotplot.plotplot_config import get_plotplot_config

plotplot_config = get_plotplot_config()

url_prefix = '/plotplot'

try:
    url_prefix = get_plotplot_config()['plotplot general']['url_prefix']
except KeyError:
    pass

static_folder = '../frontend/build'
app = Flask(__name__, static_folder=static_folder, static_url_path='/')

if url_prefix:
    app.config['APPLICATION_ROOT'] = url_prefix

# User session management setup
# https://flask-login.readthedocs.io/en/latest
login_manager = LoginManager()
login_manager.init_app(app)


# Flask-Login helper to retrieve a user from our db
@login_manager.user_loader
def load_user(user_id):
    return User.get(user_id)


app.register_blueprint(app_login)
app.register_blueprint(app_load_and_resume)

app.secret_key = os.urandom(24)

# These routes just load the main index.html file which will immediately
# detect that there is an argument in the URL and handle it.
@app.route('/')
def index_file():
    return send_from_directory(static_folder, 'index.html')
@app.route('/session/<data_id>')
def resume_session_from_url(data_id=None):
    return send_from_directory(static_folder, 'index.html')
@app.route('/load_file')
def load_file_form_url():
    return send_from_directory(static_folder, 'index.html')

#

@app.route('/api/<data_id>/columns')
@login_required
@exception_decorator
def get_columns(data_id=None):
    if data_id is None:
        return json.dumps({'error': invalid_session_id_err_str})

    return call_worker(data_id, 'get_columns', {})


@app.route('/api/<data_id>/non_numeric_columns')
@login_required
@exception_decorator
def get_non_numeric_columns(data_id=None):
    if data_id is None:
        return json.dumps({'error': invalid_session_id_err_str})

    return call_worker(data_id, 'get_non_numeric_columns', {})


@app.route('/api/<data_id>/subsets')
@login_required
@exception_decorator
def get_subsets(data_id=None):
    if data_id is None:
        return json.dumps({'error': invalid_session_id_err_str})

    return call_worker(data_id, 'get_subsets', {})


@app.route('/api/<data_id>/plot_json', methods=['POST'])
@login_required
@exception_decorator
def plot_json(data_id=None):
    if data_id is None:
        return json.dumps({'error': invalid_session_id_err_str})

    return call_worker(data_id, 'plot_json', {
        'current_user_email': current_user.email,
        'data': request.get_json()
    })


@app.route('/api/<data_id>/calc_r', methods=['POST'])
@login_required
@exception_decorator
def calc_r(data_id=None):
    if data_id is None:
        return json.dumps({'error': invalid_session_id_err_str})

    return call_worker(data_id, 'calc_correlation', {
        'current_user_email': current_user.email,
        'data': request.get_json()
    })


@app.route('/api/<data_id>/select_data', methods=['POST'])
@login_required
@exception_decorator
def select_data(data_id=None):
    if data_id is None:
        return json.dumps({'error': invalid_session_id_err_str})

    return (call_worker(data_id, 'select_data', {'data': request.get_json()}))


@app.route('/api/<data_id>/delete_subset')
@login_required
@exception_decorator
def delete_subset(data_id=None):
    if data_id is None:
        return json.dumps({'error': invalid_session_id_err_str})

    return call_worker(data_id, 'delete_subset',
                       {'subset_id': get_int(request.args.get('subset_id'))})


@app.route('/api/<data_id>/math', methods=['POST'])
@login_required
@exception_decorator
def do_math(data_id=None):
    if data_id is None:
        return json.dumps({'error': invalid_session_id_err_str})

    return call_worker(data_id, 'do_math', {'data': request.get_json()})


@app.route('/api/<data_id>/download_subset', methods=['POST'])
@login_required
@exception_decorator
def download_subset(data_id=None):
    if data_id is None:
        return json.dumps({'error': invalid_session_id_err_str})

    return call_worker(data_id, 'download_subset',
                       {'data': request.get_json()})


@app.route('/api/<data_id>/filter', methods=['POST'])
@login_required
@exception_decorator
def filter(data_id=None):
    if data_id is None:
        return json.dumps({'error': invalid_session_id_err_str})

    return call_worker(data_id, 'filter', {'data': request.get_json()})

@app.route('/api/<data_id>/bulk_import', methods=['POST'])
@login_required
@exception_decorator
def bulk_import(data_id=None):
    if data_id is None:
        return json.dumps({'error': invalid_session_id_err_str})

    return call_worker(data_id, 'bulk_import', {'data': request.get_json()})

@app.route('/api/<data_id>/levenshtein_filter', methods=['POST'])
@login_required
@exception_decorator
def levenshtein_filter(data_id=None):
    if data_id is None:
        return json.dumps({'error': invalid_session_id_err_str})

    return call_worker(data_id, 'levenshtein_filter', {'data': request.get_json()})

@app.route('/api/<data_id>/get_unique_strings', methods=['POST'])
@login_required
@exception_decorator
def get_unqiue_strings(data_id=None):
    if data_id is None:
        return json.dumps({'error': invalid_session_id_err_str})

    return call_worker(data_id, 'get_unique_strings',
                       {'data': request.get_json()})


@app.route('/api/<data_id>/download_file')
@login_required
@exception_decorator
def download_file(data_id=None):
    if data_id is None:
        return json.dumps({'error': invalid_session_id_err_str})

    return call_worker(data_id, 'download_file',
                       {'file_id': get_str(request.args.get('file_id'))})


@app.route('/api/<data_id>/save_state', methods=['POST'])
@login_required
@exception_decorator
def save_state(data_id=None):
    # Ensure data_id exists
    with g_process_lock:
        if data_id not in g_processes:
            return json.dumps({'error': invalid_session_id_err_str})
        else:
            path = g_processes[data_id]['path']

    data = request.get_json()
    print('save state path: ', path)

    json_state = get_strp(data, 'json_state')
    if json_state is None:
        return json.dumps([])

    #print([get_data_full(data_id)['path'], current_user.email, data_id, json_state])

    # Write the state to the database.
    json_str = str(json_state)
    now = datetime.datetime.utcnow()
    timestr = now.strftime('%Y-%m-%d %H:%M:%S')
    insert_db(
        'INSERT INTO sessions (id, updated, filename, email, json_state) VALUES (?, ?, ?, ?, ?) '
        + 'ON CONFLICT(id) DO UPDATE SET json_state=?, updated=?',
        [data_id, timestr, path, current_user.email, json_str, json_str, timestr])

    return json.dumps([])
