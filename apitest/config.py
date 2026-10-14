import os

BASE_URL = os.environ.get("APITEST_BASE_URL", "http://127.0.0.1:3000")

_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_DB_DEFAULT = os.path.join(_PROJECT_ROOT, "backend", "data", "campusclaw.db")
DB_PATH = os.environ.get("APITEST_DB_PATH", _DB_DEFAULT)

ADMIN_SCHOOL = os.environ.get("APITEST_ADMIN_SCHOOL", "admin")
ADMIN_STUDENT_ID = os.environ.get("APITEST_ADMIN_STUDENT_ID", "admin")
ADMIN_PASSWORD = os.environ.get("APITEST_ADMIN_PASSWORD", "admin123")

TEST_SCHOOL = os.environ.get("APITEST_TEST_SCHOOL", "TestUni")