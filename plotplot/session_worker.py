import multiprocessing as mp
import json
import uuid
import pandas as pd
import os
import numpy as np
import plotly
import plotly.express as px
import plotly.graph_objects as go
import time
import datashader
import html
from .db import insert_db
import traceback
import re
from polyleven import levenshtein
from werkzeug.utils import secure_filename
from . import plotplot_config


from plotplot.globals import g_process_lock, g_processes
from . import api_utils
from plotplot.load_csv_thread import LoadCsvThread
from plotplot.gdrive_download_thread import GdriveDownloadThread
from . import point_in_polygon
from plotplot.gdrive_cloud import PlotplotGdrive
import pathlib
from queue import Empty

from line_profiler import LineProfiler
from io import StringIO

ENABLE_LINE_PROFILER = False


def call_worker(id, function_name, args):
    """ Finds the multiprocessing process and gets the result.
    """
    with g_process_lock:
        if id not in g_processes:
            return json.dumps({'error': api_utils.invalid_session_id_err_str})
        pdata = g_processes[id]

        # Check to see this processes has shutdown
        if not pdata['shutdown'].empty():
            # This process has shutdown, tell the requester that it needs to restart it.
            del g_processes[id]
            result = json.dumps({'error': 'Session has timed out, you need to reload the page.', 'session_timeout': True})
            return result

    pdata['input'].put(SessionRequest(function_name, args))

    result = pdata['output'].get()

    if isinstance(result, dict):
        # Unpack and process DB transactions.
        if 'db_insert' in result:
            print('need to do DB transaction...')
            insert_db(result['db_insert']['sql'], result['db_insert']['vals'])
            print('done with DB transaction, returning')
        elif 'db_insert_multi' in result:
            print('need to do multi-DB transaction...')
            for dbi in result['db_insert_multi']:
                insert_db(dbi['sql'], dbi['vals'])
            print('done with multi-DB transaction, returning')
        return result['json']
    else:
        # Already a string.
        return result


class SessionRequest():
    """ Inputs come in this form. """

    def __init__(self, function_name, args):
        self.function_name = function_name
        self.args = args


class SessionWorker(mp.Process):
    """ Each UUID session has a worker process which holds the DataFrame for that process in its memeory.
        Actions that need access to the DataFrame talk to the process.

        This allows us to handle multiple clients and multiple CPU-bound tasks at once.  The limitations
        are that you can't do multiple CPU-bound tasks on the same DataFrame at the same time (like making
        multiple plots at once."""

    def __init__(self, id, datapath, gdrive_file_info, input_queue,
                 output_queue, shutdown_queue, subsets_from_db, math_vars):
        super(mp.Process, self).__init__()
        self.id = id
        self.path = datapath
        self.gdrive_file_info = gdrive_file_info
        self.input_queue = input_queue
        self.output_queue = output_queue
        self.shutdown_queue = shutdown_queue
        self.subsets_from_db = subsets_from_db
        self.loading_progress_queue = mp.Queue()
        self.gdrive_progress_queue = mp.Queue()
        self.data_lock = mp.Lock()
        self.data = dict()
        self.last_progress = {
            'progress': 0,
            'rows_loaded': 0,
            'total_rows': 0,
            'math_vars_loaded': None,
            'math_vars_total': None,
            'text': 'Opening file...',
        }
        self.last_gdrive_progress = {
            'progress': 0.0,
            'downloaded_bytes': 0.0,
            'total_bytes': 0.0,
            'in_cache': False
        }
        self.pending_requests = []
        self.pending_download_files = {}
        self.gdrive = None
        self.math_vars = math_vars

        self.funcs = {
            'processing_progress': self.processing_progress,
            'get_subsets': self.get_subsets,
            'get_columns': self.get_columns,
            'get_non_numeric_columns': self.get_non_numeric_columns,
            'plot_json': self.plot_json,
            'select_data': self.select_data,
            'delete_subset': self.delete_subset,
            'do_math': self.do_math,
            'download_subset': self.download_subset,
            'download_file': self.download_file,
            'filter': self.filter,
            'get_unique_strings': self.get_unique_strings,
            'cloud_progress': self.gdrive_progress,
            'calc_correlation': self.calc_correlation,
            'bulk_import': self.bulk_import,
            'levenshtein_filter': self.levenshtein_filter,
        }

    def run(self):
        if self.gdrive_file_info is not None and plotplot_config.get_boolean_with_default('google drive', 'google_drive_connection_enabled', False):
            self.gdrive = PlotplotGdrive()
            self.start_gdrive_download()
        else:
            # Start the data loading thread.
            self.start_loading_data()

        while True:
            if len(self.pending_requests) < 1:
                # Blocking call, waiting for inputs.
                try:
                    req = self.input_queue.get(timeout=26 * 3600)
                except Empty:
                    print(f'Session {self.id} queue timeout, shutting down.')
                    break

                self.pending_requests.append(req)



            # Get any additional requests.
            while not self.input_queue.empty():
                self.pending_requests.append(self.input_queue.get())

            request = self.pending_requests.pop(0)

            if request.function_name not in self.funcs:
                self.output_queue.put(
                    json.dumps({
                        'error':
                        'Requested function: ' + request.function_name +
                        ' not in list of functions.'
                    }))
            else:
                if ENABLE_LINE_PROFILER:
                    lp = LineProfiler()
                    lp_wrapper = lp(self.funcs[request.function_name])
                try:
                    if ENABLE_LINE_PROFILER:
                        result = lp_wrapper(request.args)
                    else:
                        result = self.funcs[request.function_name](request.args)
                except BaseException as e:
                    tb = traceback.format_exc()
                    print(e)
                    print(str(tb))
                    result = json.dumps(dict(error=str(e) + '\n\n' + str(tb)))
                
                if ENABLE_LINE_PROFILER:
                    lp.print_stats(output_unit=0.001)

                self.output_queue.put(result)

        self.shutdown_queue.put(True)
        print(f'Session {self.id} end of thread.')

    def processing_progress(self, args):
        with self.data_lock:
            if 'df' in self.data:
                return json.dumps({
                    'progress': 1,
                    'rows_loaded': None,
                    'total_rows': None,
                    'data_id': self.id,
                    'done': True,
                })

        # The processing isn't done yet, get the progress.
        if self.loading_progress_queue.empty():
            progress_data = self.last_progress
        else:
            while not self.loading_progress_queue.empty():
                progress_data = self.loading_progress_queue.get()
        self.last_progress = progress_data

        progress_data['data_id'] = self.id
        progress_data['done'] = False
        
        return json.dumps(progress_data)

    def gdrive_progress(self, args):
        if self.gdrive_progress_queue.empty():
            gdrive_progress = self.last_gdrive_progress
        else:
            while not self.gdrive_progress_queue.empty():
                gdrive_progress = self.gdrive_progress_queue.get()
        self.last_gdrive_progress = gdrive_progress

        return json.dumps(gdrive_progress)

    def start_gdrive_download(self):
        # Get the file from google drive.
        output_path = api_utils.get_gdrive_path(self.gdrive_file_info['name'])

        # See if the file already exists.
        if os.path.exists(output_path) and pathlib.Path(
                output_path).is_file() and os.path.getsize(output_path) == int(
                    self.gdrive_file_info['size']):
            # File exists and is the same size.  We'll use it.
            self.gdrive_progress_queue.put({
                'progress':
                1,
                'downloaded_bytes':
                self.gdrive_file_info['size'],
                'total_bytes':
                self.gdrive_file_info['size'],
                'in_cache':
                True,
            })
            print('Using cached gdrive file')
            self.start_loading_data()
        else:
            os.makedirs(api_utils.gdrive_folder, exist_ok=True)
            gdrive_download_thread = GdriveDownloadThread(
                self.gdrive, self.gdrive_progress_queue, self.gdrive_file_info,
                api_utils.gdrive_folder, self.start_loading_data)
            self.path = output_path
            gdrive_download_thread.start()

    def start_loading_data(self):
        load_thread = LoadCsvThread(self.loading_progress_queue, self.path,
                                    self.subsets_from_db, self.data,
                                    self.data_lock, self.math_vars)
        load_thread.start()

    def get_data(self):
        with self.data_lock:
            if 'df' not in self.data:
                return None, None, None, None, None
            return self.data['df'], self.data['subsets'], self.data[
                'subset_counter'], self.data['math_vars'], self.data['col_labels']

    def get_subsets(self, args):
        return json.dumps(self.get_subsets_no_json(args))

    def get_subsets_no_json(self, args):
        df, subsets, subset_counter, math_vars, col_labels = self.get_data()
        if df is None:
            return json.dumps({'error': api_utils.data_not_loaded_str})

        subsets_out = {}
        for key in subsets.keys():
            subsets_out[key] = api_utils.export_subset(subsets, key)

        return subsets_out

    def get_columns(self, args):
        df, subsets, subset_counter, math_vars, col_labels = self.get_data()
        if df is None:
            return json.dumps({'error': api_utils.data_not_loaded_str})

        all_cols = df.columns.tolist()
        numeric_cols = api_utils.get_numeric_cols(df)

        non_numeric = np.setdiff1d(all_cols, numeric_cols).tolist()

        #return json.dumps(api_utils.get_numeric_cols(df))
        return json.dumps({
            'numeric': sorted(numeric_cols, key=str.lower),
            'non_numeric': sorted(non_numeric, key=str.lower),
            'col_labels': col_labels
        })

    def get_non_numeric_columns(self, args):
        df, subsets, subset_counter, math_vars, col_labels = self.get_data()
        if df is None:
            return json.dumps({'error': api_utils.data_not_loaded_str})

        #return jsonify(df.columns.tolist())
        all_cols = df.columns.tolist()
        numeric_cols = api_utils.get_numeric_cols(df)

        non_numeric = np.setdiff1d(all_cols, numeric_cols).tolist()

        return json.dumps(non_numeric)

    def future_plot_in_requests(self, args):
        key = args['data']['key']
        for r in self.pending_requests:
            if r.function_name == 'plot_json' and r.args['data']['key'] == key:
                return True
        return False

    def calc_correlation(self, args):
        df, subsets, subset_counter, math_vars, col_labels = self.get_data()
        correlations = {}
        data = args['data']
        subset_ids = api_utils.get_arrayp(data, 'subset_ids')
        x = api_utils.get_strp(data, 'x')
        y = api_utils.get_strp(data, 'y')

        if x is None or y is None:
            # No correlation.
            out = {}
            methods = ['pearson', 'kendall', 'spearman']
            for m in methods:
                out[m] = (0, 0)
            return json.dumps(out), 200, {
                'Content-Type': 'application/json; charset=utf-8'
            }

        for sub_id in subset_ids:
            if sub_id not in subsets:
                return json.dumps({'error': 'Unknown subset: ' + str(sub_id)})

        all_subsets = np.zeros(len(df), dtype=bool)
        for sub_id in subset_ids:
            all_subsets |= subsets[sub_id]['idx']

        correlations = api_utils.calculate_correlation(df[all_subsets], x, y)
        jsonResult = json.dumps(correlations)
        return jsonResult, 200, {
            'Content-Type': 'application/json; charset=utf-8'
        }

    def plot_json(self, args):

        plot_supports_hovering = False
        longest_col_name_len = 0

        if self.future_plot_in_requests(args):
            print('Plot preempted!')
            return json.dumps(
                {'preempt': 'Plot preempted by another request.'})

        df, subsets, subset_counter, math_vars, col_labels = self.get_data()
        if df is None:
            return json.dumps({'error': api_utils.data_not_loaded_str})

        current_user_email = args['current_user_email']
        data = args['data']

        print('Plot generation for ' + current_user_email + '...')

        # Constants
        max_rows_for_bbox = 100000
        valid_percent_for_nans_cutoff = 0.90  # > 10% NaNs? Show NaN plot.

        x = api_utils.get_strp(data, 'x')
        y = api_utils.get_strp(data, 'y')
        z = api_utils.get_strp(data, 'z')
        if z == '':
            z = None

        xlog = api_utils.get_boolp(data, 'xlog')
        ylog = api_utils.get_boolp(data, 'ylog')

        subset_ids = api_utils.get_arrayp(data, 'subsets')

        xmin = api_utils.get_floatp(data, 'xmin')
        xmax = api_utils.get_floatp(data, 'xmax')

        ymin = api_utils.get_floatp(data, 'ymin')
        ymax = api_utils.get_floatp(data, 'ymax')

        hist_type = api_utils.get_strp(data, 'hist_type')

        nans_request = api_utils.get_strp(data, 'nans_request')

        hoverlist = data['hoverlist']

        xmargin = api_utils.get_floatp(data, 'xmargin')
        if xmargin is None:
            xmargin = 0

        ymargin = api_utils.get_floatp(data, 'ymargin')
        if ymargin is None:
            ymargin = 0

        use_bbox = True
        bbox_valid = True
        if xmin is None or xmax is None or ymin is None or ymax is None:
            # Bounding box is invalid.
            use_bbox = False
            bbox_valid = False

        xmin_margin = None
        xmax_margin = None

        ymin_margin = None
        ymax_margin = None

        if bbox_valid:
            xmin_margin = xmin - xmargin
            ymin_margin = ymin - ymargin

            xmax_margin = xmax + xmargin
            ymax_margin = ymax + ymargin

        if len(df) < max_rows_for_bbox:
            use_bbox = False
        fig = go.Figure()
        fig.update_layout(hovermode=False)

        if subset_ids is None:
            idx = pd.Series(np.ones(len(df), dtype=bool))
            subset_ids = [0]
        else:
            for subset in subset_ids:
                if subset not in subsets:
                    return json.dumps(
                        {'error': str(subset) + ' not in known subsets.'})
        idxs = []
        for sub_id in subset_ids:
            idxs.append(subsets[sub_id]['idx'])

        plot_type = data['plot_type']
        is_heatmap = False

        both_nan = 0
        num_nan = 0
        showing_nan_plots = False

        if plot_type == 'histogram' and x is not None:
            # Make a histogram!
            fig, minmax = api_utils.generate_histogram(df, idxs, fig, x,
                                                       data['nbins'],
                                                       hist_type)
            plot_type = 'histogram'

            if hist_type == 'count':
                y = 'Count'
            elif hist_type == 'proportion':
                y = 'Proportion'
            else:
                assert 'Unknown hist type: "' + hist_type + '"'

        elif plot_type == 'rank' and y is not None:
            df2 = api_utils.get_rank_df(df, y, z, hoverlist)

            fig, minmax, num_nan, is_heatmap, plot_supports_hovering, longest_col_name_len = api_utils.generate_scatter(
                df2, api_utils.rank_col_name, y, z, idxs, fig, use_bbox, xmin_margin, xmax_margin,
                ymin_margin, ymax_margin, xlog, ylog, hoverlist=hoverlist)
            x = 'Rank'

        elif x is None or y is None:
            scatter = go.Scattergl(x=[], y=[], mode='markers')
            fig.add_trace(scatter)
            if x is None:
                x = 'Drop a variable'
            if y is None:
                y = 'Drop a variable'

            minmax = [(-1, 5), (-1, 5)]
        else:
            min_valid_percent = 1
            for this_idx in idxs:
                print(df[this_idx][x])
                min_valid_percent = min(
                    min_valid_percent,
                    np.sum((np.isfinite(df[this_idx][x]))
                           & (np.isfinite(df[this_idx][y]))) /
                    np.sum(this_idx))

            if nans_request == 'hide' or (
                    nans_request == 'auto'
                    and min_valid_percent > valid_percent_for_nans_cutoff):
                fig, minmax, num_nan, is_heatmap, plot_supports_hovering, longest_col_name_len = api_utils.generate_scatter(
                    df,
                    x,
                    y,
                    z,
                    idxs,
                    fig,
                    use_bbox,
                    xmin_margin,
                    xmax_margin,
                    ymin_margin,
                    ymax_margin,
                    xlog,
                    ylog,
                    hoverlist=hoverlist)
            else:
                fig, minmax, both_nan, num_nan, is_heatmap, plot_supports_hovering, longest_col_name_len = api_utils.generate_scatter_and_nans(
                    df,
                    x,
                    y,
                    z,
                    idxs,
                    fig,
                    use_bbox,
                    xmin_margin,
                    xmax_margin,
                    ymin_margin,
                    ymax_margin,
                    xlog,
                    ylog,
                    hoverlist=hoverlist)
                showing_nan_plots = True
                fig.update_layout(bargap=0.0)

        fig.layout['dragmode'] = 'pan'
        fig.update_layout(  #template='plotly_white', don't set the template here, it costs 0.05 seconds
            font=dict(size=16))

        if plot_type != 'histogram' and showing_nan_plots == False:
            fig.update_yaxes(title_text=y,
                             type='linear',
                             scaleanchor='x',
                             scaleratio=1,
                             autorange=False,
                             automargin=False)

            fig.update_xaxes(title_text=x,
                             type='linear',
                             autorange=False,
                             automargin=False)
        elif showing_nan_plots == False:
            fig.update_yaxes(title_text=y,
                             type='linear',
                             autorange=False,
                             automargin=False)
            fig.update_xaxes(title_text=x,
                             type='linear',
                             autorange=False,
                             automargin=False)

        if bbox_valid:
            metadata = {
                'validRanges': {
                    'xmin': xmin_margin,
                    'xmax': xmax_margin,
                    'ymin': ymin_margin,
                    'ymax': ymax_margin
                }
            }
        else:
            metadata = {
                'validRanges': {
                    'xmin': None,
                    'xmax': None,
                    'ymin': None,
                    'ymax': None
                }
            }
        metadata['plot_supports_hovering'] = plot_supports_hovering
        subset_export = {}
        for sub_id in subset_ids:
            subset_export[sub_id] = api_utils.export_subset(subsets, sub_id)
        metadata['subsets'] = subset_export
        metadata['plot_type'] = plot_type
        metadata['is_heatmap'] = is_heatmap
        metadata['both_nan'] = both_nan
        metadata['num_nan'] = num_nan
        metadata['hoverbox_longest_col_name_len'] = longest_col_name_len
        metadata['minmax'] = {
            'xmin': minmax[0][0],
            'xmax': minmax[0][1],
            'ymin': minmax[1][0],
            'ymax': minmax[1][1],
        }

        if len(minmax) > 2:
            metadata['minmax']['cmin'] = minmax[2][0]
            metadata['minmax']['cmax'] = minmax[2][1]

        # fig.add_annotation(dict(font=dict(color='black', size=15),
        #                         x=1,
        #                         y=1,
        #                         showarrow=False,
        #                         text=str(total_nans) + " NaN / Infs",
        #                         textangle=0,
        #                         xanchor='right',
        #                         xref="paper",
        #                         yref="paper"))

        jsonResult = json.dumps([fig, metadata],
                                cls=plotly.utils.PlotlyJSONEncoder)

        # total_len = 0
        # for idx in idxs:
        #     total_len += len(df[idx])
        # print('Plot generation took',
        #       time.time() - start, 'seconds for ', total_len, 'rows (',
        #       api_utils.heatmap_x, 'x', api_utils.heatmap_y, ')')

        return jsonResult, 200, {
            'Content-Type': 'application/json; charset=utf-8'
        }

    def select_data(self, args):
        df, subsets, subset_counter, math_vars, col_labels = self.get_data()
        if df is None:
            return json.dumps({'error': api_utils.data_not_loaded_str})

        data = args['data']
        colx = api_utils.get_strp(data, 'colx')
        coly = api_utils.get_strp(data, 'coly')
        colz = api_utils.get_strp(data, 'colz')
        plot_type = api_utils.get_strp(data, 'plot_type')
        subset_ids = api_utils.get_arrayp(data, 'subset_ids')
        include_both_nans = api_utils.get_boolp(data, 'bothNanSelected')
        color_slider_values = api_utils.get_arrayp(data, 'colorSliderValuesFinal')

        nan_selection = None
        if 'nanSelection' in data:
            nan_selection = data['nanSelection']

        if plot_type == 'rank':
            if coly is None or subset_ids is None:
                return json.dumps({'error': 'Input data null.'})
        elif colx is None or coly is None or subset_ids is None:
            return json.dumps({'error': 'Input data null.'})
        polygons = data['polygons']

        for sub_id in subset_ids:
            if sub_id not in subsets:
                return json.dumps({'error': 'Unknown subset: ' + str(sub_id)})

        if plot_type == 'rank':
            df2 = api_utils.get_rank_df(df, coly, None, [])
            colx = api_utils.rank_col_name
        else:
            df2 = df

        in_any_poly = pd.Series(np.zeros(len(df2), dtype=bool))

        if len(polygons) < 1:
            # no polygons, so only do a third var check
            assert colz is not None and color_slider_values is not None and len(color_slider_values) == 2, 'No polygons and no 3rd variable data.'
            in_any_poly = pd.Series(np.ones(len(df2), dtype=bool))
        else:
            for poly in polygons:
                # Create a closed polygon.
                polygon = []

                for i in range(0, len(poly)):
                    polygon.append((poly[i][0], poly[i][1]))

                # Close the polygon.
                polygon.append(polygon[0])

                # Compute which points are inside the polygon.
                in_poly = point_in_polygon.pd_inside_polygon(
                    df2, colx, coly, polygon)

                in_any_poly = (in_any_poly | in_poly)

            if nan_selection is not None:
                # Add indicies that are selected from the NaN graphs
                top_xmin = nan_selection[0]
                top_xmax = nan_selection[1]
                right_ymin = nan_selection[2]
                right_ymax = nan_selection[3]

                idx = np.isfinite(df2[colx]) & ~np.isfinite(df2[coly]) & (
                    df2[colx] > top_xmin) & (df2[colx] < top_xmax)
                in_any_poly = (in_any_poly | idx)

                idx = np.isfinite(df2[coly]) & ~np.isfinite(df2[colx]) & (
                    df2[coly] > right_ymin) & (df2[coly] < right_ymax)
                in_any_poly = (in_any_poly | idx)

            if include_both_nans:
                idx = ~np.isfinite(df2[colx]) & ~np.isfinite(df2[coly])
                in_any_poly = (in_any_poly | idx)

        if colz is not None and len(colz) > 0 and color_slider_values is not None and len(color_slider_values) == 2 and color_slider_values[0] is not None and color_slider_values[1] is not None:
            minval = min(color_slider_values[0], color_slider_values[1])
            maxval = max(color_slider_values[0], color_slider_values[1])
            print(f'min {np.min(df2[colz])} max {np.max(df2[colz])}')
            print(f'before {np.sum(in_any_poly)}')
            in_any_poly = in_any_poly & (df2[colz] >= minval) & (df2[colz] <= maxval)
            print(f'after {np.sum(in_any_poly)}')

        # Create a new column index with only these data.
        all_subsets = np.zeros(len(df2), dtype=bool)
        for sub_id in subset_ids:
            all_subsets |= subsets[sub_id]['idx']
        in_subset = (in_any_poly & all_subsets)
        new_subset_id, db_insert, count = self.add_subset(in_subset, subset_counter)

        subsets_out = {}
        for key in subsets.keys():
            subsets_out[key] = api_utils.export_subset(subsets, key)

        json_out = json.dumps([new_subset_id, subsets_out])
        return ({'db_insert': db_insert, 'json': json_out})

    def add_subset(self, idx, new_subset_num):
        count = int(np.sum(idx))
        with self.data_lock:
            self.data['subsets'][new_subset_num] = {
                'idx': idx,
                'count': count,
            }
            self.data['subset_counter'] += 1

        # Add subset to the database.
        sql = 'INSERT INTO subsets (session, id_in_session, name, pd_idx) VALUES (?, ?, ?, ?)'
        vals = [self.id, new_subset_num, '-', idx.to_numpy()] # subset names are only tracked on the frontend now.

        db_insert = {'sql': sql, 'vals': vals}

        return new_subset_num, db_insert, count

    def delete_subset(self, args):
        df, subsets, subset_counter, math_vars, col_labels = self.get_data()
        if df is None:
            return json.dumps({'error': api_utils.data_not_loaded_str})

        subset_id = args['subset_id']

        if subset_id == 0:
            # Don't allow deletion of the (all) subset.
            return json.dumps({'error': 'Cannot delete (all) subset.'})

        with self.data_lock:
            del subsets[subset_id]

        # Update the database.
        sql = 'DELETE from subsets WHERE session = ? AND id_in_session = ?'
        vals = [self.id, subset_id]

        return {
            'json': self.get_subsets({}),
            'db_insert': {
                'sql': sql,
                'vals': vals
            }
        }

    def do_math(self, args):
        df, subsets, subset_counter, math_vars, col_labels = self.get_data()
        if df is None:
            return json.dumps({'error': api_utils.data_not_loaded_str})

        data = args['data']
        # subset_id = get_intp(data, 'subset_id')

        # if subset_id is None:
        #     idx = pd.Series(np.ones(len(df), dtype=bool))
        #     subset_id = 0
        # elif subset_id not in g_subsets:
        #     return('Error: ' + str(subset_id) + ' not in known subsets.')
        # else:
        #     idx = g_subsets[subset_id]['idx']

        # Get math data.
        raw_expr = api_utils.get_strp(data, 'expr')

        math_out = api_utils.do_math_helper(df, math_vars, raw_expr)

        if 'error' in math_out:
            return json.dumps({'error': math_out['error']})

        name_expression = math_out['name']
        new_col = math_out['new_col']
        math_vars = math_out['math_vars']

        with self.data_lock:
            df[name_expression] = new_col
            self.data['df'] = df
            self.data['math_vars'] = math_vars

        # Update the math database
        # Each variable is a json
        new_math_var_str = json.dumps(math_vars)
        
        sql = 'UPDATE sessions SET math_vars = ? WHERE id = ?'
        vals = [new_math_var_str, self.id]

        return {
            'json':
            json.dumps({
                'col_labels': col_labels,
                'cols': api_utils.get_numeric_cols(df),
                'new_var': name_expression
            }),
            'db_insert': {
                'sql': sql,
                'vals': vals
            }
        }

    def download_subset(self, args):
        df, subsets, subset_counter, math_vars, col_labels = self.get_data()
        if df is None:
            return json.dumps({'error': api_utils.data_not_loaded_str})

        data = args['data']
        subset_id = data['subset_id']

        subset_names = None
        if 'subsets' in data:
            subset_names = data['subsets']

        jupyter_filename = api_utils.get_strp(data, 'jupyterFilename')

        if subset_id is None:
            return json.dumps({'error': 'subset_id is invalid.'})

        if subset_id not in subsets:
            return json.dumps({'error': 'subset_id not found.'})

        # Build an array of the columns that the user is requesting.
        include = []
        for col, val in data['nonNumericCols'].items():
            if val:
                include.append(col)

        for col, val in data['numericCols'].items():
            if val:
                include.append(col)

        # Order the columns like they are in the file.
        output = []
        for col in df.columns:
            if col in include:
                output.append(col)

        if jupyter_filename is None or not plotplot_config.get_boolean_with_default('jupyter notebook export', 'jupyter_notebook_export_enabled', False):
            csv = df[subsets[subset_id]['idx']][output].to_csv(index=False)
            file_id = str(uuid.uuid4())
            self.pending_download_files[file_id] = csv
            return json.dumps({'file_id': file_id})
        else:
            jupyter_filename = secure_filename(jupyter_filename)
            jupyter_filepath = os.path.join(plotplot_config.get_plotplot_config()['jupyter notebook export']['jupyter_notebook_export_path'], jupyter_filename)
            df_out = df
            if subset_id == 0:
                # add a column for each subset
                new_cols = {}
                for sub_id in subsets:
                    col_name = f"plotplot_{subset_names[str(sub_id)]['name']}"

                    i = 1
                    new_col_name = col_name

                    # Loop until the new column name is not in df.columns
                    while new_col_name in df.columns:
                        new_col_name = f"{col_name}_{i}"
                        i += 1
                    new_cols[new_col_name] = subsets[sub_id]['idx']
                    output += [new_col_name]

                df_out = df.assign(**new_cols)

            # write the file to the path
            df_out[subsets[subset_id]['idx']][output].to_csv(jupyter_filepath, index=False)
            return json.dumps({'file_written': jupyter_filepath})

    def download_file(self, args):
        file_id = args['file_id']
        if file_id not in self.pending_download_files:
            return json.dumps({
                'error':
                'File not found, you may need to call download_subset first.'
            })

        return self.pending_download_files.pop(file_id)

    def filter(self, args):
        df, subsets, subset_counter, math_vars, col_labels = self.get_data()
        if df is None:
            return json.dumps({'error': api_utils.data_not_loaded_str})

        data = args['data']
        subset_id = data['subset_id']
        filter_var = data['filter_var']
        filters = data['filters']
        add_subset = data['add_subset']
        exact_match = data['exact_match']
        add_multiple_subsets = api_utils.get_boolp(data, 'add_multiple_subsets')
        use_contains = api_utils.get_boolp(data, 'use_contains')

        # Can't set exact match and use_contains.
        if exact_match and use_contains:
            return json.dumps({'error': 'Cannot set exact_match = true and use_contains = true.'})

        if subset_id is None:
            return json.dumps({'error': 'subset_id is invalid.'})

        if subset_id not in subsets:
            return json.dumps({'error': 'subset_id not found.'})

        # Ensure that the filter variable exists
        if filter_var is None:
            return json.dumps({'error': 'filter_var is invalid.'})

        if filter_var not in df.columns:
            return json.dumps(
                {'error': 'fitler_var: ' + filter_var + ' not found'})

        if filters is None:
            return json.dumps({'error': 'filters is invalid.'})

        if len(filters) < 1:
            return json.dumps({'error': 'must supply at least one filter.'})

        if len(filters) > 99:
            return json.dumps({'error': 'too many filters'})

        idx = subsets[subset_id]['idx']

        filter_results = []
        filter_idxs = []

        for filt in filters:
            f = filt['filter']
            key = filt['key']
            if f == '':
                filter_results.append({'filter': f, 'rows': None, 'key': key})
                continue
            if exact_match:
                f_idx = df[idx][filter_var].astype(str).str.upper() == f.upper()
            else:
                # Use a simplified regex language.
                # * ---> .* "match anything"
                # ? ---> .  "match single character"
                # [abc] ---> no change
                reg = api_utils.translate_filter_to_regex(f)
                if use_contains:
                    f_idx = df[idx][filter_var].astype(str).str.contains(reg,
                                                            na=False,
                                                            regex=True,
                                                            case=False)
                else:
                    f_idx = df[idx][filter_var].astype(str).str.fullmatch(reg,
                                                              na=False,
                                                              case=False)
            filter_results.append({
                'filter': f,
                'rows': int(np.sum(f_idx)),
                'key': key
            })
            filter_idxs.append(f_idx)

        out = {}
        out_to_json = {}


        all_idx = pd.Series(np.zeros(len(df), dtype=bool))
        for i in range(len(filter_idxs)):
            filter_idxs[i] = all_idx | filter_idxs[i]

        if add_multiple_subsets:
            return self.add_multiple_subsets(args, subsets, subset_counter, filter_var, filter_results, filter_idxs)

        for this_idx in filter_idxs:
            all_idx = all_idx | this_idx

        total_rows = int(np.sum(all_idx))

        if add_subset:
            new_subset_id, db_insert, count = self.add_subset(all_idx,
                                                       subset_counter)
            out['db_insert'] = db_insert
            out_to_json['new_subset_id'] = new_subset_id
            out_to_json['subsets'] = self.get_subsets_no_json({})

            subsets_out = {}
            for key in subsets.keys():
                subsets_out[key] = api_utils.export_subset(subsets, key)

        out_to_json['filter_results'] = filter_results
        out_to_json['total_rows'] = total_rows
        out['json'] = json.dumps(out_to_json)
        return out

    def levenshtein_filter(self, args):
        df, subsets, subset_counter, math_vars = self.get_data()
        if df is None:
            return json.dumps({'error': api_utils.data_not_loaded_str})

        data = args['data']
        subset_id = api_utils.get_intp(data, 'subset_id')
        filter_var = api_utils.get_strp(data, 'filter_var')
        levenshtein_seq = api_utils.get_strp(data, 'levenshtein_seq')
        levenshtein_n = api_utils.get_intp(data, 'levenshtein_n')
        add_subset = api_utils.get_boolp(data, 'add_subset')

        if subset_id is None:
            return json.dumps({'error': 'subset_id is invalid.'})

        if subset_id not in subsets:
            return json.dumps({'error': 'subset_id not found.'})

        # Ensure that the filter variable exists
        if filter_var is None:
            return json.dumps({'error': 'filter_var is invalid.'})

        if filter_var not in df.columns:
            return json.dumps(
                {'error': 'fitler_var: ' + filter_var + ' not found'})

        if levenshtein_seq is None:
            return json.dumps({'error': 'levenshtein_seq is invalid.'})

        if levenshtein_n is None or levenshtein_n < 1:
            return json.dumps({'error': 'levenshtein_n is invalid.'})

        idx = subsets[subset_id]['idx']

        # Compute the levenshtein distance to the sequence for every row.
        def levenshtein_dist(row, target):
            # Compute levenshtein distance, up to a value

            # Cast to str() required to prevent a crash on NaN.
            return levenshtein(str(row).upper(), str(target).upper(), levenshtein_n)


        # Apply the function to each row of the DataFrame
        levenshtein_dist_out = df[idx][filter_var].apply(levenshtein_dist, target=levenshtein_seq)

        out = {}
        out_to_json = {}

        all_idx = pd.Series(np.zeros(len(df), dtype=bool))
        
        levenshtein_idx = levenshtein_dist_out <= levenshtein_n
        all_idx = all_idx | levenshtein_idx

        total_rows = int(np.sum(all_idx))

        if add_subset:
            new_subset_id, db_insert, count = self.add_subset(all_idx,
                                                       subset_counter)
            out['db_insert'] = db_insert
            out_to_json['new_subset_id'] = new_subset_id
            out_to_json['subsets'] = self.get_subsets_no_json({})

            subsets_out = {}
            for key in subsets.keys():
                subsets_out[key] = api_utils.export_subset(subsets, key)

        out_to_json['matching_levenshtein_rows'] = total_rows
        out_to_json['levenshtein_n'] = levenshtein_n
        out['json'] = json.dumps(out_to_json)
        return out

    def add_multiple_subsets(self, args, subsets, subset_counter, filter_var, filter_results, filter_idxs):
        # Create multiple new subsets from the filter idxs
        db_inserts = []
        organize_bulk_array = []

        for i in range(len(filter_idxs)):
            filt_data = filter_results[i]
            subset_idx = filter_idxs[i]

            subset_counter, db_insert, count = self.add_subset(subset_idx, subset_counter)
            db_inserts.append(db_insert)

            organize_bulk_array.append({
                'name': filter_var + ': ' + filt_data['filter'],
                'count': count,
                'id': subset_counter,
                'size': None,
                'color': None,
            })
            subset_counter += 1

        return {
            'json': json.dumps({'new_subsets': organize_bulk_array, 'all_subsets': self.get_subsets_no_json(args)}),
            'db_insert_multi': db_inserts,
        }

    def bulk_import(self, args):
        df, subsets, subset_counter, math_vars, col_labels = self.get_data()
        if df is None:
            return json.dumps({'error': api_utils.data_not_loaded_str})

        data = args['data']

        import_string = data['bulkImport']
        use_contains = api_utils.get_boolp(data, 'use_contains')

        subset_id = data['subset_id']
        if subset_id is None:
            return json.dumps({'error': 'subset_id is invalid.'})

        if subset_id not in subsets:
            return json.dumps({'error': 'subset_id not found.'})

        bulk_import_column_name = data['filterColumn']

        if bulk_import_column_name not in df.columns:
            return json.dumps({'error': 'Unknown filter column.'})

        try:
            bulk_import_df = pd.read_csv(StringIO(import_string), delimiter='\t', header=None)
        except pd.errors.EmptyDataError:
            return json.dumps({'error': 'No input, did you paste anything in?'})
        except Exception as e:
            return json.dumps({'error': str(type(e).__name__) + ': ' + str(e)})

        if len(bulk_import_df.columns) < 2 or len(bulk_import_df.columns) > 4:
            return json.dumps({'error': 'Incorrect number of columns.  There should be 2, 3, or 4 columns.  Found: ' + str(len(bulk_import_df.columns)) + ' column(s).'})

        # Add column headers.
        need_to_add_cols = 4 - len(bulk_import_df.columns)
        
        for i in range(need_to_add_cols):
            bulk_import_df[str(i+2)] = np.ones(len(bulk_import_df)) * float('nan')
        
        bulk_import_df.set_axis(['subset_name', 'filter_string', 'size', 'color'], axis=1, inplace=True)

        print(bulk_import_df)

        # Iterate through the bulk import filter text for unique sub set names. Afterwards take the filter strings associated with those names (can be more than 1) and subset main session df for those strings. 

        organize_bulk_array = []
        db_inserts = []

        if len(bulk_import_df['subset_name'].unique()) < 1:
            return json.dumps({'error': 'No rows supplied.'})

        for subset_name in bulk_import_df['subset_name'].unique():
            subset_name = str(subset_name)
            if pd.isna(subset_name):
                return json.dumps({'error': 'Subset name is empty.  Blank subset names are not allowed, are you sure you set a name for each row?'})

            found_valid_row = False
            subset_idx = np.zeros(len(df), dtype=bool)
            for search_str in bulk_import_df[bulk_import_df['subset_name'].astype(str) == subset_name]['filter_string']:
                search_str = str(search_str)
                print('search_str', search_str)
                reg = api_utils.translate_filter_to_regex(search_str)
                
                if pd.isna(search_str):
                    print('   invalid string.')
                    continue
                
                found_valid_row = True
                if use_contains:
                    subset_idx = subset_idx | (df[bulk_import_column_name].astype(str).str.contains(reg, na=False, regex=True, case=False))
                else:
                    subset_idx = subset_idx | (df[bulk_import_column_name].astype(str).str.fullmatch(reg, na=False, case=False))

            if not found_valid_row:
                # This subset had no valid rows, warn the user.
                return json.dumps({'error': 'Subset "' + subset_name + '" had no valid rows.'})


            # Restrict to selected subset.
            subset_idx &= subsets[subset_id]['idx']

            subset_counter, db_insert, count = self.add_subset(subset_idx, subset_counter)
            
            db_inserts.append(db_insert)

            subset_color_array = bulk_import_df[bulk_import_df['subset_name'] == subset_name][['color']].dropna()

            if subset_color_array.empty:
                subset_color = None
            else: 
                subset_color = subset_color_array.iat[-1,0]
            
            subset_size_array = bulk_import_df[bulk_import_df['subset_name'] == subset_name][['size']].dropna()

            if subset_size_array.empty:
                subset_size = None
            else: 
                try:
                    subset_size = max(1, int(subset_size_array.iat[-1,0]))
                except ValueError as e:
                    return json.dumps({'error': 'Subset "' + subset_name + '" has size set to "' + subset_size_array.iat[-1,0] + '" which is not an integer.'})

            organize_bulk_array.append({
                'name': subset_name,
                'count': count,
                'id': subset_counter,
                'size': subset_size,
                'color': subset_color,
            })
            subset_counter += 1

        return {
            'json': json.dumps({'new_subsets': organize_bulk_array, 'all_subsets': self.get_subsets_no_json(args)}),
            'db_insert_multi': db_inserts,}

    def get_unique_strings(self, args):
        df, subsets, subset_counter, math_vars, col_labels = self.get_data()
        if df is None:
            return json.dumps({'error': api_utils.data_not_loaded_str})

        data = args['data']
        subset_id = data['subset_id']
        filter_var = data['filter_var']

        if subset_id is None:
            return json.dumps({'error': 'subset_id is invalid.'})

        if subset_id not in subsets:
            return json.dumps({'error': 'subset_id not found.'})

        # Ensure that the filter variable exists
        if filter_var is None:
            return json.dumps({'error': 'filter_var is invalid.'})

        if filter_var not in df.columns:
            return json.dumps(
                {'error': 'fitler_var: ' + filter_var + ' not found'})

        idx = subsets[subset_id]['idx']

        # Need to do astype(str) otherwise you can have integer or float values that match
        # other string values.  They will appear different here and then end up the same thing
        # when casted to a string later.
        value_counts = df[idx][filter_var].astype(str).value_counts()
        num_unique = len(value_counts)
        if num_unique > 100:
            return json.dumps({'num_unique': num_unique})

        return json.dumps({'unique': value_counts.to_dict(), 'num_unique': num_unique})

    def __get_subset_idx(self, df, subsets, subset_id):
        if subset_id is None:
            idx = pd.Series(np.ones(len(df), dtype=bool))
            subset_id = 0
        elif subset_id not in subsets:
            return json.dumps(
                {'error': str(subset_id) + ' not in known subsets.'})
        else:
            idx = subsets[subset_id]['idx']
        return idx
