const jsonHeaders = { 'Content-Type': 'application/json', Accept: 'application/json' };

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw Object.assign(new Error('supabase_not_configured'), { status: 500 });
  return { url: url.replace(/\/$/, ''), key };
}
function serviceConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw Object.assign(new Error('supabase_service_role_key_missing'), { status: 500 });
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

export function query(params) { return Object.entries(params).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&'); }

export async function requireAdmin(req) {
  const { user } = await requireUser(req);
  if (user?.app_metadata?.role !== 'admin') throw Object.assign(new Error('admin_access_required'), { status: 403 });
  return { user };
}

export function createAdminDb() {
  const { url, key } = serviceConfig();
  const base = `${url}/rest/v1`;
  const headers = { ...jsonHeaders, apikey: key, Authorization: `Bearer ${key}` };
  return {
    async select(table, query='') {
      const r=await fetch(`${base}/${table}${query}`,{headers});const data=await r.json().catch(()=>null);
      if(!r.ok)throw Object.assign(new Error(data?.message||data?.hint||`supabase_admin_select_${r.status}`),{status:r.status,payload:data});return data;
    },
    async count(table, query='') {
      const r=await fetch(`${base}/${table}${query}`,{method:'HEAD',headers:{...headers,Prefer:'count=exact'}});if(!r.ok)throw Object.assign(new Error(`supabase_admin_count_${r.status}`),{status:r.status});const total=Number((r.headers.get('content-range')||'').split('/')[1]||0);return Number.isFinite(total)?total:0;
    },
    async insert(table,row,columns='*') {
      const r=await fetch(`${base}/${table}?select=${encodeURIComponent(columns)}`,{method:'POST',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify(row)});const data=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(new Error(data?.message||data?.hint||`supabase_admin_insert_${r.status}`),{status:r.status,payload:data});return data;
    },
    async update(table,patch,query,columns='*') {
      const r=await fetch(`${base}/${table}?${query}&select=${encodeURIComponent(columns)}`,{method:'PATCH',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify(patch)});const data=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(new Error(data?.message||data?.hint||`supabase_admin_update_${r.status}`),{status:r.status,payload:data});return data;
    },
    async remove(table,query) {
      const r=await fetch(`${base}/${table}?${query}`,{method:'DELETE',headers:{...headers,Prefer:'return=minimal'}});if(!r.ok){const data=await r.json().catch(()=>({}));throw Object.assign(new Error(data?.message||`supabase_admin_delete_${r.status}`),{status:r.status,payload:data});}
    },
    async rpc(name,args={}) {
      const r=await fetch(`${base}/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(args)});const data=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(new Error(data?.message||data?.hint||`supabase_rpc_${r.status}`),{status:r.status,payload:data});return data;
    },
    async storeRemoteAudio({trackId,userId,audioUrl}) {
      const bucket='tracks';
      const storageHeaders={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
      const bucketCheck=await fetch(`${url}/storage/v1/bucket/${bucket}`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
      if(!bucketCheck.ok){const cr=await fetch(`${url}/storage/v1/bucket`,{method:'POST',headers:storageHeaders,body:JSON.stringify({id:bucket,name:bucket,public:true,file_size_limit:52428800,allowed_mime_types:['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/ogg','audio/mp4','audio/aac']})});if(!cr.ok && cr.status!==409){const t=await cr.text();throw new Error(`storage_bucket_${cr.status}:${t.slice(0,200)}`)}}
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),45000);
      let response;try{response=await fetch(audioUrl,{signal:controller.signal});}finally{clearTimeout(timer)}
      if(!response.ok)throw new Error(`audio_download_${response.status}`);
      const type=response.headers.get('content-type')||'audio/mpeg';const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>50*1024*1024)throw new Error('audio_file_too_large');
      const ext=type.includes('wav')?'wav':type.includes('ogg')?'ogg':type.includes('mp4')||type.includes('aac')?'m4a':'mp3';const objectPath=`${userId}/${trackId}.${ext}`;
      const upload=await fetch(`${url}/storage/v1/object/${bucket}/${objectPath}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':type,'x-upsert':'true'},body:bytes});
      if(!upload.ok){const t=await upload.text();throw new Error(`audio_upload_${upload.status}:${t.slice(0,200)}`)}
      return `${url}/storage/v1/object/public/${bucket}/${objectPath}`;
    }
  };
}
