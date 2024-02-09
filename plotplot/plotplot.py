import webbrowser
from threading import Timer
from waitress import serve
from .backend import app
import argparse
import socket
import sys

def find_available_port(ip, start_port):
    """Find an available port by incrementing start_port until an unused port is found."""
    port = start_port
    while True:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind((ip, port))
                # If bind is successful, port is available
                return port
            except socket.error:
                port += 1  # Increment port if current one is in use

def main():
    default_prefix = '/plotplot'
    # Set up argument parser
    parser = argparse.ArgumentParser(description='Start the plotplot server.')
    parser.add_argument('--ip', '-i', default='127.0.0.1', help='Host for the server (default: 127.0.0.1, if you have problems try 0.0.0.0)')
    parser.add_argument('--port', '-p', type=int, default=7000, help='Port for the server (default: 7000)')
    parser.add_argument('--url_prefix', default=default_prefix, help='URL prefix for the application (default: /plotplot)')

    # Parse arguments
    args = parser.parse_args()

    if args.url_prefix != default_prefix:
        if args.url_prefix[0] != '/':
            print(f'ERROR: url_prefix must start with "/"')
            sys.exit(1)
        print(f'\n------------------------------------\nWARNING: using a non-default url_prefix "{args.url_prefix}"\n\nYou MUST rebuild the frontend with this prefix set in frontend/package.json in the "homepage" field:\n\n\t1. Edit frontend/package.json and set "homepage": "{args.url_prefix}"\n\t2. Run cd frontend && npm install && npm run build\n\nIf you haven\'t done this you\'ll see a blank window when the browser loads.\n------------------------------------\n')

    # Find an available port starting from the user-defined port
    port = find_available_port(args.ip, args.port)

    if port != args.port:
        print(f'Port {args.port} is in use, using port {port} intead.')
    
    url_prefix = args.url_prefix

    Timer(1, lambda: webbrowser.open_new(f'http://{args.ip}:{port}{url_prefix}')).start()  # Open a web browser after the server starts
    print(f'Starting plotplot at: http://{args.ip}:{port}{url_prefix}')
    
    serve(app, host=args.ip, port=port, url_prefix=url_prefix, threads=6)  # Note: The waitress might not accept url_prefix directly

if __name__ == "__main__":
    main()
