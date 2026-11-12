// ---- Private File Desk (R2) ----

function validFile(bytes, type) {
  if (type === 'application/pdf') return new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
  const magic = type === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10] : [255, 216, 255];
  return magic.every((byte, index) => bytes[index] === byte);
}

async function fileDesk(c, id) {
  const { request, env, user } = c;
  hasProfile(user);
  const prefix = `users/${user.id}/`;
  if (!id && request.method === 'GET') {
    const list = await env.BUCKET.list({ prefix, limit: 12, include: ['customMetadata'] });
    return json(list.objects.map(file => ({ id: file.key.slice(prefix.length), name: file.customMetadata?.name || 'Document', size: file.size, uploaded: file.uploaded })));
  }
  if (!id && request.method === 'POST') {
    required(user.status === 'active', 403, 'Your account is suspended.');
    required((await getSettings(env)).readonly !== '1' || user.rank >= 1, 503, 'The site is in read-only mode right now.');
    const type = request.headers.get('content-type');
    required(FILE_TYPES[type], 415, 'Upload a PDF, PNG or JPEG.');
    let label = '';
    try { label = decodeURIComponent(request.headers.get('x-file-name') || ''); } catch {}
    const name = clean(label.replace(/[\x00-\x1f\x7f]/g, ''), 150, 1);
    const bytes = await readBytes(request, SIZE_LIMIT);
    required(validFile(bytes, type), 415, 'The file content does not match its format.');
    const existing = await env.BUCKET.list({ prefix, limit: 12 });
    const occupied = new Set(existing.objects.map(file => file.key));
    for (let slot = 1; slot <= 12; slot++) {
      const key = prefix + slot;
      if (occupied.has(key)) continue;
      const result = await env.BUCKET.put(key, bytes, { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: type }, customMetadata: { name } });
      if (result) return json({ id: String(slot) }, 201);
    }
    throw new RequestError(409, 'File Desk is full. Delete a file before adding another.');
  }
  required(id && /^(?:[1-9]|1[0-2])$/.test(id), 404, 'File not found.');
  if (request.method === 'DELETE') {
    await env.BUCKET.delete(prefix + id);
    return json({ ok: true });
  }
  required(request.method === 'GET', 405, 'Method not allowed.');
  const file = await env.BUCKET.get(prefix + id);
  required(file, 404, 'File not found.');
  const name = file.customMetadata?.name || 'Document';
  const encoded = encodeURIComponent(name).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16));
  return response(file.body, 'application/octet-stream', {
    headers: { 'Content-Disposition': "attachment; filename*=UTF-8''" + encoded, 'Content-Security-Policy': 'sandbox', 'Cache-Control': 'private, no-store' },
  });
}

for (const method of ['GET', 'POST']) route(method, '/api/files', c => fileDesk(c, undefined));
route('GET', '/api/files/:id', c => fileDesk(c, c.params.id));
route('DELETE', '/api/files/:id', c => fileDesk(c, c.params.id));
