import anndata
import pandas as pd
import numpy as np
# import re
import scipy

class AnndataShim:
    def __init__(self, adata):
        self.adata = adata

        self.col_labels = {}
        self.col_labels_with_numeric = {}

        # Process 'obs' DataFrame
        self.df_obs = adata.obs.reset_index()
        if 'obs_names' not in self.df_obs.columns and 'names' not in self.df_obs.columns:
            self.df_obs = self.df_obs.rename(columns={'index': 'names'})
        self.df_obs.columns = [f'obs_{col}' for col in self.df_obs.columns]

        numeric_cols = self.df_obs.select_dtypes(include=np.number).columns.tolist()
        non_numeric = np.setdiff1d(list(self.df_obs.columns), numeric_cols).tolist()

        numeric_cols = sorted(numeric_cols, key=str.lower)
        non_numeric = sorted(non_numeric, key=str.lower)

        self.col_labels_with_numeric['obs'] = [(c, True) for c in numeric_cols] + [(c, False) for c in non_numeric]
        self.col_labels['obs'] = numeric_cols + non_numeric

        # Process 'obsm' DataFrames
        self.obsm_dfs = []
        for m in adata.obsm:
            this_df = pd.DataFrame(adata.obsm[m], index=adata.obs.index)
            this_df.columns = [f'obsm_{m}_{col}' for col in this_df.columns]
            self.obsm_dfs.append(this_df)

            numeric_cols = this_df.select_dtypes(include=np.number).columns.tolist()
            non_numeric = np.setdiff1d(list(this_df.columns), numeric_cols).tolist()

            numeric_cols = sorted(numeric_cols, key=str.lower)
            non_numeric = sorted(non_numeric, key=str.lower)

            self.col_labels_with_numeric[f'obsm_{m}'] = [(c, True) for c in numeric_cols] + [(c, False) for c in non_numeric]
            self.col_labels[f'obsm_{m}'] = numeric_cols + non_numeric

        # Add 'var_names' to column labels
        x_cols_sorted = sorted(list(adata.var_names), key=str.lower)
        self.col_labels_with_numeric[''] = [(c, True) for c in x_cols_sorted]
        self.col_labels[''] = x_cols_sorted

        # Aggregate all columns
        self.columns = []
        for col_prefix in self.col_labels:
            self.columns += self.col_labels[col_prefix]
        self.columns = pd.Index(self.columns)

    def __getitem__(self, key):
        if isinstance(key, tuple):
            idx, colname = key
            return self._get_col_data(idx, colname)
        elif isinstance(key, list):
            # Handling a list of column names directly
            return pd.DataFrame({cn: self._get_col_data(slice(None), cn).squeeze() for cn in key})
        elif hasattr(key, '__iter__') and not isinstance(key, str):
            return ColumnAccessor(self, key)
        else:
            return self._get_col_data(slice(None), key)

    def _get_col_data(self, idx, colname):
        # Handling 'obs' DataFrame columns
        if colname in self.col_labels['obs']:
            return self.df_obs.reset_index().loc[idx, colname]
        
        if any(colname in labels for labels in self.col_labels.values()):
            for df2 in self.obsm_dfs:
                if colname in df2.columns:
                    return df2.reset_index().loc[idx, colname]
        # Handling '.X' DataFrame columns
        if colname in self.col_labels['']:
            val = self.adata[idx, self.adata.var_names.get_loc(colname)].X
            if isinstance(val, scipy.sparse.csc_matrix):
                arr = val.toarray().squeeze()
                # single-element arrays won't have the right dtype unless we force it.
                return pd.Series(arr, name=colname, dtype=arr.dtype)
            return pd.Series(self.adata[idx, self.adata.var_names.get_loc(colname)].X.squeeze(), name=colname)
        else:
            raise KeyError(f"Column name {colname} not found in AnnData object")
    
    def __setitem__(self, key, value):
        # Check if key is a valid column name and value has a compatible length
        if not isinstance(key, str):
            raise KeyError("Only string keys are supported for new columns.")

        if len(value) != len(self.adata.obs):
            raise ValueError("Length of the new column does not match the number of rows in the data.")

        # Prefix the new column name to avoid conflicts
        new_col_name = f'obs_{key}'

        # Add the new column to the 'obs' DataFrame
        self.df_obs[new_col_name] = value

        # Update the col_labels and columns attributes
        self.col_labels_with_numeric['obs'].append((new_col_name, True))
        self.col_labels['obs'].append(new_col_name)
        self.columns = self.columns.append(pd.Index([new_col_name]))

    
    def __len__(self):
        # Return the number of rows in the AnnData object
        return self.adata.n_obs

    def select_dtypes(self, include=None):
        """
        Select columns based on data types from various DataFrames in the AnndataShim object.

        Args:
            include (list, optional): List of data types to include.

        Returns:
            list: List of column names that match the specified data types.
        """
        if not isinstance(include, list):
            include = [include]

        filtered_cols = []

        # Applying select_dtypes to df_obs
        filtered_cols += [col for col in self.df_obs.select_dtypes(include=include).columns]

        # Applying select_dtypes to each DataFrame in obsm_dfs
        for df in self.obsm_dfs:
            filtered_cols += [col for col in df.select_dtypes(include=include).columns]

        # Adding columns from .var that match the data type
        # Note: This assumes .var columns are of uniform data type (typically numeric)
        if include is not None and np.number in include:
            filtered_cols += [f"var_{col}" for col in self.adata.var.columns]
            filtered_cols += self.col_labels['']

        return filtered_cols

class ColumnAccessor:
    def __init__(self, anndata_shim, idx):
        self.anndata_shim = anndata_shim
        self.idx = idx

    def __getitem__(self, colname):
        if isinstance(colname, list):
            # Handle a list of column names
            # Error if you don't provide an index and there is only one item in the list
            idx2 = pd.Series(self.idx)
            return pd.DataFrame({cn: self.anndata_shim._get_col_data(self.idx, cn).squeeze() for cn in colname}, index=idx2[idx2==True].index)
        else:
            # Handle a single column name
            return pd.Series(self.anndata_shim._get_col_data(self.idx, colname), name=colname)

    def __len__(self):
        return np.sum(self.idx)

