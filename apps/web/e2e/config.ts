import os from 'node:os'
import path from 'node:path'

// Own ports, so the tests never collide with the servers you use during development.
export const API_PORT = 8010
export const WEB_PORT = 5183

// The test API writes emails to this file (see apps/api/scripts/run_e2e_server.py).
export const OUTBOX_FILE = path.join(os.tmpdir(), 'inventra-e2e-outbox.jsonl')

// The site starts in Bulgarian; the tests read the English texts, so every browser they open
// has English already chosen, as if the person had pressed EN once.
export const ENGLISH = {
  cookies: [],
  origins: [{ origin: `http://localhost:${WEB_PORT}`, localStorage: [{ name: 'inventra-language', value: 'en' }] }],
}
