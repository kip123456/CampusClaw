import argparse
import os
import sys
from datetime import datetime

import pytest


def main() -> int:
    parser = argparse.ArgumentParser(description="Run all apitest cases")
    parser.add_argument("--filter", "-k", default=None, help="pytest -k expression")
    parser.add_argument("--report", default=None, help="HTML report path (default: reports/report_<timestamp>.html)")
    parser.add_argument("--base-url", default=None, help="Override APITEST_BASE_URL")
    parser.add_argument("--db-path", default=None, help="Override APITEST_DB_PATH")
    parser.add_argument("--no-html", action="store_true", help="Skip HTML report generation")
    args = parser.parse_args()

    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    apitest_dir = os.path.join(project_root, "apitest")
    cases_dir = os.path.join(apitest_dir, "cases")
    reports_dir = os.path.join(apitest_dir, "reports")

    if args.base_url:
        os.environ["APITEST_BASE_URL"] = args.base_url
    if args.db_path:
        os.environ["APITEST_DB_PATH"] = args.db_path

    os.makedirs(reports_dir, exist_ok=True)

    pytest_args = ["-v", cases_dir]
    if not args.no_html:
        report_path = args.report or os.path.join(
            reports_dir, f"report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
        )
        pytest_args.extend(["--html", report_path, "--self-contained-html"])
    if args.filter:
        pytest_args.extend(["-k", args.filter])

    return pytest.main(pytest_args)


if __name__ == "__main__":
    sys.exit(main())