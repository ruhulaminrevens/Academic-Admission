const googleCookie = '__Host-aa-google';
const googleStateCookie = '__Host-aa-state';
const googleEnabled = env => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_STATE_SECRET && env.SITE_URL);
const cookieRead = (request, name) => request.headers.get('cookie')?.split(';').map(pair => pair.trim())
  .find(pair => pair.startsWith(name + '='))?.slice(name.length + 1) || '';
const authCookie = (name, value, age) => `${name}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;
const authRedirect = (location, cookies = []) => {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers });
};
const googleToken = () => crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
const stableGoogleOwner = subject => 'google-' + subject;

async function findGoogleSession(env, request) {
  const token = cookieRead(request, googleCookie);
  if (!googleEnabled(env) || !/^[a-f0-9]{64}$/.test(token)) return null;
  return one(env, 'SELECT owner, email FROM google_sessions WHERE token=? AND expires>?', await sha256Hex(token), Date.now());
}

async function googleFlow(env, request, url) {
  if (!['/auth/google', '/auth/google/link', '/auth/google/callback', '/auth/google/logout'].includes(url.pathname)) return null;
  required(googleEnabled(env), 404, 'Google sign-in is unavailable.');
  required(url.origin === new URL(env.SITE_URL).origin, 400, 'Open the main Site URL to sign in.');
  const sitesId = request.headers.get('oai-authenticated-user-id') || '';
  const callback = url.origin + '/auth/google/callback';
  if (url.pathname === '/auth/google/logout') {
    checkOrigin(request, url);
    required(request.method === 'POST', 405, 'Use POST.');
    const token = cookieRead(request, googleCookie);
    if (token) await db(env, 'DELETE FROM google_sessions WHERE token=?', await sha256Hex(token)).run();
    return authRedirect('/account', [authCookie(googleCookie, '', 0)]);
  }
  required(request.method === 'GET', 405, 'Use GET.');
  if (url.pathname !== '/auth/google/callback') {
    const linking = url.pathname.endsWith('/link');
    required(linking ? sitesId : !sitesId, 400, 'Use your Account to link Google, or sign out first.');
    if (linking) required(await one(env, 'SELECT id FROM profiles WHERE id=?', sitesId), 409, 'Create your profile first.');
    const state = googleToken();
    const verifier = googleToken();
    const challenge = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier)));
    const challenge64 = btoa(String.fromCharCode(...challenge)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    const ownerProof = sitesId ? await sha256Hex(sitesId) : 'new';
    const payload = [state, verifier, Date.now() + 600000, ownerProof].join('.');
    const cookie = payload + '.' + await hmacHex(env.GOOGLE_STATE_SECRET, payload);
    const params = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: callback, response_type: 'code',
      scope: 'openid email', state, code_challenge: challenge64, code_challenge_method: 'S256', prompt: 'select_account' });
    return authRedirect('https://accounts.google.com/o/oauth2/v2/auth?' + params, [authCookie(googleStateCookie, cookie, 600)]);
  }
  const [state, verifier, expiry, ownerProof, signature] = cookieRead(request, googleStateCookie).split('.');
  const clear = [authCookie(googleStateCookie, '', 0)];
  if (!state || !signature || !/^\d{13}$/.test(expiry || '') || Number(expiry) < Date.now() || state !== url.searchParams.get('state') ||
    ownerProof !== (sitesId ? await sha256Hex(sitesId) : 'new') ||
    !safeEqual(signature, await hmacHex(env.GOOGLE_STATE_SECRET, [state, verifier, expiry, ownerProof].join('.')))) {
    return authRedirect('/account?auth=state', clear);
  }
  const code = url.searchParams.get('code');
  if (!code) return authRedirect('/account?auth=cancelled', clear);
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', redirect: 'error',
      signal: AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: callback, grant_type: 'authorization_code', code_verifier: verifier }) });
    if (!tokenResponse.ok) throw new Error('token exchange failed');
    const { access_token } = await tokenResponse.json();
    if (!access_token) throw new Error('missing token');
    const userResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { redirect: 'error',
      signal: AbortSignal.timeout(8000), headers: { Authorization: 'Bearer ' + access_token } });
    if (!userResponse.ok) throw new Error('identity lookup failed');
    const { sub, email, email_verified } = await userResponse.json();
    if (!/^\d{1,50}$/.test(sub || '') || typeof email !== 'string' || email_verified !== true || email.length > 254) throw new Error('unverified identity');
    const identity = await one(env, 'SELECT owner FROM google_identities WHERE subject=?', sub);
    if (sitesId && identity && identity.owner !== sitesId) return authRedirect('/account?auth=linked', clear);
    if (sitesId && !identity) {
      const existingProfile = await one(env, 'SELECT id FROM profiles WHERE id=?', stableGoogleOwner(sub));
      if (existingProfile) return authRedirect('/account?auth=linked', clear);
      await db(env, 'INSERT INTO google_identities(subject, owner) VALUES(?,?)', sub, sitesId).run();
    }
    const owner = sitesId || identity?.owner || stableGoogleOwner(sub);
    if (!sitesId && !identity) {
      await db(env, 'INSERT INTO google_identities(subject, owner) VALUES(?,?) ON CONFLICT(subject) DO NOTHING', sub, owner).run();
      const saved = await one(env, 'SELECT owner FROM google_identities WHERE subject=?', sub);
      if (saved?.owner !== owner) return authRedirect('/account?auth=linked', clear);
    }
    const token = googleToken();
    await env.DB.batch([
      db(env, 'DELETE FROM google_sessions WHERE expires <= ?', Date.now()),
      db(env, 'INSERT INTO google_sessions VALUES(?,?,?,?)', await sha256Hex(token), owner, email, Date.now() + 7 * 86400000),
    ]);
    return authRedirect(sitesId ? '/account?auth=success' : '/account', [...clear, authCookie(googleCookie, token, 7 * 86400)]);
  } catch {
    return authRedirect('/account?auth=failed', clear);
  }
}
