#!/usr/bin/env python3
"""One-time migration of the local two-airport demo; originals remain stopped."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time

from configure_identity import command, main as configure_identity

ROOT = Path(__file__).resolve().parents[1]
RENAMES = {'dunarea': 'craiova', 'carpati': 'sibiu'}


def main():
    config = json.loads(command(['docker', 'compose', 'config', '--format', 'json']))
    project = config['name']
    existing = set(command(['docker', 'volume', 'ls', '--format', '{{.Name}}']).splitlines())
    pairs = [(f'{project}_{old}-{kind}', config['volumes'][f'{new}-{kind}']['name'])
             for old, new in RENAMES.items() for kind in ('state', 'identity')]
    if not all(source in existing and target not in existing for source, target in pairs):
        raise RuntimeError('Expected four old volumes and no new volumes. Migration does not overwrite or merge state; inspect Docker volumes first.')
    containers = command(['docker', 'ps', '-q', '--filter', f'label=com.docker.compose.project={project}']).split()
    if containers:
        command(['docker', 'stop', *containers])
    for source, target in pairs:
        logical = target.removeprefix(project + '_')
        command(['docker', 'volume', 'create', '--label', f'com.docker.compose.project={project}',
                 '--label', f'com.docker.compose.volume={logical}', target])
        command(['docker', 'run', '--rm', '-v', source + ':/source:ro', '-v', target + ':/target',
                 'nginx:1.28-alpine', 'sh', '-c', 'cp -a /source/. /target/'])
        print(f'Copied {source} to {target}; original retained.', flush=True)
    # Retire only this project's old airport containers/networks. Keeping all old
    # networks allocated can exhaust Docker Desktop's default subnet pool.
    if containers:
        records = json.loads(command(['docker', 'inspect', *containers]))
        old_containers = [item['Id'] for item in records if
                          item['Config']['Labels'].get('com.docker.compose.service', '').startswith(tuple(old + '-' for old in RENAMES))]
        if old_containers:
            command(['docker', 'rm', *old_containers])
    network_ids = command(['docker', 'network', 'ls', '-q', '--filter', f'label=com.docker.compose.project={project}']).split()
    if network_ids:
        networks = json.loads(command(['docker', 'network', 'inspect', *network_ids]))
        for network in networks:
            logical = network.get('Labels', {}).get('com.docker.compose.network', '')
            if logical.startswith(tuple(old + '-' for old in RENAMES)) and not network.get('Containers'):
                command(['docker', 'network', 'rm', network['Id']])
    exchange = ROOT / '.runtime/exchange'
    if exchange.exists():
        backup = ROOT / ('.runtime/exchange-before-airport-rename-' + time.strftime('%Y%m%d%H%M%S'))
        shutil.copytree(exchange, backup)
        # The generator retains valid named credentials, so clear only its ready
        # marker to generate the new pair and CA. Old credentials are backed up.
        (exchange / 'ready').unlink(missing_ok=True)
    subprocess.run([sys.executable, str(ROOT / 'scripts/prepare_exchange.py')], cwd=ROOT, check=True)
    command(['docker', 'compose', 'build'])
    configure_identity()
    print('Craiova and Sibiu are ready. Original volumes and document evidence are retained.', flush=True)


if __name__ == '__main__':
    main()
