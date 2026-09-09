import express from 'express';
import crypto from 'node:crypto';
import { requireUser, createAdminDb } from '../supabase.js';

const router = express.Router();
const MUREKA_BASE = 'https://api.mureka.ai';
const TERMINAL = new Set(['succeeded','failed','timeouted','cancelled']);
const GENERATION_COST = 2;
const MAX_ACTIVE_PER_USER = 2;
const MAX_DAILY_GENERATIONS = 12;
const IP_WINDOW_MS = 60_000;
const IP_MAX_GENERATIONS = 3;
const ipHits = new Map();

const titleFromPrompt=(prompt,occasion)=>{const first=String(prompt||'').trim().replace(/\s+/g,' ');return first?first.slice(0,48)+(first.length>48?'…':''):(occasion?`Chanson ${occasion}`:'Ma création izisono')};
function murekaHeaders(){if(!process.env.MUREKA_API_KEY)throw Object.assign(new Error('mureka_api_key_missing'),{status:500});return{Authorization:`Bearer ${process.env.MUREKA_API_KEY}`,'Content-Type':'application/json',Accept:'application/json'}}
async function mureka(path,options={}){const r=await fetch(`${MUREKA_BASE}${path}`,{...options,headers:{...murekaHeaders(),...(options.headers||{})}});const text=await r.text();let d;try{d=JSON.parse(text)}catch{d={raw:text}}if(!r.ok){const e=new Error(d?.error?.message||d?.message||`Mureka HTTP ${r.status}`);e.status=r.status;e.payload=d;throw e}return d}
function buildPrompt({prompt,genre,mood,language,voice,occasion}){return[genre,mood,voice==='duet'?'duet vocal':`${voice} vocal`,`language: ${language}`,occasion?`occasion: ${occasion}`:'',prompt].filter(Boolean).join(', ').slice(0,1024)}
function extractChoice(data){const c=data?.choices?.[0]||data?.choice||{};const audioUrl=c.audio_url||c.audioUrl||c.audio?.url||c.audio?.audio_url||c.url||null;const streamUrl=c.stream_url||c.streamUrl||c.audio?.stream_url||c.audio?.streamUrl||null;return{audioUrl:audioUrl||streamUrl||null,streamUrl,songId:String(c.id||c.song_id||c.songId||data?.song_id||'')}}
function clientIp(req){return String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim().slice(0,80)}
function enforceIpRateLimit(req){const now=Date.now(),ip=clientIp(req);const hits=(ipHits.get(ip)||[]).filter(t=>now-t<IP_WINDOW_MS);if(hits.length>=IP_MAX_GENERATIONS)throw Object.assign(new Error('generation_rate_limited'),{status:429,code:'generation_rate_limited'});hits.push(now);ipHits.set(ip,hits);if(ipHits.size>5000){for(const [k,v] of ipHits){if(!v.some(t=>now-t<IP_WINDOW_MS))ipHits.delete(k)}}}
async function getProfile(adminDb,user){const rows=await adminDb.select('profiles',`?id=eq.${encodeURIComponent(user.id)}&select=id,email,credits,display_name,created_at,updated_at`);if(rows?.[0])return rows[0];throw Object.assign(new Error('profile_not_found'),{status:404})}
async function rpc(name,args){return adminDbRpc(name,args)}
let adminDb;
function getAdmin(){return adminDb||(adminDb=createAdminDb())}
async function adminDbRpc(name,args){return getAdmin().rpc(name,args)}
async function saveAudioPermanently(trackId,userId,audioUrl){if(!audioUrl||!process.env.SUPABASE_SERVICE_ROLE_KEY)return audioUrl;try{return await getAdmin().storeRemoteAudio({trackId,userId,audioUrl})}catch(e){console.warn('audio storage fallback:',e.message);return audioUrl}}

async function syncGeneration(track,job){
  const db=getAdmin();
  if(!track?.provider_task_id)return track;
  try{
    const provider=await mureka(track.instrumental?`/v1/instrumental/query/${track.provider_task_id}`:`/v1/song/query/${track.provider_task_id}`);
    const {audioUrl,streamUrl,songId}=extractChoice(provider);
    let permanentUrl=null;
    if(audioUrl&&String(provider.status||'')==='succeeded') permanentUrl=await saveAudioPermanently(track.id,track.user_id,audioUrl);
    const status=String(provider.status||track.status||'preparing');
    const patch={status,failed_reason:provider.failed_reason||null,updated_at:new Date().toISOString(),...(permanentUrl?{audio_url:permanentUrl}:audioUrl?{audio_url:audioUrl}:{}),...(songId?{provider_song_id:songId}:{})};
    const updated=(await db.update('tracks',patch,`id=eq.${encodeURIComponent(track.id)}`,'*'))?.[0]||track;
    await db.update('generation_jobs',{status,response:provider,error:provider.failed_reason||null,updated_at:new Date().toISOString()},`id=eq.${encodeURIComponent(job.id)}`,'id,status');
    return {...updated,providerStatus:status,done:TERMINAL.has(status),streamUrl};
  }catch(e){
    await db.update('generation_jobs',{error:e.message,updated_at:new Date().toISOString()},`id=eq.${encodeURIComponent(job.id)}`,'id,error').catch(()=>{});
    throw e;
  }
}

export async function recoverPendingGenerations(){
  if(!process.env.MUREKA_API_KEY)return;
  try{
    const db=getAdmin();
    const jobs=await db.select('generation_jobs','?select=id,track_id,user_id,provider_task_id,status&provider=eq.mureka&status=in.(preparing,queued,running,streaming)&limit=100');
    for(const job of jobs||[]){
      const tracks=await db.select('tracks',`?id=eq.${encodeURIComponent(job.track_id)}&select=*`);const track=tracks?.[0];if(!track)continue;
      backgroundPoll(track.id).catch(e=>console.warn('recovery failed',job.id,e.message));
    }
  }catch(e){console.warn('generation recovery unavailable:',e.message)}
}

router.get('/me',async(req,res)=>{try{const{user}=await requireUser(req);res.json(await getProfile(getAdmin(),user))}catch(e){res.status(e.status||500).json({error:e.message||'profile_failed'})}});

router.patch('/me',async(req,res)=>{try{const{user}=await requireUser(req);const patch={};if(typeof req.body?.display_name==='string')patch.display_name=req.body.display_name.trim().slice(0,80);if(!Object.keys(patch).length)return res.status(400).json({error:'no_changes'});const rows=await getAdmin().update('profiles',patch,`id=eq.${encodeURIComponent(user.id)}`,'id,email,credits,display_name,created_at,updated_at');if(!rows?.[0])return res.status(404).json({error:'profile_not_found'});res.json(rows[0])}catch(e){res.status(e.status||500).json({error:e.message||'profile_update_failed'})}});

router.get('/tracks',async(req,res)=>{try{const{db,user}=await requireUser(req);const rows=await db.select('tracks',`?or=(user_id.eq.${user.id},public.eq.true)&select=*&order=created_at.desc`);res.json({tracks:rows||[]})}catch(e){res.status(e.status||500).json({error:e.message||'tracks_failed'})}});

router.post('/generate',async(req,res)=>{
  let user,trackId,jobId,debit=false;
  try{
    ({user}=await requireUser(req));
    enforceIpRateLimit(req);
    if(user.email_confirmed_at===null) return res.status(403).json({error:'email_confirmation_required'});
    const{prompt='',lyrics='',genre='Afrobeat',mood='joyful',language='fr',duration=60,occasion='Autre',voice='female',instrumental=false}=req.body||{};
    if(!prompt&&!lyrics)return res.status(400).json({error:'prompt_or_lyrics_required'});
    if(String(prompt).length>1200||String(lyrics).length>5000)return res.status(400).json({error:'input_too_long'});
    if(Number(duration)<15||Number(duration)>420)return res.status(400).json({error:'duration_invalid'});
    const db=getAdmin();
    const active=await db.count('generation_jobs',`?user_id=eq.${encodeURIComponent(user.id)}&status=in.(preparing,queued,running,streaming)`);if(active>=MAX_ACTIVE_PER_USER)return res.status(429).json({error:'too_many_active_generations',max:MAX_ACTIVE_PER_USER});
    const day=await db.count('generation_jobs',`?user_id=eq.${encodeURIComponent(user.id)}&created_at=gte.${encodeURIComponent(new Date(Date.now()-24*60*60*1000).toISOString())}`);if(day>=MAX_DAILY_GENERATIONS)return res.status(429).json({error:'daily_generation_limit',max:MAX_DAILY_GENERATIONS});
    const p=await getProfile(db,user);const debited=await rpc('consume_generation_credits',{p_user_id:user.id,p_amount:GENERATION_COST});
    if(!debited?.success)return res.status(402).json({error:'insufficient_credits',credits:debited?.credits??p.credits,required:GENERATION_COST});debit=true;
    const track={id:crypto.randomUUID(),user_id:user.id,title:titleFromPrompt(prompt,occasion),prompt,lyrics,genre,mood,language,duration:Number(duration),voice,instrumental,occasion,provider:'mureka',status:'preparing',public:false};
    await db.insert('tracks',track,'*');trackId=track.id;
    const job=await db.insert('generation_jobs',{user_id:user.id,track_id:track.id,provider:'mureka',status:'preparing',request:{prompt,lyrics,genre,mood,language,duration:Number(duration),occasion,voice,instrumental}},'*');jobId=job?.[0]?.id;
    let providerResponse;
    const payload={model:process.env.MUREKA_MODEL||'auto',n:1,prompt:buildPrompt({prompt,genre,mood,language,voice,occasion})};
    if(instrumental)providerResponse=await mureka('/v1/instrumental/generate',{method:'POST',body:JSON.stringify(payload)});
    else providerResponse=await mureka('/v1/song/generate',{method:'POST',body:JSON.stringify({...payload,lyrics:String(lyrics||`[Verse]\n${prompt}`).slice(0,5000),...(voice==='male'||voice==='female'?{gender:voice}:{}),stream:true})});
    const taskId=String(providerResponse.id||providerResponse.task_id||'');if(!taskId)throw new Error('mureka_task_id_missing');
    await db.update('tracks',{provider_task_id:taskId,status:providerResponse.status||'preparing',updated_at:new Date().toISOString()},`id=eq.${encodeURIComponent(track.id)}`,'id,status,provider_task_id');
    await db.update('generation_jobs',{provider_task_id:taskId,status:providerResponse.status||'preparing',response:providerResponse,updated_at:new Date().toISOString()},`id=eq.${encodeURIComponent(jobId)}`,'id,status,provider_task_id');
    setTimeout(()=>backgroundPoll(track.id).catch(()=>{}),1000);
    res.status(202).json({id:track.id,jobId,taskId,status:providerResponse.status||'preparing',credits:(p.credits||0)-GENERATION_COST,title:track.title});
  }catch(e){
    if(user&&debit){try{await rpc('refund_generation_credits',{p_user_id:user.id,p_amount:GENERATION_COST});if(trackId)await getAdmin().update('tracks',{status:'failed',failed_reason:e.message,updated_at:new Date().toISOString()},`id=eq.${encodeURIComponent(trackId)}`,'id,status');if(jobId)await getAdmin().update('generation_jobs',{status:'failed',error:e.message,updated_at:new Date().toISOString()},`id=eq.${encodeURIComponent(jobId)}`,'id,status');}catch(r){console.error('credit rollback failed',r)}}
    console.error('generation failed',e);res.status(e.status||500).json({error:e.message||'generation_failed',provider:'mureka',details:e.payload})
  }
});

async function backgroundPoll(trackId){
  const db=getAdmin();
  for(let i=0;i<120;i++){
    try{
      const tracks=await db.select('tracks',`?id=eq.${encodeURIComponent(trackId)}&select=*`);const track=tracks?.[0];if(!track)return;
      const jobs=await db.select('generation_jobs',`?track_id=eq.${encodeURIComponent(trackId)}&select=*&order=created_at.desc&limit=1`);const job=jobs?.[0];if(!job||!track.provider_task_id)return;
      const updated=await syncGeneration(track,job);if(updated.done)return;
    }catch(e){if(i===119)console.warn('background generation ended with error',trackId,e.message)}
    await new Promise(r=>setTimeout(r,3000));
  }
}

router.get('/generation/:trackId',async(req,res)=>{try{const{user}=await requireUser(req);const rows=await getAdmin().select('tracks',`?id=eq.${encodeURIComponent(req.params.trackId)}&user_id=eq.${encodeURIComponent(user.id)}&select=*`);const track=rows?.[0];if(!track)return res.status(404).json({error:'not_found'});const jobs=await getAdmin().select('generation_jobs',`?track_id=eq.${encodeURIComponent(track.id)}&user_id=eq.${encodeURIComponent(user.id)}&select=*&order=created_at.desc&limit=1`);const job=jobs?.[0];if(track.provider_task_id&&job&&!TERMINAL.has(track.status))return res.json(await syncGeneration(track,job));res.json({...track,providerStatus:track.status,done:TERMINAL.has(track.status)});}catch(e){res.status(e.status||500).json({error:e.message||'generation_status_failed'})}});

router.patch('/tracks/:id',async(req,res)=>{try{const{user}=await requireUser(req);const allowed={};if(typeof req.body.public==='boolean')allowed.public=req.body.public;if(typeof req.body.title==='string')allowed.title=req.body.title.slice(0,120);if(!Object.keys(allowed).length)return res.status(400).json({error:'no_changes'});const rows=await getAdmin().update('tracks',{...allowed,updated_at:new Date().toISOString()},`id=eq.${encodeURIComponent(req.params.id)}&user_id=eq.${encodeURIComponent(user.id)}`,'*');if(!rows?.[0])return res.status(404).json({error:'not_found'});res.json(rows[0])}catch(e){res.status(e.status||500).json({error:e.message||'update_failed'})}});
router.delete('/tracks/:id',async(req,res)=>{try{const{user}=await requireUser(req);await getAdmin().remove('tracks',`id=eq.${encodeURIComponent(req.params.id)}&user_id=eq.${encodeURIComponent(user.id)}`);res.json({ok:true})}catch(e){res.status(e.status||500).json({error:e.message||'delete_failed'})}});
router.get('/occasions',(_req,res)=>res.json({occasions:[['birthday','🎂','Anniversaire'],['wedding','💒','Mariage'],['love','💕','Déclaration'],['success','🎓','Réussite'],['party','🎉','Fête'],['tribute','🕯️','Hommage'],['encouragement','💪','Encouragement'],['other','✨','Autre']].map(([id,icon,name])=>({id,icon,name}))}));
router.get('/styles',(_req,res)=>res.json({styles:['Afrobeat','Amapiano','Zouk','Coupé Décalé','Highlife','Gospel','Rap','R&B','Pop','Acoustique','Lo-fi','Reggae','Dancehall','Drill','Cinematic']}));

export default router;
