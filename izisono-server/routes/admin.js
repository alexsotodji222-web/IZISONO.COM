import express from 'express';
import { requireAdmin, createAdminDb } from '../supabase.js';
import { creditFromPayment } from './billing.js';

const router = express.Router();
router.use(async (req,res,next)=>{ try { req.admin = await requireAdmin(req); next(); } catch(e){ res.status(e.status||500).json({error:e.message||'admin_required'}); } });

function serviceConfig(){
  const url=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw Object.assign(new Error('supabase_service_role_key_missing'),{status:500});
  return {url,key};
}
async function authAdmin(path,{method='GET',body}={}){
  const {url,key}=serviceConfig();
  const r=await fetch(`${url}/auth/v1/admin${path}`,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw Object.assign(new Error(data?.msg||data?.message||data?.error_description||`supabase_auth_${r.status}`),{status:r.status,payload:data});
  return data;
}
async function audit(adminId,action,targetType,targetId,details={}){
  try{ const db=createAdminDb(); await db.insert('admin_audit_logs',{admin_user_id:adminId,action,target_type:targetType||null,target_id:targetId||null,details}); }catch(e){ console.error('admin audit log failed',e.message); }
}
function assertUuid(id){ if(!/^[0-9a-f-]{36}$/i.test(id)) throw Object.assign(new Error('invalid_id'),{status:400}); }

router.get('/overview', async (req,res)=>{
  try { const db=createAdminDb(); const [users,tracks,successPayments,credits,failedJobs,successfulJobs]=await Promise.all([
    db.count('profiles'), db.count('tracks'), db.count('payment_transactions','?status=eq.success'), db.select('profiles','?select=credits'), db.count('generation_jobs','?status=eq.failed'), db.count('generation_jobs','?status=eq.succeeded')
  ]); const totalCredits=(credits||[]).reduce((s,p)=>s+Number(p.credits||0),0); res.json({users,tracks,successfulPayments:successPayments,totalCredits,failedJobs,successfulJobs});
  }catch(e){res.status(e.status||500).json({error:e.message||'admin_overview_failed'});}
});

router.get('/users', async (req,res)=>{
  try { const db=createAdminDb(); const profiles=await db.select('profiles','?select=id,email,credits,created_at,updated_at&order=created_at.desc&limit=200'); const auth=await authAdmin('/users?per_page=200&page=1'); const authUsers=auth?.users||[]; const byId=new Map(authUsers.map(u=>[u.id,u])); res.json({users:(profiles||[]).map(p=>{const u=byId.get(p.id)||{}; return {...p,confirmed:!!u.email_confirmed_at,last_sign_in_at:u.last_sign_in_at||null,banned_until:u.banned_until||null,suspended:!!u.banned_until};})});
  }catch(e){res.status(e.status||500).json({error:e.message||'admin_users_failed',code:e.code||null});}
});

router.patch('/users/:id/credits', async (req,res)=>{
  try { const id=req.params.id; assertUuid(id); const amount=Number(req.body?.amount); if(!Number.isInteger(amount)||amount===0||Math.abs(amount)>10000) throw Object.assign(new Error('invalid_credit_amount'),{status:400}); const db=createAdminDb(); const rows=await db.select('profiles',`?select=id,credits&id=eq.${encodeURIComponent(id)}`); if(!rows?.[0]) throw Object.assign(new Error('user_not_found'),{status:404}); const next=Math.max(0,Number(rows[0].credits||0)+amount); const updated=await db.update('profiles',{credits:next},`id=eq.${encodeURIComponent(id)}`,'id,email,credits,updated_at'); await audit(req.admin.user.id,'credits_adjusted','user',id,{amount,previous:rows[0].credits,next}); res.json({user:updated?.[0]||updated});
  }catch(e){res.status(e.status||500).json({error:e.message||'credit_update_failed'});}
});

router.patch('/users/:id/suspend', async (req,res)=>{
  try { const id=req.params.id; assertUuid(id); if(id===req.admin.user.id) throw Object.assign(new Error('cannot_suspend_self'),{status:400,code:'cannot_suspend_self'}); const suspended=!!req.body?.suspended; await authAdmin(`\/users\/${id}`,{method:'PUT',body:{ban_duration:suspended?'876000h':'none'}}); await audit(req.admin.user.id,suspended?'user_suspended':'user_unsuspended','user',id,{suspended}); res.json({ok:true,suspended});
  }catch(e){res.status(e.status||500).json({error:e.message||'user_suspend_failed',code:e.code||null});}
});

router.delete('/users/:id', async (req,res)=>{
  try { const id=req.params.id; assertUuid(id); if(id===req.admin.user.id) throw Object.assign(new Error('cannot_delete_self'),{status:400,code:'cannot_delete_self'}); await authAdmin(`\/users\/${id}`,{method:'DELETE'}); await audit(req.admin.user.id,'user_deleted','user',id,{}); res.json({ok:true});
  }catch(e){res.status(e.status||500).json({error:e.message||'user_delete_failed',code:e.code||null});}
});

router.get('/tracks', async (req,res)=>{
  try { const db=createAdminDb(); const rows=await db.select('tracks','?select=id,user_id,title,genre,mood,language,status,provider,provider_task_id,public,created_at,audio_url&order=created_at.desc&limit=200'); res.json({tracks:rows||[]});
  }catch(e){res.status(e.status||500).json({error:e.message||'admin_tracks_failed'});}
});

router.patch('/tracks/:id', async (req,res)=>{
  try { const id=req.params.id; assertUuid(id); const patch={}; if(typeof req.body?.public==='boolean') patch.public=req.body.public; if(typeof req.body?.status==='string' && ['preparing','queued','running','streaming','succeeded','failed','timeouted','cancelled'].includes(req.body.status)) patch.status=req.body.status; if(!Object.keys(patch).length) throw Object.assign(new Error('nothing_to_update'),{status:400}); const db=createAdminDb(); const updated=await db.update('tracks',patch,`id=eq.${encodeURIComponent(id)}`,'id,title,status,public,updated_at'); await audit(req.admin.user.id,'track_updated','track',id,patch); res.json({track:updated?.[0]||updated});
  }catch(e){res.status(e.status||500).json({error:e.message||'track_update_failed'});}
});

router.delete('/tracks/:id', async (req,res)=>{
  try { const id=req.params.id; assertUuid(id); const db=createAdminDb(); await db.remove('tracks',`id=eq.${encodeURIComponent(id)}`); await audit(req.admin.user.id,'track_deleted','track',id,{}); res.json({ok:true});
  }catch(e){res.status(e.status||500).json({error:e.message||'track_delete_failed'});}
});

router.get('/generations', async (req,res)=>{
  try { const db=createAdminDb(); const rows=await db.select('generation_jobs','?select=id,user_id,track_id,provider,provider_task_id,status,error,created_at,updated_at&order=created_at.desc&limit=200'); res.json({generations:rows||[]});
  }catch(e){res.status(e.status||500).json({error:e.message||'admin_generations_failed'});}
});

router.get('/payments', async (req,res)=>{
  try { const db=createAdminDb(); const rows=await db.select('payment_transactions','?select=id,user_id,payment_id,plan_id,amount,currency,credits,status,method,gateway,raw_payload,created_at,processed_at&order=created_at.desc&limit=200'); res.json({payments:rows||[]});
  }catch(e){res.status(e.status||500).json({error:e.message||'admin_payments_failed'});}
});

router.patch('/payments/:id', async (req,res)=>{
  try { const id=req.params.id; assertUuid(id); const status=String(req.body?.status||''); if(!['pending','initiated','failed','cancelled'].includes(status)) throw Object.assign(new Error('success_requires_paydunya_reconciliation'),{status:400}); const db=createAdminDb(); const updated=await db.update('payment_transactions',{status,updated_at:new Date().toISOString()},`id=eq.${encodeURIComponent(id)}`,'id,status,updated_at'); await audit(req.admin.user.id,'payment_status_updated','payment',id,{status}); res.json({payment:updated?.[0]||updated});
  }catch(e){res.status(e.status||500).json({error:e.message||'payment_update_failed'});}
});

router.post('/payments/:id/reconcile', async (req,res)=>{
  try { const id=req.params.id; assertUuid(id); const db=createAdminDb(); const rows=await db.select('payment_transactions',`?id=eq.${encodeURIComponent(id)}&select=payment_id`); const paymentId=rows?.[0]?.payment_id; if(!paymentId) throw Object.assign(new Error('payment_not_found'),{status:404}); const result=await creditFromPayment(paymentId); await audit(req.admin.user.id,'payment_reconciled','payment',id,{paymentId,credited:!!result?.credited}); res.json(result);
  }catch(e){res.status(e.status||500).json({error:e.message||'payment_reconcile_failed'});}
});

export default router;
