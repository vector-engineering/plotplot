import threading
import pandas as pd
import os
import numpy as np
from . import api_utils
import anndata
from .anndata_shim import AnndataShim
import traceback

class LoadCsvThread(threading.Thread):

    def __init__(self,
                 progress_queue,
                 path,
                 subsets_from_db,
                 data,
                 data_lock,
                 math_vars,
                 args=(),
                 kwargs=None):
        threading.Thread.__init__(self, args=(), kwargs=None)
        self.progress_queue = progress_queue
        self.path = path
        self.subsets_from_db = subsets_from_db
        self.math_vars = math_vars
        self.daemon = True
        self.data = data
        self.data_lock = data_lock

    def run(self):
        try:
            if self.math_vars is None:
                math_vars_len = 0
            else:
                math_vars_len = len(self.math_vars)

            # Extract the file extension
            _, ext = os.path.splitext(self.path)

            if ext == '.h5ad':
                # Load .h5ad file into AnnData object
                self.progress_queue.put({
                    'progress': 0,
                    'rows_loaded': 0,
                    'total_rows': 0,
                    'math_vars_loaded': 0,
                    'math_vars_total': math_vars_len,
                    'text': 'Opening h5ad file...',
                })

                # Check for a column-optimized version of the file

                adata = anndata.read_h5ad(self.path, backed='r')

                # Check to see if this is a sparse file that should be converted to CSC
                # (column-wise sparse compression)
                if isinstance(adata.X, anndata._core.sparse_dataset.CSCDataset):
                    # Need to copy the file and convert it.
                    self.progress_queue.put({
                        'progress': 0,
                        'rows_loaded': 0,
                        'total_rows': 0,
                        'math_vars_loaded': 0,
                        'math_vars_total': math_vars_len,
                        'text': 'Converting to column-optimized sparse h5ad: (Step 1/3)',
                    })
                    #path_pattern = f'{os.path.splitext(self.path)[0]}-plotplot-CSC-%s.h5ad'
                    #self.path = next_path(path_pattern)
                    self.path = f'{os.path.splitext(self.path)[0]}-plotplot-CSC.h5ad'
                    adata.write_h5ad(self.path)

                    self.progress_queue.put({
                        'progress': 0,
                        'rows_loaded': 0,
                        'total_rows': 0,
                        'math_vars_loaded': 0,
                        'math_vars_total': math_vars_len,
                        'text': 'Converting to column-optimized sparse h5ad: (Step 2/3)',
                    })
                    adata = anndata.read_h5ad(self.path, backed='r+')

                    self.progress_queue.put({
                        'progress': 0,
                        'rows_loaded': 0,
                        'total_rows': 0,
                        'math_vars_loaded': 0,
                        'math_vars_total': math_vars_len,
                        'text': 'Converting to column-optimized sparse h5ad: (Step 3/3)',
                    })
                    adata.X = adata.X.to_memory().tocsc()

                self.progress_queue.put({
                    'progress': 0,
                    'rows_loaded': 0,
                    'total_rows': 0,
                    'math_vars_loaded': 0,
                    'math_vars_total': math_vars_len,
                    'text': 'Loading h5ad...',
                })
                df = AnndataShim(adata)
                col_labels = df.col_labels_with_numeric
            else:
                col_labels = None
                self.progress_queue.put({
                    'progress': 0,
                    'rows_loaded': 0,
                    'total_rows': 0,
                    'math_vars_loaded': 0,
                    'math_vars_total': math_vars_len,
                    'text': 'Opening file...',
                })
                lines_number = sum(1 for line in open(self.path))
                self.progress_queue.put({
                    'progress': 0,
                    'rows_loaded': 0,
                    'total_rows': lines_number,
                    'math_vars_loaded': None,
                    'math_vars_total': None,
                    'text': 'Loading file data...',
                })

                chunksize = 8192  # I don't know what size is better
                lines_read = 0

                reader = pd.read_csv(self.path, chunksize=chunksize)
                df_list = []
                for chunk in reader:
                    lines_read += len(chunk)
                    df_list.append(chunk)

                    completed = float(lines_read) / lines_number
                    self.progress_queue.put({
                        'progress': completed,
                        'rows_loaded': lines_read,
                        'total_rows': lines_number,
                        'math_vars_loaded': 0,
                        'math_vars_total': math_vars_len,
                        'text': 'Parsing CSV...',
                    })

                df = pd.concat(df_list, ignore_index=True)

            subsets = {
                0: {
                    'idx': pd.Series(np.ones(len(df), dtype=bool)),
                    'count': len(df),
                }
            }
            if self.subsets_from_db is not None:
                subsets = subsets | self.subsets_from_db  # merge dictionaries
            
            subset_counter = 0
            for key in subsets:
                subset_counter = max(subset_counter, key)
            subset_counter += 1

            computed_math_vars = []
            if self.math_vars is not None:
                for i, packed_math_var in enumerate(self.math_vars):
                    print('Computing ' + str(packed_math_var))
                    # Unpack math variable from database.
                    math_var = api_utils.unpack_math_var(packed_math_var)
                    
                    # Compute the variable.
                    math_out = api_utils.do_math_helper(df, computed_math_vars, math_var['expr'])

                    if 'error' in math_out:
                        print('Error computing math variable:' + str(math_var))
                        print(math_out['error'])
                        continue

                    name_expression = math_out['name']
                    new_col = math_out['new_col']
                    computed_math_vars = math_out['math_vars']

                    df[name_expression] = new_col

                    self.progress_queue.put({
                        'progress': completed,
                        'rows_loaded': lines_read,
                        'total_rows': lines_number,
                        'math_vars_loaded': i+1,
                        'math_vars_total': math_vars_len,
                        'text': 'Restoring math variables...',
                    })
        except BaseException as e:
            tb = traceback.format_exc()
            print(e)
            print(str(tb))
            result = dict(error=str(e) + '\n\n' + str(tb))
            self.progress_queue.put(result)

        with self.data_lock:
            self.data['df'] = df
            self.data['col_labels'] = col_labels
            self.data['subsets'] = subsets
            self.data['subset_counter'] = subset_counter
            self.data['path'] = self.path
            self.data['math_vars'] = computed_math_vars
