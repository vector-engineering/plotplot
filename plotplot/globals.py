import multiprocessing as mp

# List of multiprocessing processes mapping from uuid to process.
g_process_lock = mp.Lock()
g_processes = {}
