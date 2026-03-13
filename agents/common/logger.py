"""
Logging structuré pour les agents Local Agents.

Usage:
    from agents.common.logger import get_logger, log_request, log_response
    
    logger = get_logger("discord")
    logger.info("Bot démarré", model="llama3.2:3b")
    
    # Avec contexte de requête
    with log_request(request_id="abc-123", agent_id="coder") as ctx:
        ctx.info("Traitement en cours")
        # ... traitement ...
        ctx.info("Terminé", duration_ms=1234)
"""

import json
import sys
import time
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from contextlib import contextmanager
from functools import wraps
import os


class StructuredLogger:
    """Logger JSON structuré pour traçabilité bout en bout."""
    
    LEVELS = {
        "debug": 10,
        "info": 20,
        "warn": 30,
        "error": 40,
    }
    
    def __init__(
        self,
        name: str,
        level: str = "info",
        output: str = "stderr",
        extra_fields: Optional[Dict[str, Any]] = None
    ):
        self.name = name
        self.level = self.LEVELS.get(level.lower(), 20)
        self.output = sys.stderr if output == "stderr" else open(output, "a")
        self.extra_fields = extra_fields or {}
        
        # Context fields (set per-request)
        self._context: Dict[str, Any] = {}
    
    def _should_log(self, level: str) -> bool:
        return self.LEVELS.get(level, 20) >= self.level
    
    def _format_log(self, level: str, message: str, **kwargs) -> str:
        """Formate un log en JSON structuré."""
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": level.upper(),
            "logger": self.name,
            "message": message,
            **self.extra_fields,
            **self._context,
            **kwargs
        }
        
        # Nettoyer les valeurs None
        log_entry = {k: v for k, v in log_entry.items() if v is not None}
        
        return json.dumps(log_entry, ensure_ascii=False, default=str)
    
    def _write(self, level: str, message: str, **kwargs):
        if self._should_log(level):
            log_line = self._format_log(level, message, **kwargs)
            print(log_line, file=self.output, flush=True)
    
    def debug(self, message: str, **kwargs):
        self._write("debug", message, **kwargs)
    
    def info(self, message: str, **kwargs):
        self._write("info", message, **kwargs)
    
    def warn(self, message: str, **kwargs):
        self._write("warn", message, **kwargs)
    
    def error(self, message: str, **kwargs):
        self._write("error", message, **kwargs)
    
    def set_context(self, **kwargs):
        """Ajoute des champs au contexte actuel."""
        self._context.update(kwargs)
    
    def clear_context(self):
        """Efface le contexte."""
        self._context = {}
    
    @contextmanager
    def context(self, **kwargs):
        """Context manager pour ajouter temporairement des champs."""
        old_context = self._context.copy()
        self._context.update(kwargs)
        try:
            yield self
        finally:
            self._context = old_context


class RequestLogger:
    """Logger avec contexte de requête pour traçabilité."""
    
    def __init__(
        self,
        logger: StructuredLogger,
        request_id: str,
        agent_id: str,
        **extra
    ):
        self.logger = logger
        self.request_id = request_id
        self.agent_id = agent_id
        self.extra = extra
        self.start_time = time.time()
    
    def _with_context(self, kwargs: dict) -> dict:
        return {
            "request_id": self.request_id,
            "agent_id": self.agent_id,
            **self.extra,
            **kwargs
        }
    
    def debug(self, message: str, **kwargs):
        self.logger.debug(message, **self._with_context(kwargs))
    
    def info(self, message: str, **kwargs):
        self.logger.info(message, **self._with_context(kwargs))
    
    def warn(self, message: str, **kwargs):
        self.logger.warn(message, **self._with_context(kwargs))
    
    def error(self, message: str, **kwargs):
        self.logger.error(message, **self._with_context(kwargs))
    
    def elapsed_ms(self) -> int:
        """Retourne le temps écoulé en millisecondes."""
        return int((time.time() - self.start_time) * 1000)
    
    def complete(self, status: str = "success", **kwargs):
        """Log de fin de requête avec durée."""
        self.info(
            "Request completed",
            status=status,
            duration_ms=self.elapsed_ms(),
            **kwargs
        )


# Global loggers registry
_loggers: Dict[str, StructuredLogger] = {}


def get_logger(
    name: str,
    level: Optional[str] = None,
    output: Optional[str] = None
) -> StructuredLogger:
    """
    Récupère ou crée un logger structuré.
    
    Args:
        name: Nom du logger (ex: "discord", "coder")
        level: Niveau de log (debug, info, warn, error)
        output: Sortie ("stderr" ou chemin de fichier)
    
    Returns:
        StructuredLogger configuré
    """
    if name not in _loggers:
        _loggers[name] = StructuredLogger(
            name=name,
            level=level or os.getenv("LOG_LEVEL", "info"),
            output=output or "stderr"
        )
    return _loggers[name]


@contextmanager
def log_request(
    request_id: Optional[str] = None,
    agent_id: str = "unknown",
    logger_name: Optional[str] = None,
    **extra
):
    """
    Context manager pour logger une requête avec traçabilité.
    
    Usage:
        with log_request(request_id="abc", agent_id="coder") as log:
            log.info("Processing")
            # ... work ...
            log.complete("success")
    
    Args:
        request_id: ID de la requête (généré si non fourni)
        agent_id: ID de l'agent
        logger_name: Nom du logger à utiliser
        **extra: Champs supplémentaires
    
    Yields:
        RequestLogger avec contexte
    """
    if request_id is None:
        request_id = str(uuid.uuid4())
    
    logger = get_logger(logger_name or agent_id)
    req_logger = RequestLogger(logger, request_id, agent_id, **extra)
    
    req_logger.info("Request started")
    
    try:
        yield req_logger
    except Exception as e:
        req_logger.error(
            "Request failed",
            error=str(e),
            error_type=type(e).__name__,
            duration_ms=req_logger.elapsed_ms()
        )
        raise
    finally:
        pass  # complete() should be called explicitly


def log_function(logger_name: Optional[str] = None):
    """
    Décorateur pour logger automatiquement les appels de fonction.
    
    Usage:
        @log_function("coder")
        def process_code(request):
            # ...
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            logger = get_logger(logger_name or func.__module__)
            request_id = kwargs.get('request_id') or str(uuid.uuid4())
            
            logger.info(
                f"Function {func.__name__} called",
                request_id=request_id,
                function=func.__name__
            )
            
            start = time.time()
            try:
                result = func(*args, **kwargs)
                duration = int((time.time() - start) * 1000)
                logger.info(
                    f"Function {func.__name__} completed",
                    request_id=request_id,
                    function=func.__name__,
                    duration_ms=duration,
                    status="success"
                )
                return result
            except Exception as e:
                duration = int((time.time() - start) * 1000)
                logger.error(
                    f"Function {func.__name__} failed",
                    request_id=request_id,
                    function=func.__name__,
                    duration_ms=duration,
                    status="error",
                    error=str(e),
                    error_type=type(e).__name__
                )
                raise
        
        return wrapper
    return decorator


# Exemple d'utilisation
if __name__ == "__main__":
    # Test du logger
    logger = get_logger("test", level="debug")
    
    logger.info("Application démarrée", version="1.0.0")
    
    with log_request(agent_id="coder", user_id="123") as log:
        log.info("Traitement du code")
        log.debug("Détail", tokens=150)
        log.complete("success", tokens_used=150)
    
    @log_function("test")
    def example_function(x: int) -> int:
        return x * 2
    
    example_function(21)
