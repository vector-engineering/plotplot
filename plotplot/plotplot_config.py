import configparser
import platformdirs
import os

DEFAULT_CONFIG_FILE = """
################################################
[plotplot general]
################################################

# Where should data be stored when the user uploads it?
# Defaults to the "user_cache_dir" for your OS.
#   See: https://github.com/platformdirs/platformdirs for more information.
#UPLOAD_DIR=/tmp/plotplot

# When hosted at a domain or when using a reverse proxy live nginx, you can set
# a prefix for plotplot
# Defaults to /plotplot
URL_PREFIX=/plotplot

# Database file location (for saving sessions, etc, as a sqlite3 database)
# DATABASE_FILE=/home/user/plotplot.db

# External tools can directly link to a file like so:
#   https://yourserver.com/plot/load_file?filename=dir1/dir2/file.csv
#
# That will load a file at:
#   EXTERNAL_LOAD_DIR/dir1/dir2/file.csv
# so if EXTERNAL_LOAD_DIR was /home/user/myfiles, you'd load
#   /home/user/myfiles/dir1/dir2/file.csv
# This is particularly useful when deploying on a server with docker, so you can mount your
# files at, e.g. "/data" and set this to /data
#
# Comment this line to disable loading files via load_file?filename=
# EXTERNAL_LOAD_DIR=/tmp


################################################
[jupyter notebook export]
################################################
# Plotplot can have a button that immediately exports a notebook to Jupyter when the Jupyter server is running or has access to the server.
JUPYTER_NOTEBOOK_EXPORT_ENABLED = false

# When writing a file for importing into Jupyter notebook, where should we write that file?
JUPYTER_NOTEBOOK_EXPORT_PATH=/tmp



################################################
[google drive]
################################################
# Automatically show and download files from a Google Drive folder
# Requires some setup on Google Cloud.
GOOGLE_DRIVE_CONNECTION_ENABLED = false

# JSON file provided by Google to authenticate Plotplot against your Google Drive
GOOGLE_DRIVE_KEY_JSON_PATH=

# Top level folder ID for the folder you want to connect in Google Drive to Plotplot. When you navigate to that folder in a browser, this ID is in the URL.
GOOGLE_DRIVE_FOLDER_ID=



################################################
[google login]
################################################
# Enable authentication using Google accounts.
# Requires some setup on Google Cloud.
GOOGLE_AUTH_ENABLED = false

GOOGLE_AUTH_CLIENT_ID=

GOOGLE_AUTH_CLIENT_SECRET=



################################################
[google login user whitelist]
################################################
# When using google authentication, you can use a whitelist to only allow
# certain users.
#   Note: case insensitive.
# Format is email@domain.com = true
#   e.g. user@plotplot.org = true
ENABLE_WHITELIST = false
"""

loaded_config = None

def load_config_helper(config_file):
    print(f'Reading plotplot configuration: {config_file}')
    config = configparser.ConfigParser()
    config.read(config_file)
    return config

def get_upload_dir():
    config = get_plotplot_config()
    try:
        upload_dir = config['plotplot general']['upload_dir']
    except KeyError:
        # Use the default value
        upload_dir = os.path.join(platformdirs.user_cache_dir('plotplot', 'plotplot'), 'plotplot')

        # Create the directory if needed
        os.makedirs(upload_dir, exist_ok=True)
    return upload_dir

def validate_config(config):
    required_sections = [
        'plotplot general',
        'google drive',
        'google login',
        'google login user whitelist',
    ]
    for s in required_sections:
        if s not in config.sections():
            return f'Required section: [{s}] is not in configuration file.  Add that section.'

    custom_upload_dir = False
    try:
        upload_dir = config['plotplot general']['upload_dir']
        custom_upload_dir = True
    except KeyError:
        # Use the default value
        pass

    if custom_upload_dir:
        if not os.path.exists(upload_dir):
            return f'Error: Configured value for UPLOAD_DIR, "{upload_dir}" does not exist.  Create that directory or change the upload directory in plotplot.ini'

        if not os.path.isdir(upload_dir):
            return f'Error: Configured value for UPLOAD_DIR, "{upload_dir}" is not a directory.  Make that a directory or change the upload directory in plotplot.ini'
    

    whitelist = config.items('google login user whitelist')
    if len(whitelist) > 0:
        try:
            whitelist_enabeled = config.getboolean('google login user whitelist', 'enable_whitelist')
        except configparser.NoOptionError:
            return 'Config error: [google login user whitelist] section has entries but does not include the ENABLE_WHITELIST flag or that flag is not set to "true" or "false".  Add ENABLE_WHITELIST to the section.'
    
    if get_boolean_with_default_helper(config, 'jupyter notebook export', 'jupyter_notebook_export_enabled', False):
        # Jupyter export is enabled, ensure there is an export path and it is valid.
        try:
            export_path = config['jupyter notebook export']['jupyter_notebook_export_path']
        except KeyError:
            return 'Configuration error: in section [jupyter notebook export] the value "JUPYTER_NOTEBOOK_EXPORT_PATH" is missing.'
        if not os.path.exists(export_path):
            return f'Error: Juypter notebook export is enabled but the export path, {export_path} does not exist.'

        if not os.path.isdir(export_path):
            return f'Error: Juypter notebook export is enabled but the export path, {export_path} is not a directory.'

    if get_boolean_with_default_helper(config, 'google drive', 'google_drive_connection_enabled', False):
        try:
            p = config['google drive']['google_drive_key_json_path']
        except KeyError:
            return 'Configuration error: in section [google drive] the value "GOOGLE_DRIVE_KEY_JSON_PATH" is missing.  Add that value or disable Google Drive connection by setting GOOGLE_DRIVE_CONNECTION_ENABLED=false'
        
        try:
            p = config['google drive']['google_drive_folder_id']
        except KeyError:
            return 'Configuration error: in section [google drive] the value "GOOGLE_DRIVE_FOLDER_ID" is missing.  Add that value or disable Google Drive connection by setting GOOGLE_DRIVE_CONNECTION_ENABLED=false'

    if get_boolean_with_default_helper(config, 'google login', 'google_auth_enabled', False):
        try:
            p = config['google login']['google_auth_client_id']
        except KeyError:
            return 'Configuration error: in section [google login] the value "GOOGLE_AUTH_CLIENT_ID" is missing.  Add that value or disable login-with-google by setting GOOGLE_AUTH_ENABLED=false'

        try:
            p = config['google login']['google_auth_client_secret']
        except KeyError:
            return 'Configuration error: in section [google login] the value "GOOGLE_AUTH_CLIENT_SECRET" is missing.  Add that value or disable login-with-google by setting GOOGLE_AUTH_ENABLED=false'

    if get_boolean_with_default_helper(config, 'google login user whitelist', 'enable_whitelist', False) and not get_boolean_with_default_helper(config, 'google login', 'google_auth_enabled', False):
        return 'Configuration error: Cannot enable user whitelist when Google authentication / login is disabled. Either enable Google login under the [google login] section of plotplot.ini or disble the whitelist under the [google login user whitelist] section of plotplot.ini'

    return True

def get_user_whitelist():
    config = get_plotplot_config()
    whitelist = config.items('google login user whitelist')
    vals = []
    for key, value in whitelist:
        if key == 'enable_whitelist':
            continue
        if config.getboolean('google login user whitelist', key):
            vals.append(key)
    return vals

def get_boolean_with_default(section, key, default):
    config = get_plotplot_config()
    return get_boolean_with_default_helper(config, section, key, default)

def get_boolean_with_default_helper(config, section, key, default):
    try:
        return config.getboolean(section, key)
    except configparser.NoOptionError:
        return default

def get_plotplot_config():
    global loaded_config
    if loaded_config is not None:
        return loaded_config

    # Look for the configuration environment variable.
    config_file = os.environ.get("PLOTPLOT_CONFIG_PATH", None)
    if config_file is None:
        config_file = os.path.join(
            platformdirs.user_config_dir('plotplot', 'plotplot'), 'plotplot.ini')

    # Check to see if the config file exists, and write one if it does not.
    if os.path.exists(config_file) and os.path.isfile(config_file):
        # Read the config.
        config = load_config_helper(config_file)
        validation_err = validate_config(config)
        if validation_err is not True:
            raise Exception(validation_err)
        loaded_config = config
        return loaded_config
    elif os.path.exists(config_file) and not os.path.isfile(config_file):
        print(f'ERROR: config file path exists but is not a file, is it a directory?\n\tPath: {config_file}')
    elif not os.path.exists(config_file):
        # Maybe create a config file.
        print(f'Creating default configuration file: {config_file}')
        os.makedirs(os.path.dirname(config_file), exist_ok=True)
        with open(config_file, 'w') as f:
            f.write(DEFAULT_CONFIG_FILE)
        config = load_config_helper(config_file)
        validation_err = validate_config(config)
        if validation_err is not True:
            raise Exception(validation_err)
        loaded_config = config
        return loaded_config
