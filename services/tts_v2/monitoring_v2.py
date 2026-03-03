"""
Monitoring v2 adapter for server_v2.
Delegates to existing monitoring.py where applicable.
"""

from .monitoring import get_metrics


def get_monitor():
    """Return a monitor compatible with server_v2. Uses shared metrics from monitoring.py."""
    return get_metrics()
