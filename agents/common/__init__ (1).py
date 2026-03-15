"""
Module commun pour les agents Local Agents.

Contient:
- logger: Logging structuré JSON
- protocol: Classes pour le protocole d'échange
"""

from .logger import (
    get_logger,
    log_request,
    log_function,
    StructuredLogger,
    RequestLogger,
)

__all__ = [
    "get_logger",
    "log_request", 
    "log_function",
    "StructuredLogger",
    "RequestLogger",
]
