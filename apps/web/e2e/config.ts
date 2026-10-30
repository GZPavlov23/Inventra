import os from 'node:os'
import path from 'node:path'

// Own ports, so the tests never collide with the servers you use during development.
export const API_PORT = 8010
export const WEB_PORT = 5183

// The test API writes emails to this file (see apps/api/scripts/run_e2e_server.py).
export const OUTBOX_FILE = path.join(os.tmpdir(), 'inventra-e2e-outbox.jsonl')
