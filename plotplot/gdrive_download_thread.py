import threading
import os


class GdriveDownloadThread(threading.Thread):

    def __init__(self,
                 gdrive,
                 progress_queue,
                 file_info,
                 output_dir,
                 call_when_done,
                 args=(),
                 kwargs=None):
        threading.Thread.__init__(self, args=(), kwargs=None)
        self.progress_queue = progress_queue
        self.gdrive = gdrive
        self.file_info = file_info
        self.output_dir = output_dir
        self.call_when_done = call_when_done

        self.daemon = True

    def run(self):
        self.size = self.file_info['size']

        self.progress_queue.put({
            'progress': 0.0,
            'downloaded_bytes': 0.0,
            'total_bytes': self.size,
            'in_cache': False
        })

        self.gdrive.download_file(
            self.file_info['id'],
            os.path.join(self.output_dir, self.file_info['name']),
            self.progress_callback)

    def progress_callback(self, progress):
        percent = progress[0]
        downloaded = progress[1]

        self.progress_queue.put({
            'progress': percent,
            'downloaded_bytes': downloaded,
            'total_bytes': self.size,
            'in_cache': False
        })

        if percent == 1:
            self.call_when_done()