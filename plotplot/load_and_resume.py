from flask import request, Blueprint
from flask.cli import with_appcontext
import numpy as np
import pandas as pd
from werkzeug.utils import secure_filename
from .globals import g_process_lock, g_processes
from flask_login import login_required
from . import api_utils
from .api_utils import get_str, get_strp, get_float, get_floatp, get_int, get_intp, exception_decorator
import json
import requests
import uuid
import os
import time
import glob
from .db import init_db_command, insert_db, query_db
import sys
import multiprocessing as mp
from .session_worker import SessionRequest, SessionWorker, call_worker
from .gdrive_cloud import PlotplotGdrive
from zoneinfo import ZoneInfo
from flask_login import (
    current_user,
    login_required,
)
from . import plotplot_config

app_load_and_resume = Blueprint('load_and_resume', __name__)


@app_load_and_resume.route('/api/processing_progress')
@login_required
@exception_decorator
def processing_progress():
    id = get_str(request.args.get('data_id'))
    if id is None:
        return json.dumps({'error': 'ID is null.'})

    return call_worker(id, 'processing_progress', {})


@app_load_and_resume.route('/api/cloud_progress')
@login_required
@exception_decorator
def cloud_progress():
    id = get_str(request.args.get('data_id'))
    if id is None:
        return json.dumps({'error': 'ID is null.'})

    return call_worker(id, 'cloud_progress', {})


# dask_df = dd.from_pandas(df, npartitions=mp.cpu_count())
# dask_df.persist()

########################


def load_data(path, gdrive_file_info=None, data_id=None, subsets_from_db=None, math_vars=None):
    global g_processes
    if data_id is None:
        data_id = str(uuid.uuid4())
    else:
        assert subsets_from_db is not None

    # Start a new process for this session
    input_queue = mp.Queue()
    output_queue = mp.Queue()
    shutdown_queue = mp.Queue()
    worker = SessionWorker(data_id, path, gdrive_file_info, input_queue,
                           output_queue, shutdown_queue, subsets_from_db, math_vars)
    worker.start()
    process_data = {
        'process': worker,
        'input': input_queue,
        'output': output_queue,
        'path': path,
        'shutdown': shutdown_queue,
    }
    with g_process_lock:
        g_processes[data_id] = process_data

    return data_id


@app_load_and_resume.route('/api/upload', methods=['POST'])
@login_required
@exception_decorator
def file_upload():
    target = api_utils.upload_folder
    if not os.path.isdir(target):
        os.mkdir(target)
    file = request.files['file']
    filename = secure_filename(file.filename)
    destination = "/".join([target, filename])
    file.save(destination)

    data_id = load_data(destination)

    response = json.dumps({'data_id': data_id})
    return response


@app_load_and_resume.route('/api/recent_files')
@login_required
@exception_decorator
def recent_files():
    dir = api_utils.upload_folder + '/'
    return files_in_folder(dir)


@app_load_and_resume.route('/api/cloud_files')
@login_required
@exception_decorator
def cloud_files():
    out = []
    if plotplot_config.get_boolean_with_default('google drive', 'google_drive_connection_enabled', False):
        gdrive = PlotplotGdrive()
        files = gdrive.list_files()
        for f in files:
            if f['name'][-4:] == '.csv' and f[
                    'mimeType'] == 'text/csv' and 'size' in f and int(
                        f['size']) > 0:
                out.append(f)
    return json.dumps(out)

def files_in_folder(dir):
    csvfiles = []

    for file in glob.glob(dir + "/*.csv"):
        csvfiles.append(file)

    csvfiles.sort(key=str.lower)

    out = []
    # Get data for the files
    for csv in csvfiles:
        if os.path.isfile(csv):
            size = os.path.getsize(csv)
            out.append([os.path.basename(csv), size])

    return json.dumps(out)


@app_load_and_resume.route('/api/load_recent_file', methods=['POST'])
@login_required
@exception_decorator
def load_recent_file():
    data = request.get_json()
    filename = get_strp(data, 'filename')

    # See if that file exists
    dir = api_utils.upload_folder + '/'

    f = os.path.join(dir, filename)

    if not os.path.exists(f):
        return json.dumps({'error': 'File "' + filename + '" not found.'})

    data_id = load_data(f)

    return json.dumps({'data_id': data_id})

@app_load_and_resume.route('/api/load_external_file', methods=['POST'])
@login_required
@exception_decorator
def load_external_file():
    # Check to see if loading external files is enabled.
    if not plotplot_config.get_plotplot_config().has_option('plotplot general', 'external_load_dir'):
        return json.dumps({'error': 'Loading external files is disabled.  Enable it in plotplot.ini by setting "EXTERNAL_LOAD_DIR".'})

    data = request.get_json()
    filename = get_strp(data, 'filename')

    # See if that file exists
    dir = plotplot_config.get_plotplot_config()['plotplot general']['external_load_dir'] + '/'

    f = os.path.join(dir, filename)

    if not os.path.exists(f):
        return json.dumps({'error': 'File "' + filename + '" not found.'})

    data_id = load_data(f)

    return json.dumps({'data_id': data_id})


@app_load_and_resume.route('/api/load_cloud_file', methods=['POST'])
@login_required
@exception_decorator
def load_cloud_file():
    if not plotplot_config.get_boolean_with_default('google drive', 'google_drive_connection_enabled', False):
        return json.dumps({'error': 'Google drive connection not enabled. Enable it in plotplot.ini if desired.'})

    gdrive = PlotplotGdrive()
    data = request.get_json()
    gdrive_id = get_strp(data, 'filename')
    file_info = gdrive.get_file_info(gdrive_id)
    output_path = api_utils.get_gdrive_path(file_info['name'])

    # See if that file exists
    data_id = load_data(output_path, gdrive_file_info=file_info)

    return json.dumps({'data_id': data_id})


@app_load_and_resume.route('/api/resume_session', methods=['POST'])
@login_required
@exception_decorator
def resume_session():
    data = request.get_json()
    id = get_strp(data, 'id')
    if id is None:
        return json.dumps({'error': 'Invalid dataId.'})

    sql = 'SELECT * FROM sessions WHERE id = ?'
    res = query_db(sql, [id])

    if len(res) != 1:
        return json.dumps({'error': 'Session ID unknown.'})

    # If we want to implement that users cannot see other users' graphs,
    # this is where we'd do it.
    ##
    ##

    # If the session isn't owned by the current user, make a copy.
    if res[0]['email'] != current_user.email:
        # Force creation of a new ID
        id = copy_session(id, current_user.email)

    # Check to see if this session is live
    session_live = False
    with g_process_lock:
        if id in g_processes:
            session_live = True

    gdrive_file_info = None

    if not session_live:
        # We need to reload the file.

        # Get the subset information so we can send it to the new process that will spawn for this new
        # session.
        subsets_from_db = load_subsets_from_db(id)
        math_vars_from_db = load_math_vars_from_db(id)

        if res[0]['filename'].startswith(api_utils.gdrive_folder):
            if not plotplot_config.get_boolean_with_default('google drive', 'google_drive_connection_enabled', False):
                return json.dumps({'error': 'Attempting to resume a session from a Google Drive file, but the Google Drive connection not enabled. Enable it in plotplot.ini if desired.'})
            # This is a gdrive file that is not in the cache.
            # We do filename matching, not ID matching here.
            filename_no_path = res[0]['filename'][len(api_utils.gdrive_folder +
                                                      '/'):]
            gdrive = PlotplotGdrive()
            files = gdrive.list_files()
            out = {}
            for f in files:
                if f['name'][-4:] == '.csv' and f['mimeType'] == 'text/csv':
                    out[f['name']] = f
            if filename_no_path in out:
                gdrive_file_info = out[filename_no_path]

        load_data(res[0]['filename'],
                  gdrive_file_info=gdrive_file_info,
                  data_id=id,
                  subsets_from_db=subsets_from_db,
                  math_vars=math_vars_from_db)

    return json.dumps({
        'json_state':
        res[0]['json_state'],
        'filename':
        os.path.basename(res[0]['filename']),
        'file_needs_load':
        not session_live,
        'file_needs_cloud_download': (gdrive_file_info is not None),
        'maybe_new_session_id':
        id
    })


def copy_session(id, new_email):
    sql = 'SELECT * FROM sessions WHERE id = ?'
    res_session = query_db(sql, [id])

    if len(res_session) != 1:
        raise Exception('Copy session failed: Session ID unknown.')

    new_id = str(uuid.uuid4())

    # Get subsets
    sql = 'SELECT * FROM subsets WHERE session = ?'
    vals = [id]
    res_subsets = query_db(sql, vals)

    sql = 'INSERT INTO sessions ('
    for key in res_session[0].keys():
        sql += key + ','
    sql = sql[0:-1] + ') VALUES ('

    vals = []
    for key in res_session[0].keys():
        sql += '?,'

        if key == 'id':
            vals.append(new_id)
        elif key == 'email':
            vals.append(new_email)
        else:
            vals.append(res_session[0][key])
    sql = sql[0:-1] + ')'

    insert_db(sql, vals)

    for subset in res_subsets:
        insert_subsets_sql = 'INSERT INTO subsets ('
        insert_subsets_vals = []

        for subset_key in subset.keys():
            insert_subsets_sql += subset_key + ','
        insert_subsets_sql = insert_subsets_sql[0:-1] + ') VALUES ('

        for subset_key in subset.keys():
            insert_subsets_sql += '?,'
            if subset_key == 'session':
                insert_subsets_vals.append(new_id)
            else:
                insert_subsets_vals.append(subset[subset_key])
        insert_subsets_sql = insert_subsets_sql[0:-1] + ')'

        insert_db(insert_subsets_sql, insert_subsets_vals)

    return new_id


def load_subsets_from_db(data_id):
    sql = 'SELECT * FROM subsets WHERE session = ?'
    vals = [data_id]
    res = query_db(sql, vals, in_thread=True)
    subsets = {}
    for subset in res:
        idx = pd.Series(subset['pd_idx'], dtype=bool)
        subsets[subset['id_in_session']] = {
            'idx': idx,
            'count': int(np.sum(idx)),
        }

    return subsets

def load_math_vars_from_db(data_id):
    sql = 'SELECT math_vars FROM sessions WHERE id = ?'
    vals = [data_id]
    res = query_db(sql, vals, in_thread=True)

    math_vars_json = res[0]['math_vars']
    if math_vars_json is None:
        print('math vars is none')
        return []

    return json.loads(math_vars_json)

@app_load_and_resume.route('/api/sessions')
@login_required
@exception_decorator
def get_sessions():
    sql = 'select * from sessions WHERE email = ?'
    res = query_db(sql, [current_user.email])

    utc = ZoneInfo('UTC')

    gdrive_list = []
    
    # Get files on google drive.
    if plotplot_config.get_boolean_with_default('google drive', 'google_drive_connection_enabled', False):
        gdrive = PlotplotGdrive()
        gdrive_files = gdrive.list_files()
        for f in gdrive_files:
            gdrive_list.append(f['name'])

    user_sessions = []
    for session in res:
        updated = session['updated'].replace(tzinfo=utc).astimezone()

        # Make sure the file still exists on the server.
        if not os.path.exists(session['filename']):
            # Might be a gdrive file
            if session['filename'].startswith(api_utils.gdrive_folder):
                # This is a gdrive file, see if it is in the list.
                filename_no_path = session['filename'][len(api_utils.
                                                           gdrive_folder +
                                                           '/'):]
                if filename_no_path not in gdrive_list:
                    continue
            else:
                continue

        user_sessions.append({
            'id': session['id'],
            'filename': os.path.basename(session['filename']),
            'updated': time.mktime(updated.timetuple())
        })

    # Sort by most recent
    user_sessions.sort(key=lambda x: -x['updated'])

    return json.dumps(user_sessions)
