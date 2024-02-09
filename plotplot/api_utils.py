import numpy as np
import numba as nb
import plotly.graph_objects as go
import traceback
from functools import wraps
import json
import datashader
import pandas as pd
import os
import threading
import copy
import time
import html
import re
import locale

from . import plotplot_config


locale.setlocale(locale.LC_ALL, '')

invalid_session_id_err_str = 'Invalid session ID. The server may have restarted; you can try reloading the page but your session may not still be running.'

data_not_loaded_str = 'Data not yet loaded.'

upload_folder = plotplot_config.get_upload_dir()
gdrive_folder = os.path.join(plotplot_config.get_upload_dir(), 'gdrive')

max_rows_for_heatmap = 100000
heatmap_x = 200
heatmap_y = 200

rank_col_name = 'y_plotplot_rank_832x9w3' # something unlikely to have overlap with data.

def get_gdrive_path(filename: str):
    return os.path.join(gdrive_folder, filename)


def get_str(x):
    """Returns x, while converting a string value of "null" or "undefined" to None"""
    if x == 'null' or x == 'undefined':
        return None
    return x


def get_strp(postdata, val):
    """Returns value for key/index val, call api_utils.get_str on value"""
    if val in postdata:
        return get_str(postdata[val])
    return None


def get_float(x):
    """ converts x to float if possible returns None otherwise. """
    if x == 'null' or x == 'undefined':
        return None
    try:
        xf = float(x)
    except:
        return None
    return xf


def get_floatp(postdata, val):
    """Returns value for key/index val, call api_utils.get_float on value"""
    if val in postdata:
        return get_float(postdata[val])
    return None


def get_int(x):
    """ converts x to int if possible returns None otherwise. """
    if x == 'null' or x == 'undefined':
        return None
    try:
        xf = int(x)
    except:
        return None
    return xf


def get_bool(x):
    """ converts x to bool if possible returns False otherwise. """
    if x == 'null' or x == 'undefined':
        return False
    try:
        xf = bool(x)
    except:
        return False
    return xf


def get_intp(postdata, val):
    """Returns value for key/index val, call api_utils.get_int on value"""
    if val in postdata:
        return get_int(postdata[val])
    return None


def get_arrayp(postdata, val):
    if val in postdata:
        return postdata[val]
    else:
        return None


def get_boolp(postdata, val):
    """Returns value for key/index val, call api_utils.get_bool on value"""
    if val in postdata:
        return get_bool(postdata[val])
    return False


def export_subset(subsets, subset_id):
    return {
        'id': subset_id,
        'count': subsets[subset_id]['count'],
    }


def get_numeric_cols(df):
    val = df.select_dtypes(include=np.number)
    if isinstance(val, list): # happens in anndata shim
        return val
    return val.columns.tolist()


def do_autorange(x, y):
    margin = 0.10

    xmin = np.min(x)
    xmax = np.max(x)

    ymin = np.min(y)
    ymax = np.max(y)

    xmargin = (xmax - xmin) * margin
    ymargin = (ymax - ymin) * margin

    xrange = [xmin - xmargin / 2, xmax + xmargin / 2]
    yrange = [ymin - ymargin / 2, ymax + ymargin / 2]

    return (xrange, yrange)


# From: https://stackoverflow.com/a/59586544
@nb.jit(nopython=True)
def extrema_while_nb(arr):
    """Returns max and min value of an array in a single transversal"""
    n = arr.size
    odd = n % 2
    if not odd:
        n -= 1
    max_val = min_val = arr[0]
    i = 1
    while i < n:
        x = arr[i]
        y = arr[i + 1]
        if x > y:
            x, y = y, x
        min_val = min(x, min_val)
        max_val = max(y, max_val)
        i += 2
    if not odd:
        x = arr[n]
        min_val = min(x, min_val)
        max_val = max(x, max_val)
    return max_val, min_val

def generate_scatter(df,
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
                     row=None,
                     col=None,
                     hoverlist=[]):
    # Generate a scatter plot using Plotly.
    # idxs: an array of each subsets' true/false idx.  The user wants a plot combining all of these subsets, with different colors.
    num_points_for_hover = 20000
    plot_supports_hovering = False
    df_x = np.array(df[x], dtype=float)
    df_y = np.array(df[y], dtype=float)

    print(f'generate scatter, z: {z}')
    df_z = None
    if z is not None:
        df_z = np.array(df[z], dtype=float)

    minmax = None
    cmin = None
    cmax = None

    # Compute the maximum number of points in all of the subsets.  We need this to scale datashader calls correctly,
    # otherwise different subsets will be shown on different scales in the colormaps.
    max_num_valid = 0
    num_nan = 0
    longest_col_name_len = 0

    non_null_both_array = []
    for trace_num, idx in enumerate(idxs):
        if z is None:
            non_null_both = np.isfinite(df_x) & np.isfinite(df_y) & (idx)
        else:
            non_null_both = np.isfinite(df_x) & np.isfinite(df_y) & np.isfinite(df_z) & (idx)
        non_null_both_array.append(non_null_both)
        max_num_valid = max(max_num_valid, np.sum(non_null_both))

    for trace_num, idx in enumerate(idxs):
        non_null_both = non_null_both_array[trace_num]

        num_nan += np.sum(idx) - np.sum(non_null_both)
        is_heatmap = False

        # Compute data min/max
        if use_bbox:
            # Filter data to just our bounding box.
            idx = (df[x] >= xmin_margin) & (df[x] <= xmax_margin) & (
                df[y] >= ymin_margin) & (df[y] <= ymax_margin) & (idx)

            # Add a gray box so the user knows that outside this region is not loaded
            # 1e7 causes issues with the left/top boxes not tracking the axis well.
            huge = max(
                1e4, max(xmax_margin - xmin_margin, ymax_margin - ymin_margin))
            # left side
            fig.add_shape(type='rect',
                          x0=xmin_margin - huge,
                          y0=ymin_margin - huge,
                          x1=xmin_margin,
                          y1=huge,
                          fillcolor="#cccccc",
                          line_color="rgba(0,0,0,0)",
                          row=row,
                          col=col,
                          name='data-not-loaded-left')

            # top
            fig.add_shape(type='rect',
                          x0=xmin_margin - huge,
                          y0=ymax_margin,
                          x1=xmax_margin + huge,
                          y1=ymax_margin + huge,
                          fillcolor="#cccccc",
                          line_color="rgba(0,0,0,0)",
                          row=row,
                          col=col,
                          name='data-not-loaded-top')

            # right side
            fig.add_shape(type='rect',
                          x0=xmax_margin,
                          y0=ymin_margin - huge,
                          x1=xmax_margin + huge,
                          y1=ymax_margin + huge,
                          fillcolor="#cccccc",
                          line_color="rgba(0,0,0,0)",
                          row=row,
                          col=col,
                          name='data-not-loaded-right')

            # bottom
            fig.add_shape(type='rect',
                          x0=xmin_margin - huge,
                          y0=ymin_margin - huge,
                          x1=xmax_margin + huge,
                          y1=ymin_margin,
                          fillcolor="#cccccc",
                          line_color="rgba(0,0,0,0)",
                          row=row,
                          col=col,
                          name='data-not-loaded-bottom')

        if len(df[idx][x]) > max_rows_for_heatmap:
            # Plot is too big to send as a scatter plot.  Convert to a datashader plot.
            if xlog or ylog:
                # When in log mode, Canvas needs the range.
                xmax_data, xmin_data = extrema_while_nb(df[idx][x].values)
                ymax_data, ymin_data = extrema_while_nb(df[idx][y].values)

                x_axis_type = 'linear'
                y_axis_type = 'linear'

                if xlog:
                    x_axis_type = 'log'
                    xmin_data = max(1e-100, xmin_data)
                    xmax_data = max(1e-100, xmax_data)
                if ylog:
                    y_axis_type = 'log'
                    ymin_data = max(1e-100, ymin_data)
                    ymax_data = max(1e-100, ymax_data)

                cvs = datashader.Canvas(plot_width=heatmap_x,
                                        plot_height=heatmap_y,
                                        x_range=(xmin_data, xmax_data),
                                        y_range=(ymin_data, ymax_data),
                                        x_axis_type=x_axis_type,
                                        y_axis_type=y_axis_type)
            else:
                cvs = datashader.Canvas(plot_width=heatmap_x,
                                        plot_height=heatmap_y)
            is_heatmap = True

            # Drop NA
            non_null_both_idx = non_null_both & (idx)

            # datax = []
            # datax.append(x[non_null_x].replace([np.inf, -np.inf], np.nan).dropna())

            if z is None:
                agg = cvs.points(df[non_null_both_idx], x, y)
            else:
                agg = cvs.points(df[non_null_both_idx], x, y, datashader.mean(z))

                # Can't do min/max on agg.values because then the color sliders won't do the full range
                # because agg.values is mean not min/max.
                idx_finite_z = (idx & np.isfinite(df_z))
                cmin = float(df_z[idx_finite_z].min())
                cmax = float(df_z[idx_finite_z].max())
                
            #agg = cvs.points(dask_df[non_null_both_idx], x, y)

            agg.values = agg.values.astype(float)

            if z is None:
                # If there is no z value, we don't want to show places where the counts are 0 (no data there)
                zero_mask = agg.values == 0

                # scale the datashader points to make them all run on a scale from the max of what we are showing
                #agg.values = agg.values * (np.sum(non_null_both) / max_num_valid)

                agg.values[zero_mask] = np.nan

            # Color is all handled on the frontend
            trace1 = go.Heatmap(z=agg,
                                x=agg.coords[x],
                                y=agg.coords[y],
                                connectgaps=False, showscale=True)
            fig.add_trace(trace1, row=row, col=col)
            fig.update_traces(hoverinfo='skip',
                              hovertemplate=None)

            # Min/max is cheap to compute here since it is just over the aggrigated array instead of the full dataset.
            xmin = float(agg.coords[x].min())
            xmax = float(agg.coords[x].max())
            ymin = float(agg.coords[y].min())
            ymax = float(agg.coords[y].max())

            if minmax is None:
                minmax = [(xmin, xmax), (ymin, ymax), (cmin, cmax)]
            else:
                minmax = merge_minmax([(xmin, xmax), (ymin, ymax), (cmin, cmax)], minmax)

        else:
            if len(df[idx]) < num_points_for_hover:
                plot_supports_hovering = True

            cmin = np.nan
            cmax = np.nan

            marker = dict(size=3,)
            if z is not None:
                print('got z!')
                # The user has provided a z-variable.  Color based on that variable.
                marker = {
                    'size': 3,
                    'color': df_z[idx],
                    'colorscale': 'Viridis',
                }

                idx_finite_z = (idx & np.isfinite(df_z))

                if len(df_z[idx_finite_z]) > 0:
                    cmin = float(df_z[idx_finite_z].min())
                    cmax = float(df_z[idx_finite_z].max())
                

            if len(df[idx]) >= num_points_for_hover or len(hoverlist) == 0:
                scatter = go.Scattergl(x=df[idx][x], y=df[idx][y], mode='markers', marker=marker, showlegend=False, hoverinfo='skip')
            else:
                max_col_len = 45
                hoverlist_truncate = []
                for l in hoverlist:
                    hoverlist_truncate.append(truncate_middle(l, max_col_len))
                longest_col_name_len = len(max(hoverlist_truncate,key=len))
                templatelist = '<b>Subset:</b><br>' # This is replaced on the frontend
                for num, column_name in enumerate(hoverlist_truncate):
                    templatelist += '<b>' + column_name.ljust(longest_col_name_len) + '</b>' + ': %{customdata[' + str(num) + ']}<br>' 
                templatelist = templatelist + '<extra></extra>'
                # scatter = go.Scattergl(x=df[idx][x], y=df[idx][y], mode='markers', marker=dict(color='rgba(66, 135, 245, 0.5)', size=3,), hoverinfo='text', hovertext=df[idx][hoverlist], showlegend=False)

                # We can't use D3'd formatting syntax to format numbers because we can only specify one formatting syntax and if you ask for decimals,
                # it won't display text.
                # So we're stuck computing strings here and just passing strings to the frontend.
                def format_str_for_hover(value):
                    """ Pass through all strings. Format numbers with commas as thousands separators and up to 6 significant digits."""
                    if isinstance(value, (int, float)):
                        # Check if the value is positive and not zero, then add a space
                        formatted_value = format(value, '0,.6g')
                        if value >= 0:
                            formatted_value = " " + formatted_value
                        return formatted_value
                    return " " + truncate_middle(value, 50)

                hoverdata = df[idx][hoverlist].fillna(' ').applymap(format_str_for_hover)

                scatter = go.Scattergl(x=df[idx][x], y=df[idx][y], mode='markers', marker=marker, hoverinfo='text', customdata=hoverdata, hovertemplate=templatelist, showlegend=False)
                fig.update_layout(hoverlabel=dict(bgcolor='white', font_size=14, font_family="monospace"), hovermode='closest')
            
            fig.add_trace(scatter, row=row, col=col)

            # We can afford to compute min/max since there aren't that many points.
            idx_finite_x = (idx & np.isfinite(df[x]))
            idx_finite_y = (idx & np.isfinite(df[y]))

            xmin = float(df[idx_finite_x][x].min())
            xmax = float(df[idx_finite_x][x].max())
            ymin = float(df[idx_finite_y][y].min())
            ymax = float(df[idx_finite_y][y].max())
            if minmax is None:
                minmax = [(xmin, xmax), (ymin, ymax), (cmin, cmax)]
            else:
                minmax = merge_minmax([(xmin, xmax), (ymin, ymax), (cmin, cmax)], minmax)
    
    return fig, minmax, num_nan, is_heatmap, plot_supports_hovering, longest_col_name_len

def truncate_middle(s, n):
    if len(s) <= n:
        # string is already short-enough
        return s
    # half of the size, minus the 3 .'s
    n_2 = n // 2 - 3
    # whatever's left
    n_1 = n - n_2 - 3
    return '{0}...{1}'.format(s[:n_1], s[-n_2:])


def generate_scatter_and_nans(df, x, y, z, idxs, fig, use_bbox,
                              xmin_margin, xmax_margin, ymin_margin,
                              ymax_margin, xlog, ylog, hoverlist):
    # WARNING: Don't change 0.85 and 0.15 without updating the values
    # in PlotGroup.js
    start = time.time()
    fig = fig.set_subplots(2,
                           2,
                           column_widths=[0.85, 0.15],
                           row_heights=[0.15, 0.85],
                           shared_xaxes='columns',
                           shared_yaxes='rows',
                           horizontal_spacing=0.025,
                           vertical_spacing=0.025,
                           subplot_titles=('', '', '', ''))

    fig, minmax, num_nan, is_heatmap, plot_supports_hovering, longest_col_name_len = generate_scatter(df,
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
                                                        row=2,
                                                        col=1,
                                                        hoverlist=hoverlist)
    print('after generate_scatter', time.time() - start)

    all_subsets_idx = np.zeros(len(df), dtype=bool)
    for idx in idxs:
        all_subsets_idx |= idx
    # Find rows that are null in X but valid in Y (and vice versa):
    df_x = df[all_subsets_idx][x]
    df_y = df[all_subsets_idx][y]

    null_x = ~np.isfinite(df_x) & np.isfinite(df_y)
    null_y = (np.isfinite(df_x)) & (~np.isfinite(df_y))
    null_both = ~np.isfinite(df_x) & ~np.isfinite(df_y)
    non_null_x = np.isfinite(df_x)
    non_null_y = np.isfinite(df_y)
    non_null_both = np.isfinite(df_x) & np.isfinite(df_y)

    both_nan = np.sum(null_both)

    # Do auto-scaling
    nbins, valmax = AutoScaleHistogram(df_x, df_y, null_x, null_y, non_null_x,
                                       non_null_y)
    print('auto scale results bins', nbins, ' valmax', valmax)
    valmax *= 1.1

    assert len(df_x) == len(df_y)

    trace_top_nan = generate_nan_histogram(df_x, null_y, nbins, 'top')
    trace_top_nonnan = generate_nan_histogram(df_x,
                                              non_null_x,
                                              nbins,
                                              'top',
                                              stepgraph=True)
    trace_right_nan = generate_nan_histogram(df_y, null_x, nbins, 'right')
    trace_right_nonnan = generate_nan_histogram(df_y,
                                                non_null_y,
                                                nbins,
                                                'right',
                                                stepgraph=True)

    # trace_top_nan = generate_nan_histogram(df_x, null_y, nbins, 'top')
    # trace_top_nonnan = generate_nan_histogram(df_x, null_y, nbins, 'top', stepgraph=True)
    # trace_right_nan = generate_nan_histogram(df_y, null_x, nbins, 'right')
    # trace_right_nonnan = generate_nan_histogram(df_y, null_x, nbins, 'right', stepgraph=True)

    if trace_top_nan is not None:
        fig.add_trace(trace_top_nan, row=1, col=1)
    if trace_top_nonnan is not None:
        fig.add_trace(trace_top_nonnan, row=1, col=1)

    if trace_right_nan is not None:
        fig.add_trace(trace_right_nan, row=2, col=2)
    if trace_right_nonnan is not None:
        fig.add_trace(trace_right_nonnan, row=2, col=2)

    # Sets properties on all axes
    fig.update_xaxes(type='linear', autorange=False, automargin=False)

    fig.update_yaxes(type='linear', autorange=False, automargin=False)

    fig.layout['xaxis']['title'] = {'text': ''}
    fig.layout['xaxis1']['title'] = {'text': ''}
    fig.layout['xaxis2']['title'] = {'text': ''}
    fig.layout['xaxis3']['title'] = {'text': x}
    fig.layout['xaxis4']['title'] = {'text': ''}

    fig.layout['yaxis']['title'] = {'text': ''}
    fig.layout['yaxis1']['title'] = {'text': ''}
    fig.layout['yaxis2']['title'] = {'text': ''}
    fig.layout['yaxis3']['title'] = {'text': y}
    fig.layout['yaxis4']['title'] = {'text': ''}

    # Set the initial ranges for the NaN plots.
    fig.layout['yaxis']['range'] = [-0.0005, valmax]
    fig.layout['yaxis']['tickformat'] = ',.0%'

    fig.layout['xaxis4']['range'] = [-0.0005, valmax]
    fig.layout['xaxis4']['tickformat'] = ',.0%'

    fig.layout['yaxis3']['scaleanchor'] = 'x3'
    print('after everything', time.time() - start)
    return fig, minmax, both_nan, num_nan, is_heatmap, plot_supports_hovering, longest_col_name_len


def get_rank_df(df, y, z, hoverlist):
    df_out = {
        y: df[y],
        rank_col_name: df[y].rank(numeric_only=True, ascending=False, method='first'),
    }
    if z is not None:
        df_out[z] = df[z]

    for c in hoverlist:
        df_out[c] = df[c]

    return pd.DataFrame(df_out)


def generate_histogram(df, idxs, fig, x, nbins, hist_type):
    minmax = None

    if hist_type is None:
        hist_type = 'count'
    assert hist_type == 'count' or hist_type == 'proportion'

    data_finite_list = []

    for idx in idxs:
        # Drop nans.
        data_finite = df[idx][x].replace([np.inf, -np.inf], np.nan).dropna()
        if len(data_finite) < 1:
            continue
        data_min = min(data_finite)
        data_max = max(data_finite)

        if minmax is None:
            minmax = [data_min, data_max]
        else:
            minmax = [min_finite(minmax[0], data_min), max_finite(minmax[1], data_max)]

        data_finite_list.append(data_finite)

    autorange_all = None
    for data_finite in data_finite_list:
        hist, bin_edges = np.histogram(data_finite, bins=nbins, range=minmax)

        widths = bin_edges[1:] - bin_edges[0:-1] + 0.0001

        if hist_type == 'proportion':
            total = np.sum(hist)
            factor = 1/total
            # Apply proportional scaling to the values.
            hist = hist * factor

        # Do some auto-scaling that makes sense for us.  This means that if there is a single huge bin,
        # we don't want to include that in the autoscale (probably is missing data).

        median = np.median(hist)
        maxval = np.max(hist)
        if abs(median) > 1e-6 and maxval / median > 10: # protect against divide by zero
            # autoscale to the second largest
            hist2 = np.delete(hist, np.where(hist >= maxval))

            autorange = do_autorange(bin_edges, hist2)
        else:
            autorange = do_autorange(bin_edges, hist)

        if autorange_all is None:
            autorange_all = autorange
        else:
            autorange_all = [(min(autorange_all[0][0], autorange[0][0]),
                              max(autorange_all[0][1], autorange[0][1])),
                             (min(autorange_all[1][0], autorange[1][0]),
                              max(autorange_all[1][1], autorange[1][1]))]

        # Make a bar chart
        marker = go.bar.Marker(line={'width': 0})

        trace = go.Bar(x=bin_edges,
                       y=hist,
                       offset=0,
                       width=widths,
                       marker=marker)

        fig.add_trace(trace)

    fig.update_xaxes(range=autorange_all[0])
    fig.update_yaxes(range=autorange_all[1])

    fig.update_layout(showlegend=False)

    return fig, autorange_all


def generate_nan_histogram(data, indexes, bins, position, stepgraph=False):
    if len(data) < 1:
        # no data
        return None

    non_null = np.isfinite(data)
    data_min = np.min(data[non_null])
    data_max = np.max(data[non_null])

    if np.isnan(data_min) or np.isnan(data_max):
        return None

    # Bin those values.
    hist, bin_edges = np.histogram(data[indexes],
                                   bins=bins,
                                   range=(data_min, data_max))

    # Divide the counts by the total number of rows to get the fraction of NaNs of the total dataset that are in the bin.
    hist2 = np.divide(hist, np.sum(non_null))

    # Compute the interval width
    width = bin_edges[1] - bin_edges[0]

    # Set the limits to match the main plot.
    nan_color = '#C44E52'
    data_color = '#808080'

    if position == 'bottom' or position == 'top':
        if stepgraph:
            # For the step graph, we want to draw the end caps and
            # the final step.  To do this, we add some points:
            final_step = copy.deepcopy(list(hist2))
            final_step = [0] + final_step
            final_step.append(hist2[-1])
            final_step.append(0)

            xbins1 = copy.deepcopy(list(bin_edges))
            xbins1 = [xbins1[0] - width] + xbins1 + [xbins1[-1]]

            trace = go.Scattergl(x=xbins1,
                                 y=final_step,
                                 line_shape='hvh',
                                 showlegend=False,
                                 mode='lines',
                                 line=dict(color=data_color))
        else:
            marker = go.bar.Marker(line={'width': 0}, color=nan_color)
            trace = go.Bar(x=bin_edges,
                           y=hist2,
                           marker=marker,
                           orientation='v',
                           showlegend=False)

    elif position == 'left' or position == 'right':
        if stepgraph:
            # For the step graph, we want to draw the end caps and
            # the final step.  To do this, we add some points:
            final_step = copy.deepcopy(list(hist2))
            final_step = [0] + final_step
            final_step.append(hist2[-1])
            final_step.append(0)

            xbins1 = copy.deepcopy(list(bin_edges))
            xbins1 = [xbins1[0] - width] + xbins1 + [xbins1[-1]]

            trace = go.Scattergl(x=final_step,
                                 y=xbins1,
                                 line_shape='vhv',
                                 showlegend=False,
                                 mode='lines',
                                 line=dict(color=data_color))
        else:
            marker = go.bar.Marker(line={'width': 0}, color=nan_color)
            trace = go.Bar(x=hist2,
                           y=bin_edges[:-1],
                           marker=marker,
                           orientation='h',
                           showlegend=False)

    else:
        raise Exception('invalid position: ' + position)

    return trace


def AutoScaleHistogram(x, y, null_x, null_y, non_null_x, non_null_y):
    # Compute good values for the 4 plots and then go from there.
    start = time.time()

    MAX_AUTO_BINS = 200

    datax = []
    datax.append(x[null_y].replace([np.inf, -np.inf], np.nan).dropna())
    datax.append(x[non_null_x].replace([np.inf, -np.inf], np.nan).dropna())
    xmin = np.min(datax[-1])
    xmax = np.max(datax[-1])

    datay = []
    datay.append(y[null_x].replace([np.inf, -np.inf], np.nan).dropna())
    datay.append(y[non_null_y].replace([np.inf, -np.inf], np.nan).dropna())
    ymin = np.min(datay[-1])
    ymax = np.max(datay[-1])

    non_null_x = np.sum(np.isfinite(x))
    non_null_y = np.sum(np.isfinite(y))

    n = len(x)
    nbins = []
    if not np.isnan(xmin) and not np.isnan(xmax):
        for d in datax:
            try:
                hist = np.histogram(d, bins='auto', range=(xmin, xmax))
            except np.core._exceptions._ArrayMemoryError:
                # There is a bug in numpy where some  times its 'auto' bins makes a tiny bin size and then wants to allocate a ridculous number of bins
                # see: https://github.com/numpy/numpy/issues/10297
                # Catch and append max number of bins.
                nbins.append(MAX_AUTO_BINS)
            else:
                nbins.append(min(MAX_AUTO_BINS, len(hist[1]) - 1))
    if not np.isnan(ymin) and not np.isnan(ymax):
        for d in datay:
            try:
                hist = np.histogram(d, bins='auto', range=(ymin, ymax))
            except np.core._exceptions._ArrayMemoryError:
                # There is a bug in numpy where sometimes its 'auto' bins makes a tiny bin size and then wants to allocate a ridculous number of bins
                # see: https://github.com/numpy/numpy/issues/10297
                # Catch and append max number of bins.
                nbins.append(MAX_AUTO_BINS)
            else:
                nbins.append(min(MAX_AUTO_BINS, len(hist[1]) - 1))
    if len(nbins) < 1:
        # no data
        return (10, 0)

    outbins = int(round(np.mean(nbins)))

    # limit number of bins to MAX_AUTO_BINS
    outbins = min(outbins, MAX_AUTO_BINS)

    # Now that we have bin count, compute max value.
    maxval = -np.inf
    if not np.isnan(xmin) and not np.isnan(xmax):
        for d in datax:
            hist = np.histogram(d, bins=outbins, range=(xmin, xmax))
            val = max(np.divide(hist[0], non_null_x))
            maxval = max(maxval, val)

    if not np.isnan(ymin) and not np.isnan(ymax):
        for d in datay:
            hist = np.histogram(d, bins=outbins, range=(ymin, ymax))
            val = max(np.divide(hist[0], non_null_y))
            maxval = max(maxval, val)

    if maxval == -np.inf:
        maxval = 0
    return (outbins, maxval)


def exception_decorator(func):
    """
    Intercepts exceptions and returns traceback + error as a JSON string. 
    """

    @wraps(func)
    def _handle_exceptions(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except BaseException as e:
            tb = traceback.format_exc()
            print(e)
            print(str(tb))
            return json.dumps(dict(error=str(e) + '\n\n' + str(tb)))

    return _handle_exceptions


def rgb_to_hex(rgb):
    return '%02x%02x%02x' % rgb


def hex_to_rgb(hexa):
    return tuple(int(hexa[i:i + 2], 16) for i in (0, 2, 4))

heatmap_cmaps = [
    'Blues',
    'Oranges',
    'Greens',
    'Reds',
    'Purples',
    'Greys',
    'Brwnyl',
]

def copy_with_progress(source, destination, callback):

    x = threading.Thread(target=copy_with_progress_thread,
                         args=(source, destination, callback))
    x.start()
    callback(100)


def copy_with_progress_thread(source, destination, callback):
    source_size = os.stat(source).st_size
    copied = 0

    with open(source, "rb") as source, open(destination, "wb") as target:
        while True:
            chunk = source.read(1024)
            if not chunk:
                break

            target.write(chunk)
            copied += len(chunk)

            callback(copied * 100 / source_size)


def calculate_correlation(df: pd.DataFrame, x_col: str, y_col: str):
    """
    A method for calculating the correlation between two columns in a data frame and returns R and R^2.
    Used because the corr method of pandas correlates all columns with all others by default, which is more intensive than needed.
    Returns a dict of tuples containing R and R^2 for each correlation method in pandas.
    """

    methods = ['pearson', 'kendall', 'spearman']
    correlations: dict = {}
    for method in methods:
        if (x_col is None or y_col is None):
            correlations[method] = (np.float64(0), np.float64(0))
            continue
        elif (x_col == y_col):
            correlations[method] = (np.float64(1), np.float64(1))
            continue

        r = df[[x_col, y_col]].corr(method=method)[x_col][y_col]
        r_sq = np.square(r)
        correlations[method] = (r, r_sq)

    return correlations

def do_math_helper(df, math_vars, raw_expr):
    """
    Performs math on a dataframe given a math expression like:
        '1+<mathvar>Kindey</mathvar>+2'

    Can be run from a database load or from the user making a new math variable.
    """

    if raw_expr is None:
        return json.dumps(['error'])
    expression = html.unescape(raw_expr)

    # Convert from 1+<mathvar>Kindey</mathvar>+2 to an expression for pandas eval.
    # Pandas wants: 1+df["Kidney"]+2

    # html.unescape() makes unicode spaces that makes pandas mad.
    expression = expression.replace(u"\u00a0", ' ')

    df_expression = expression.replace('<mathvar>',
                                        'df["').replace('</mathvar>', '"]')
    name_expression = expression.replace('<mathvar>',
                                            '').replace('</mathvar>', '')

    try:
        print(df_expression)
        new_col = pd.eval(df_expression)
        print(new_col)
    except Exception as e:
        return {'error': str(type(e).__name__) + ': ' + str(e)}

    math_vars.append(pack_math_var(raw_expr, '', True))

    out = {}
    out['name'] = name_expression
    out['new_col'] = new_col
    out['math_vars'] = math_vars

    return out

def pack_math_var(raw_expr, name, is_visible):
    return [raw_expr, name, is_visible]

def unpack_math_var(math_var):
    return {
        'expr': math_var[0],
        'name': math_var[1],
        'is_visible': math_var[2],
    }

def min_finite(n1, n2):
    if n1 is None:
        return n2
    if n2 is None:
        return n1

    if np.isfinite(n1):
        if np.isfinite(n2):
            return min(n1, n2)
        else:
            return n1
    else:
        return n2

def max_finite(n1, n2):
    if n1 is None:
        return n2
    if n2 is None:
        return n1

    if np.isfinite(n1):
        if np.isfinite(n2):
            return max(n1, n2)
        else:
            return n1
    else:
        return n2

def merge_minmax(minmax1, minmax2):
    # Combine min/max values so that the min/max covers both.
    if minmax1 is None:
        return minmax2
    if minmax2 is None:
        return minmax1

    xmin = min_finite(minmax1[0][0], minmax2[0][0])
    xmax = max_finite(minmax1[0][1], minmax2[0][1])

    ymin = min_finite(minmax1[1][0], minmax2[1][0])
    ymax = max_finite(minmax1[1][1], minmax2[1][1])

    cmin = min_finite(minmax1[2][0], minmax2[2][0])
    cmax = max_finite(minmax1[2][1], minmax2[2][1])

    return [ [xmin, xmax], [ymin, ymax], [cmin, cmax] ]

def translate_filter_to_regex(f):
    # Use a simplified regex language.
    # * ---> .* "match anything"
    # ? ---> .  "match single character"
    # [abc] ---> no change
    reg = re.escape(f).replace('\\*',
                                '.*').replace('\\?', '.').replace(
                                    '\\[', '[').replace('\\]', ']')
    return reg
