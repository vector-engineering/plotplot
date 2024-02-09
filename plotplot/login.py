import flask
from flask import Flask, redirect, request, Blueprint, g
from flask_login import (
    LoginManager,
    current_user,
    login_required,
    login_user,
    logout_user,
)
from oauthlib.oauth2 import WebApplicationClient
import requests
from urllib.parse import urlparse

from plotplot.db import init_db_command, insert_db, query_db
from . import api_utils
from plotplot.user import User
import os
import json
from . import plotplot_config

app_login = Blueprint('login', __name__)

# Configuration
GOOGLE_CLIENT_ID = plotplot_config.get_plotplot_config()['google login']['google_auth_client_id']
GOOGLE_CLIENT_SECRET = plotplot_config.get_plotplot_config()['google login']['google_auth_client_secret']

GOOGLE_DISCOVERY_URL = (
    "https://accounts.google.com/.well-known/openid-configuration")

# OAuth 2 client setup
client = WebApplicationClient(GOOGLE_CLIENT_ID)


@app_login.route("/api/config")
def send_config_and_maybe_login_generic_user():
    requires_login = plotplot_config.get_boolean_with_default('google login', 'google_auth_enabled', False)

    config = {
        'requires_login': requires_login,
        'google_drive_enabled': plotplot_config.get_boolean_with_default('google drive', 'google_drive_connection_enabled', False),
        'juypter_export_enabled': plotplot_config.get_boolean_with_default('jupyter notebook export', 'jupyter_notebook_export_enabled', False),
    }

    if not requires_login:
        # Immediately log the user into the generic user account

        unique_id = 0
        users_name = 'User'
        users_email = 'user@plotplot.org'
        picture = ''

        user = User(id_=unique_id,
                    name=users_name,
                    email=users_email,
                    profile_pic=picture)

        # Doesn't exist? Add it to the database.
        if not User.get(unique_id):
            User.create(unique_id, users_name, users_email, picture)

        # Begin user session by logging the user in
        login_user(user, remember=True)

    return json.dumps({'config': config})

@app_login.route("/api/username")
@login_required
def username():
    if current_user.is_authenticated:
        return json.dumps({
            'name': current_user.name,
            'email': current_user.email,
            'profile_pic': current_user.profile_pic
        })
    else:
        return json.dumps({'error': 'User not logged in.'})


def get_google_provider_cfg():
    return requests.get(GOOGLE_DISCOVERY_URL).json()

def get_hostname():
    o = urlparse(request.base_url)
    return o.hostname


def get_login_redirect_uri(path_from_login):
    # If we are behind a reverse proxy, the request.base_url will
    # be wrong.

    # Find app root
    app_root = flask.current_app.config['APPLICATION_ROOT']
    hostname = request.base_url[7:request.base_url.find(
        app_root.replace('/', '')
    )]  # we're missing /'s here in baseurl, so normal parsing doesn't work.

    redirect_uri = 'https://' + hostname + app_root + '/login' + path_from_login

    return redirect_uri


def redirect_to_home(data_id=None, filename=None):
    session_url = ''
    if data_id is not None:
        session_url = '/session/' + data_id
    elif filename is not None:
        session_url = '/load_file?filename=' + filename

    # This is a hack to fix the problem where the backend doesn't know the
    # frontend's port in dev mode :(
    if '127.0.0.1' in get_hostname(
    ) or 'localhost' in get_hostname(
    ) or '0.0.0.0' in get_hostname():
        return redirect('https://127.0.0.1:3000' +
                        flask.current_app.config['APPLICATION_ROOT'] +
                        session_url)
    return redirect('https://' + get_hostname() +
                    flask.current_app.config['APPLICATION_ROOT'] + session_url)


@app_login.route("/login")
def login():
    # Find out what URL to hit for Google login
    google_provider_cfg = get_google_provider_cfg()
    authorization_endpoint = google_provider_cfg["authorization_endpoint"]
    data_id = request.args.get('data_id', default='', type=str)
    filename = request.args.get('filename', default='', type=str)

    # Use library to construct the request for Google login and provide
    # scopes that let you retrieve user's profile from Google

    redirect_uri = request.base_url + "/callback"

    redirect_uri = redirect_uri.replace('http://', 'https://') # Fixes when you are behind a reverse proxy like nginx

    request_uri = client.prepare_request_uri(
        authorization_endpoint,
        redirect_uri=redirect_uri,
        state=json.dumps({
            'data_id': data_id,
            'filename': filename
        }),
        scope=["openid", "email", "profile"],
    )
    
    return redirect(request_uri)


@app_login.route("/login/callback")
def callback():
    # Get authorization code Google sent back to you
    code = request.args.get("code")

    # Find out what URL to hit to get tokens that allow you to ask for
    # things on behalf of a user
    google_provider_cfg = get_google_provider_cfg()
    token_endpoint = google_provider_cfg["token_endpoint"]

    authorization_response = request.url
    authorization_response = authorization_response.replace('http://', 'https://') # Fixes when you are behind a reverse proxy like nginx

    redirect_url = request.base_url
    redirect_url = redirect_url.replace('http://', 'https://') # Fixes when you are behind a reverse proxy like nginx

    statestr = request.args.get('state', default='', type=str)
    state = json.loads(statestr)
    if state is not None and 'data_id' in state and len(state['data_id']) > 0:
        data_id = state['data_id']
    else:
        data_id = None

    if state is not None and 'filename' in state and len(
            state['filename']) > 0:
        filename = state['filename']
    else:
        filename = None

    # Prepare and send a request to get tokens! Yay tokens!
    token_url, headers, body = client.prepare_token_request(
        token_endpoint,
        authorization_response=authorization_response,
        redirect_url=redirect_url,
        code=code)
    token_response = requests.post(
        token_url,
        headers=headers,
        data=body,
        auth=(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET),
    )

    # Parse the tokens!
    client.parse_request_body_response(json.dumps(token_response.json()))

    # Now that you have tokens (yay) let's find and hit the URL
    # from Google that gives you the user's profile information,
    # including their Google profile image and email
    userinfo_endpoint = google_provider_cfg["userinfo_endpoint"]
    uri, headers, body = client.add_token(userinfo_endpoint)
    userinfo_response = requests.get(uri, headers=headers, data=body)

    # You want to make sure their email is verified.
    # The user authenticated with Google, authorized your
    # app, and now you've verified their email through Google!
    if userinfo_response.json().get("email_verified"):
        unique_id = userinfo_response.json()["sub"]
        users_email = userinfo_response.json()["email"]
        picture = userinfo_response.json()["picture"]
        users_name = userinfo_response.json()["given_name"]
    else:
        return "User email not available or not verified by Google.", 400

    # Ensure the user is on our whitelist.
    whitelist_enabled = plotplot_config.get_plotplot_config().getboolean('google login user whitelist', 'enable_whitelist')
    if whitelist_enabled:
        if users_email not in plotplot_config.get_user_whitelist():
            return 'User not authorized.  Contact your Plotplot administrator ask for your username, ' + users_email + ' to be added to the authorization list.'

    # Create a user in your db with the information provided
    # by Google
    user = User(id_=unique_id,
                name=users_name,
                email=users_email,
                profile_pic=picture)

    # Doesn't exist? Add it to the database.
    if not User.get(unique_id):
        User.create(unique_id, users_name, users_email, picture)

    # Begin user session by logging the user in
    login_user(user, remember=True)

    # Send user back to homepage
    return redirect_to_home(data_id, filename)


@app_login.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect_to_home()
