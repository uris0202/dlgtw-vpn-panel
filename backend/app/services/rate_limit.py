from collections import deque
from threading import Lock
import time


class RateLimiter:

    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window_seconds = window_seconds
        self.attempts = {}
        self.lock = Lock()

    def allow(self, key: str):
        now = time.monotonic()
        cutoff = now - self.window_seconds

        with self.lock:
            if len(self.attempts) > 5000:
                stale_keys = [
                    attempt_key
                    for attempt_key, attempt_entries in self.attempts.items()
                    if not attempt_entries or attempt_entries[-1] <= cutoff
                ]

                for stale_key in stale_keys:
                    self.attempts.pop(stale_key, None)

            entries = self.attempts.setdefault(key, deque())

            while entries and entries[0] <= cutoff:
                entries.popleft()

            if len(entries) >= self.limit:
                return False

            entries.append(now)

            return True

    def reset(self, key: str):
        with self.lock:
            self.attempts.pop(key, None)
