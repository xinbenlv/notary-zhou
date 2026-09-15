#!/usr/bin/env python3
"""Consume the GuestSafe Railway login in memory for this project's CLI actions.
Expired OAuth fails closed; no credential files are read by this adapter.
"""
import json
import math
import os
import re
import subprocess
import sys
import time

PROJECT = '7b6fe9b2-ce31-4559-bade-5ad32b56f7f4'
SERVICE = '833774b6-b5f2-4925-a942-047db1cf954d'

def main():
    raw = os.environ.pop('NOTARY_RAILWAY_LOGIN', '')
    if not raw:
        raise ValueError('missing injected login')
    bundle = json.loads(raw)
    if (type(bundle.get('schemaVersion')) is not int or bundle['schemaVersion'] != 1
            or bundle.get('projectId') != PROJECT
            or bundle.get('serviceId') != SERVICE):
        raise ValueError('unexpected binding')
    auth = bundle['auth']
    if bundle['kind'] == 'oauth':
        expires = auth.get('tokenExpiresAt')
        if (type(expires) not in (int, float) or not math.isfinite(expires)
                or expires <= time.time() + 120):
            raise ValueError('expired login')
        token = auth['accessToken']
    elif bundle['kind'] == 'legacy-session':
        token = auth['token']
    else:
        raise ValueError('unsupported credential kind')
    if not isinstance(token, str) or not token.strip():
        raise ValueError('empty credential')
    args = sys.argv[1:]
    if not args or args[0] not in ('api', 'up', 'deployment'):
        raise ValueError('unsupported operation')
    if args[0] == 'api' and (len(args) < 2 or not args[1].lstrip().startswith('query ')):
        raise ValueError('only read-only API operations permitted')
    if args[0] == 'deployment' and (len(args) < 2 or args[1] != 'list'):
        raise ValueError('only deployment list supported')
    if '--new' in args or '--yes' in args or '-y' in args:
        raise ValueError('implicit project creation is forbidden')
    if args[0] in ('up', 'deployment'):
        if '--project' not in args or args[args.index('--project') + 1] != PROJECT:
            raise ValueError('explicit project required')
        if '--service' not in args or args[args.index('--service') + 1] != SERVICE:
            raise ValueError('explicit service required')
    env = os.environ.copy()
    env.pop('RAILWAY_TOKEN', None)
    env['RAILWAY_API_TOKEN'] = token
    env['RAILWAY_NO_AUTO_UPDATE'] = '1'
    env['CI'] = 'true'
    result = subprocess.run(['railway', *args], env=env, capture_output=True)
    # Never forward raw CLI/auth errors: they might contain partial credentials.
    if result.returncode:
        print('Railway CLI operation failed; raw output suppressed. Verify remote state before retrying.', file=sys.stderr)
        return result.returncode
    output = result.stdout.decode(errors='replace')
    if args[0] == 'up':
        match = re.search(r'https://railway\.com/project/' + PROJECT + r'/service/'
                          + SERVICE + r'\?id=([0-9a-f-]{36})', output)
        print(json.dumps({'uploadAccepted': True,
                          'deploymentId': match.group(1) if match else None}))
        return 0
    payload = None
    for position, char in enumerate(output):
        if char not in '[{':
            continue
        try:
            candidate, _ = json.JSONDecoder().raw_decode(output[position:])
        except ValueError:
            continue
        if isinstance(candidate, dict) and 'data' in candidate or isinstance(candidate, list):
            payload = candidate
            break
    if args[0] == 'deployment' and isinstance(payload, list):
        safe = [{key: row.get(key) for key in ('id', 'status', 'createdAt')}
                for row in payload]
    elif isinstance(payload, dict) and 'deployment' in payload.get('data', {}):
        row = payload['data']['deployment']
        if not isinstance(row, dict):
            raise ValueError('deployment status unavailable')
        safe = {'deployment': {key: row.get(key) for key in ('id', 'status', 'createdAt')}}
    elif isinstance(payload, dict) and 'project' in payload.get('data', {}):
        row = payload['data']['project']
        if not isinstance(row, dict):
            raise ValueError('project unavailable')
        if row.get('id') != PROJECT:
            raise ValueError('unexpected project')
        safe = {'projectId': PROJECT}
        for field in ('environments', 'services'):
            safe[field] = [{key: item['node'].get(key) for key in ('id', 'name')}
                           for item in row.get(field, {}).get('edges', [])]
    else:
        raise ValueError('no supported status payload')
    print(json.dumps(safe))
    return result.returncode

if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, ValueError, TypeError, KeyError, IndexError, AttributeError):
        print('Railway adapter refused the input or could not run; no credentials displayed.', file=sys.stderr)
        raise SystemExit(1)
