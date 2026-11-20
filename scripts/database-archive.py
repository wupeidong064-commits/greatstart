#!/usr/bin/env python3
"""PostgreSQL archive operations. Never source an env file or print credentials."""
import datetime
import gzip
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from urllib.parse import parse_qsl, unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


def connection_env():
    env = os.environ.copy()
    values = {}
    env_file = Path(env.get('BACKEND_ENV_FILE', str(ROOT / 'backend/.env')))
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line.startswith('export '):
                line = line[7:].lstrip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            values[key.strip()] = value
    # A direct connection is required for PostgreSQL backup/migration tools.
    url = env.get('DATABASE_DIRECT_URL') or env.get('DATABASE_URL') or values.get('DATABASE_DIRECT_URL') or values.get('DATABASE_URL')
    if not url:
        raise ValueError('DATABASE_DIRECT_URL / DATABASE_URL is required')
    parsed = urlsplit(url)
    if parsed.scheme not in ('postgres', 'postgresql') or not parsed.hostname or not parsed.path.strip('/'):
        raise ValueError('A valid PostgreSQL connection URL is required')
    for key, value in {'PGHOST': parsed.hostname, 'PGPORT': str(parsed.port or 5432),
                       'PGUSER': unquote(parsed.username or ''), 'PGPASSWORD': unquote(parsed.password or ''),
                       'PGDATABASE': unquote(parsed.path[1:])}.items():
        env[key] = value
    # Prisma's schema/pgbouncer/connection_limit are not libpq options.
    allowed = {'sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'connect_timeout', 'application_name'}
    for key, value in parse_qsl(parsed.query):
        if key in allowed:
            env['PG' + key.upper().replace('_', '')] = value
    env.setdefault('PGCONNECT_TIMEOUT', '15')
    return env


def run(args, env):
    # Tool errors may contain endpoint names but passwords never enter argv.
    subprocess.run(args, env=env, check=True)


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ('backup', 'restore'):
        raise ValueError('Usage: database-archive.py backup | restore <archive>')
    env = connection_env()
    os.umask(0o077)
    if sys.argv[1] == 'backup':
        directory = Path(os.environ.get('BACKUP_DIR', str(ROOT / 'backups'))).resolve()
        directory.mkdir(parents=True, exist_ok=True)
        target = directory / ('buzzer_backup_' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d_%H%M%S_%f') + '.dump')
        fd, temporary = tempfile.mkstemp(prefix='.backup-', dir=directory)
        os.close(fd)
        try:
            run(['pg_dump', '--format=custom', '--no-owner', '--no-acl', '--file', temporary], env)
            if not Path(temporary).stat().st_size:
                raise ValueError('Backup was empty')
            run(['pg_restore', '--list', temporary], dict(env, PGOPTIONS=''))
            os.replace(temporary, target)
        finally:
            Path(temporary).unlink(missing_ok=True)
        retention = int(os.environ.get('RETENTION_DAYS', '30'))
        if retention < 1:
            raise ValueError('RETENTION_DAYS must be positive; backup retained')
        cutoff = datetime.datetime.now().timestamp() - retention * 86400
        for pattern in ('buzzer_backup_*.dump', 'buzzer_backup_*.sql.gz'):
            for old in directory.glob(pattern):
                if old.is_file() and old.stat().st_mtime < cutoff:
                    old.unlink()
        print('Backup complete:', target)
        return
    if len(sys.argv) != 3 or not Path(sys.argv[2]).is_file():
        raise ValueError('Usage: restore-database.sh <existing .dump/.sql/.sql.gz archive>')
    archive = Path(sys.argv[2]).resolve()
    print('Target:', env['PGHOST'], env['PGPORT'], env['PGDATABASE'])
    print('Custom archive restore replaces archived objects. Stop application writes first.')
    if input('Type the target database name to confirm restore: ') != env['PGDATABASE']:
        raise ValueError('Restore cancelled')
    if archive.suffix == '.dump':
        run(['pg_restore', '--list', str(archive)], env)
        run(['pg_restore', '--dbname', env['PGDATABASE'], '--clean', '--if-exists', '--no-owner', '--no-acl', '--exit-on-error', '--single-transaction', str(archive)], env)
    else:
        # Legacy plain SQL requires an empty target; transaction prevents partial recovery.
        with tempfile.TemporaryDirectory(prefix='buzzer-restore-') as directory:
            sql = archive
            if archive.name.endswith('.sql.gz'):
                sql = Path(directory) / 'restore.sql'
                with gzip.open(archive, 'rb') as source, sql.open('wb') as destination:
                    import shutil
                    shutil.copyfileobj(source, destination)
            elif archive.suffix != '.sql':
                raise ValueError('Unsupported archive extension')
            run(['psql', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--single-transaction', '--file', str(sql)], env)
    print('Restore complete')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError, EOFError) as error:
        print('Database archive operation failed:', type(error).__name__, file=sys.stderr)
        sys.exit(1)
