"""Exercise real NSIS overlay upgrades on disposable Windows CI runners.

The published v2.1.1 -> v2.1.2 path must reproduce #52 before the candidate
repairs it. No real user databases, connections or credentials are used.
"""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import hashlib
import importlib.machinery
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import urllib.request

from frozen_smoke import _post_json, _wait_health, _wait_port

PRODUCT_VERSION = json.loads(
    (Path(__file__).resolve().parents[2]/'frontend'/'src-tauri'/'tauri.conf.json')
    .read_text(encoding='utf-8'))['version']


def install(installer: Path, destination: Path) -> None:
    """Use the actual updater's /UPDATE overlay, including spaced paths."""
    if '"' in str(installer) + str(destination):
        raise ValueError('Unexpected quote in CI installation paths')
    destination.parent.mkdir(parents=True, exist_ok=True)
    # NSIS /D consumes the remaining command line and must be last/unquoted.
    subprocess.run(f'"{installer}" /S /UPDATE /D={destination}',
                   executable=str(installer), check=True, timeout=300)


def executable(installation: Path) -> Path:
    return installation/'binaries'/'duckquery-api'/'duckquery-api.exe'


def runtime_env(data: Path) -> dict[str, str]:
    return {**os.environ, 'APP_ROOT': str(data), 'CONFIG_DIR': str(data/'config'),
            'DUCKDB_DATA_DIR': str(data/'data'),
            'DUCKDB_DATABASE_PATH': str(data/'data'/'main.db')}


@contextmanager
def backend(installation: Path, data: Path, log: Path):
    """Shut down the test's child before allowing the installer to replace DLLs."""
    with log.open('w', encoding='utf-8') as stderr:
        proc = subprocess.Popen([str(executable(installation))],
                                stdout=subprocess.PIPE, stderr=stderr, text=True,
                                env=runtime_env(data))
        port = None
        try:
            port = _wait_port(proc)
            threading.Thread(target=lambda: list(proc.stdout), daemon=True).start()
            _wait_health(port)
            yield port
        finally:
            if proc.poll() is None:
                try:
                    if port is None:
                        raise OSError('No backend port was received')
                    _post_json(port, '/api/system/shutdown', {})
                    proc.wait(timeout=30)
                except (OSError, subprocess.TimeoutExpired):
                    proc.kill()
                    proc.wait(timeout=10)
                    raise RuntimeError('Test backend failed to shut down cleanly')


def get(port: int, path: str):
    with urllib.request.urlopen(f'http://127.0.0.1:{port}{path}', timeout=15) as response:
        result = json.load(response)
    assert result.get('success') is True, path
    return result['data']


def execute(port: int, sql: str):
    status, result = _post_json(port, '/api/duckdb/federated-query',
                               {'sql': sql, 'attach_databases': [], 'is_preview': True})
    assert status == 200 and result.get('success') is True, result
    return result['data']


def seed(port: int, data: Path) -> str:
    execute(port, "CREATE TABLE upgrade_canary AS SELECT 42 AS id, 'keep' AS note")
    status, result = _post_json(port, '/api/datasources/databases?test_connection=false', {
        'id': 'upgrade-canary', 'name': 'Upgrade canary', 'type': 'mysql',
        'params': {'host': '127.0.0.1', 'port': 9, 'user': 'fixture',
                   'password': 'synthetic-upgrade-fixture', 'database': 'fixture'}})
    assert status == 200 and result.get('success') is True, result
    (data/'config'/'upgrade.keep').write_text('preserve configuration', encoding='utf-8')
    return hashlib.sha256((data/'config'/'secret.key').read_bytes()).hexdigest()


def assert_native(installation: Path) -> None:
    """Load the installed module in native CPython, not just inspect filenames."""
    internal = installation/'binaries'/'duckquery-api'/'_internal'
    code = ("import sys,json;sys.path.insert(0,sys.argv[1]);import _duckdb;"
            "print(json.dumps({'file':_duckdb.__file__,'version':_duckdb.__version__,"
            "'appender':hasattr(_duckdb,'Appender')}))")
    info = json.loads(subprocess.check_output(
        [sys.executable, '-I', '-c', code, str(internal)], text=True))
    assert Path(info['file']) == internal/('_duckdb'+importlib.machinery.EXTENSION_SUFFIXES[0]), info
    assert info['version'].lstrip('v') == '2.0.0' and info['appender'], info


def run_case(args, root: Path, *, broken_baseline: bool) -> dict:
    name = 'broken-212-repair' if broken_baseline else 'direct-211-upgrade'
    installation = root/(name+' install with spaces')
    data = root/(name+' user data')
    install(args.old, installation)
    with backend(installation, data, root/(name+'-old.log')) as port:
        key_hash = seed(port, data)
    marker = installation/'binaries'/'duckquery-api'/'user-owned.keep'
    marker.write_text('do not delete unrelated files', encoding='utf-8')
    if broken_baseline:
        install(args.broken, installation)
        proc = subprocess.run([str(executable(installation))], capture_output=True,
                              text=True, env=runtime_env(data), timeout=60)
        assert proc.returncode != 0 and 'ImportError' in proc.stderr and 'Appender' in proc.stderr, proc.stderr
        (root/(name+'-expected-failure.log')).write_text(proc.stderr, encoding='utf-8')
        print('PASS reproduced published v2.1.2 overlay ImportError', flush=True)
    install(args.candidate, installation)
    assert_native(installation)
    assert marker.read_text(encoding='utf-8') == 'do not delete unrelated files'
    assert (data/'config'/'upgrade.keep').read_text(encoding='utf-8') == 'preserve configuration'
    assert hashlib.sha256((data/'config'/'secret.key').read_bytes()).hexdigest() == key_hash
    with backend(installation, data, root/(name+'-new.log')) as port:
        capability = get(port, '/api/capabilities')
        assert capability['product_version'] == PRODUCT_VERSION
        assert capability['engine']['version'] == 'v2.0.0'
        assert execute(port, 'SELECT * FROM upgrade_canary')['data'] == [{'id': 42, 'note': 'keep'}]
        connections = get(port, '/api/datasources/databases/list')
        entries = connections.get('items', []) if isinstance(connections, dict) else connections
        assert any(item.get('id') in {'upgrade-canary', 'db_upgrade-canary'} for item in entries), connections
    print(f'PASS {name}: native module, health, table, connection, key and markers', flush=True)
    return {'scenario': name, 'passed': True,
            'native_module': '_duckdb'+importlib.machinery.EXTENSION_SUFFIXES[0],
            'version': PRODUCT_VERSION, 'preserved': ['table', 'connection', 'key', 'configuration', 'unrelated program file']}


def main() -> None:
    parser = argparse.ArgumentParser()
    for name in ['old', 'broken', 'candidate', 'output']:
        parser.add_argument('--'+name, type=Path, required=name in {'candidate', 'output'})
    args = parser.parse_args()
    if sys.platform != 'win32' or os.getenv('GITHUB_ACTIONS') != 'true':
        raise SystemExit('Run real Windows installer testing only on disposable GitHub Windows runners')
    root = Path(tempfile.mkdtemp(prefix='duckquery-upgrade-', dir=os.environ['RUNNER_TEMP']))
    for name, version in [('old', '2.1.1'), ('broken', '2.1.2')]:
        if getattr(args, name) is None:
            folder = root/('published-'+version)
            folder.mkdir()
            filename = f'DuckQuery_{version}_x64-setup.exe'
            subprocess.run(['gh', 'release', 'download', 'v'+version, '--repo',
                            'Chenkeliang/duckdb-query', '--pattern', filename,
                            '--dir', str(folder)], check=True, timeout=300)
            setattr(args, name, folder/filename)
    args.old = args.old.resolve(); args.broken = args.broken.resolve(); args.candidate = args.candidate.resolve()
    for installer in [args.old, args.broken, args.candidate]:
        assert installer.is_file(), installer
    results = [run_case(args, root, broken_baseline=value) for value in [False, True]]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({'passed': True, 'results': results, 'logs': str(root)}, indent=2), encoding='utf-8')
    print('Windows real-installer upgrade regression: ALL PASS', flush=True)


if __name__ == '__main__':
    main()
