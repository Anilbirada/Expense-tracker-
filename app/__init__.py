import os
import sys

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")
BACKEND_APP_DIR = os.path.join(BACKEND_DIR, "app")

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

if BACKEND_APP_DIR not in __path__:
    __path__.insert(0, BACKEND_APP_DIR)
