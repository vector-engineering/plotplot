from apiclient.discovery import build
from oauth2client.service_account import ServiceAccountCredentials

from googleapiclient.http import MediaIoBaseDownload
import os
import shutil
import io
from . import plotplot_config

SCOPES = ['https://www.googleapis.com/auth/drive.readonly']

class PlotplotGdrive():

    def __init__(self):
        creds = ServiceAccountCredentials.from_json_keyfile_name(
            plotplot_config.get_plotplot_config()['google drive']['google_drive_key_json_path'], SCOPES)

        # Build the service object.
        self.service = build('drive', 'v3', credentials=creds)

    def list_files(self):
        # NGS folder
        topFolderId = plotplot_config.get_plotplot_config()['google drive']['google_drive_folder_id']

        items = []
        pageToken = ""
        while pageToken is not None:
            response = self.service.files().list(
                q="'" + topFolderId + "' in parents",
                pageSize=1000,
                pageToken=pageToken,
                fields="nextPageToken, files(id, name, size, mimeType)"
            ).execute()
            items.extend(response.get('files', []))
            pageToken = response.get('nextPageToken')

        # sort by name
        items.sort(key=lambda x: x['name'])
        return items

    def get_file_info(self, file_id):
        return self.service.files().get(fileId=file_id,
                                        fields="id, name, size").execute()

    def download_file(self, file_id, output_path, progress_callback):
        request = self.service.files().get_media(fileId=file_id)

        fh = io.BytesIO()
        chunk_size = 1024 * 1024 * 10
        downloader = MediaIoBaseDownload(fh, request, chunksize=chunk_size)
        done = False
        downloaded_bytes = 0
        while done is False:
            status, done = downloader.next_chunk()
            downloaded_bytes += chunk_size
            progress_callback(
                [min(0.999, status.progress()), downloaded_bytes])

        # The file has been downloaded into RAM, now save it in a file
        fh.seek(0)
        with open(output_path, 'wb') as f:
            shutil.copyfileobj(fh, f, length=131072)
        progress_callback([1, downloaded_bytes])
