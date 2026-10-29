"""
One lock for heavy engine initialization. `transformers` (used by both Kokoro and XTTS)
resolves attributes through a lazy module that is not thread-safe: two threads importing it
at the same time can fail with "cannot import name ...". Every model load and Kokoro
language-pipeline construction goes through this lock.
"""

import threading

INIT_LOCK = threading.RLock()
