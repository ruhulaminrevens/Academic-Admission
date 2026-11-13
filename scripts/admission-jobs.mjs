import { createHmac } from 'node:crypto';
const { SITE_URL, ADMISSION_JOB_SECRET } = process.env;
if (SITE_URL && ADMISSION_JOB_SECRET) {
  const stamp = String(Math.floor(Date.now() / 1000));
  const result = await fetch(new URL('/api/hooks/admission-jobs', SITE_URL), {
    method: 'POST', signal: AbortSignal.timeout(120000),
    headers: { 'X-Timestamp': stamp, 'X-Signature': createHmac('sha256', ADMISSION_JOB_SECRET).update(stamp + '.admission-jobs').digest('hex') },
  });
  if (!result.ok) throw new Error('Admission job HTTP ' + result.status);
  console.log(await result.json());
} else console.log('Admission jobs are waiting for SITE_URL and ADMISSION_JOB_SECRET.');
