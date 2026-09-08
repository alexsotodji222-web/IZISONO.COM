const jsonHeaders = { 'Content-Type': 'application/json', Accept: 'application/json' };

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw Object.assign(new Error('supabase_not_configured'), { status: 500 });
  return { url: url.replace(/\/$/, ''), key };
}

export async function requireUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw Object.assign(new Error('authentication_required'), { status: 401 });
  const { url, key } = config();
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.id) throw Object.assign(new Error('invalid_session'), { status: 401 });
  return { token, user: data, db: createDbClient(token) };
}

function createDbClient(token) {
  const { url, key } = config();
  const base = `${url}/rest/v1`;
  const headers = { ...jsonHeaders, apikey: key, Authorization: `Bearer ${token}` };
  return {
    async select(table, query = '', { single = false, maybe = false } = {}) {
      const r = await fetch(`${base}/${table}${query}`, { headers });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw Object.assign(new Error(data?.message || data?.hint || `supabase_select_${r.status}`), { status: r.status, payload: data });
      if (single && (!Array.isArray(data) || data.length !== 1)) throw Object.assign(new Error('row_not_found'), { status: 404 });
      return single ? data[0] : (maybe && Array.isArray(data) && data.length === 0 ? null : data);
    },
    async insert(table, row, columns='*', { single=false } = {}) {
      const r = await fetch(`${base}/${table}?select=${encodeURIComponent(columns)}`, { method:'POST', headers:{...headers, Prefer:'return=representation'}, body:JSON.stringify(row) });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw Object.assign(new Error(data?.message || data?.hint || `supabase_insert_${r.status}`), { status:r.status, payload:data });
      return single ? data[0] : data;
    },
    async update(table, patch, query, columns='*', { single=false } = {}) {
      const r = await fetch(`${base}/${table}?${query}&select=${encodeURIComponent(columns)}`, { method:'PATCH', headers:{...headers, Prefer:'return=representation'}, body:JSON.stringify(patch) });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw Object.assign(new Error(data?.message || data?.hint || `supabase_update_${r.status}`), { status:r.status, payload:data });
      return single ? data[0] : data;
    },
    async remove(table, query) {
      const r = await fetch(`${base}/${table}?${query}`, { method:'DELETE', headers:{...headers, Prefer:'return=minimal'} });
      if (!r.ok) { const data=await r.json().catch(()=>({})); throw Object.assign(new Error(data?.message || `supabase_delete_${r.status}`), {status:r.status,payload:data}); }
    }
  };
}

export function query(params) {
  return Object.entries(params).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}
