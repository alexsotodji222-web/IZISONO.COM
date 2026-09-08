import express from 'express';
import crypto from 'crypto';
import { requireUser, query } from '../supabase.js';

const router = express.Router();
const MUREKA_BASE = 'https://api.mureka.ai';
const TERMINAL = new Set(['succeeded','failed','timeouted','cancelled']);
const GENERATION_COST = 2;

const titleFromPrompt=(prompt,occasion)=>{const first=String(prompt||'').trim().replace(/\s+/g,' ');return first?first.slice(0,48)+(first.length>48?'…':''):(occasion?`Chanson ${occasion}`:'Ma création izisono')};
function murekaHeaders(){if(!process.env.MUREKA_API_KEY)throw new Error('mureka_api_key_missing');return{Authorization:`Bearer ${process.env.MUREKA_API_KEY}`,'Content-Type':'application/json'}}
async function mureka(path,options={}){const r=await fetch(`${MUREKA_BASE}${path}`,{...options,headers:{...murekaHeaders(),...(options.headers||{})}});const text=await r.text();let d;try{d=JSON.parse(text)}catch{d={raw:text}}if(!r.ok){const e=new Error(d?.error?.message||d?.message||`Mureka HTTP ${r.status}`);e.status=r.status;e.payload=d;throw e}return d}
function buildPrompt({prompt,genre,mood,language,voice,occasion}){return[genre,mood,voice==='duet'?'duet vocal':`${voice} vocal`,`language: ${language}`,occasion?`occasion: ${occasion}`:'',prompt].filter(Boolean).join(', ').slice(0,1024)}
function extractChoice(data){const c=data?.choices?.[0]||data?.choice||{};const audioUrl=c.audio_url||c.audioUrl||c.audio?.url||c.audio?.audio_url||c.url||null;const streamUrl=c.stream_url||c.streamUrl||c.audio?.stream_url||c.audio?.streamUrl||null;return{audioUrl:audioUrl||streamUrl||null,streamUrl,songId:String(c.id||c.song_id||c.songId||data?.song_id||'')}}
async function profile(db,user){let p=await db.select('profiles',`?id=eq.${user.id}&select=id,email,credits`,{single:false,maybe:true});if(Array.isArray(p)&&p[0])return p[0];if(!p){return await db.insert('profiles',{id:user.id,email:user.email||null,credits:4},'id,email,credits',{single:true})}return await db.insert('profiles',{id:user.id,email:user.email||null,credits:4},'id,email,credits',{single:true})}

router.get('/me',async(req,res)=>{try{const{db,user}=await requireUser(req);res.json(await profile(db,user))}catch(e){res.status(e.status||500).json({error:e.message||'profile_failed'})}});

router.get('/tracks',async(req,res)=>{try{const{db,user}=await requireUser(req);const rows=await db.select('tracks',`?or=(user_id.eq.${user.id},public.eq.true)&select=*&order=created_at.desc`);res.json({tracks:rows||[]})}catch(e){res.status(e.status||500).json({error:e.message||'tracks_failed'})}});

router.post('/generate',async(req,res)=>{
  let db,user,trackId,jobId,debit=false;
  try{
    ({db,user}=await requireUser(req));
    const{prompt='',lyrics='',genre='Afrobeat',mood='joyful',language='fr',duration=60,occasion='Autre',voice='female',instrumental=false}=req.body||{};
    if(!prompt&&!lyrics)return res.status(400).json({error:'prompt_or_lyrics_required'});
    if(Number(duration)<15||Number(duration)>420)return res.status(400).json({error:'duration_invalid'});
    const p=await profile(db,user);if((p.credits??0)<GENERATION_COST)return res.status(402).json({error:'insufficient_credits',credits:p.credits,required:GENERATION_COST});
    const debited=await db.update('profiles',{credits:p.credits-GENERATION_COST,updated_at:new Date().toISOString()},`id=eq.${user.id}&credits=eq.${p.credits}`,'id,credits',{single:false});
    if(!debited?.[0])return res.status(409).json({error:'credits_changed_retry'});debit=true;
    const track={id:crypto.randomUUID(),user_id:user.id,title:titleFromPrompt(prompt,occasion),prompt,lyrics,genre,mood,language,duration:Number(duration),voice,instrumental,occasion,provider:'mureka',status:'preparing',public:false};
    await db.insert('tracks',track,'*',{single:true});trackId=track.id;
    const job=await db.insert('generation_jobs',{user_id:user.id,track_id:track.id,provider:'mureka',status:'preparing',request:{prompt,lyrics,genre,mood,language,duration:Number(duration),occasion,voice,instrumental}},'*',{single:true});jobId=job.id;
    let providerResponse;
    if(instrumental){providerResponse=await mureka('/v1/instrumental/generate',{method:'POST',body:JSON.stringify({model:process.env.MUREKA_MODEL||'auto',prompt:buildPrompt({prompt,genre,mood,language,voice,occasion}),n:1})})}
    else{providerResponse=await mureka('/v1/song/generate',{method:'POST',body:JSON.stringify({model:process.env.MUREKA_MODEL||'auto',n:1,lyrics:String(lyrics||`[Verse]\n${prompt}`).slice(0,5000),prompt:buildPrompt({prompt,genre,mood,language,voice,occasion}),...(voice==='male'||voice==='female'?{gender:voice}:{}),stream:true})})}
    const taskId=String(providerResponse.id||'');if(!taskId)throw new Error('mureka_task_id_missing');
    await db.update('tracks',{provider_task_id:taskId,status:providerResponse.status||'preparing',updated_at:new Date().toISOString()},`id=eq.${track.id}`);
    await db.update('generation_jobs',{provider_task_id:taskId,status:providerResponse.status||'preparing',response:providerResponse,updated_at:new Date().toISOString()},`id=eq.${job.id}`);
    res.status(202).json({id:track.id,jobId:job.id,taskId,status:providerResponse.status||'preparing',credits:p.credits-GENERATION_COST,title:track.title});
  }catch(e){
    if(db&&user&&debit){try{const p=await profile(db,user);await db.update('profiles',{credits:(p.credits||0)+GENERATION_COST,updated_at:new Date().toISOString()},`id=eq.${user.id}`);if(trackId)await db.update('tracks',{status:'failed',failed_reason:e.message,updated_at:new Date().toISOString()},`id=eq.${trackId}`);if(jobId)await db.update('generation_jobs',{status:'failed',error:e.message,updated_at:new Date().toISOString()},`id=eq.${jobId}`)}catch(r){console.error('rollback failed',r)}}
    console.error('generation failed',e);res.status(e.status===401?502:(e.status||500)).json({error:e.message||'generation_failed',provider:'mureka',details:e.payload})
  }
});

router.get('/generation/:trackId',async(req,res)=>{try{const{db,user}=await requireUser(req);const rows=await db.select('tracks',`?id=eq.${req.params.trackId}&user_id=eq.${user.id}&select=*`);const track=rows?.[0];if(!track)return res.status(404).json({error:'not_found'});if(!track.provider_task_id)return res.json(track);const provider=await mureka(track.instrumental?`/v1/instrumental/query/${track.provider_task_id}`:`/v1/song/query/${track.provider_task_id}`);const{audioUrl,streamUrl,songId}=extractChoice(provider);const patch={status:provider.status||track.status,failed_reason:provider.failed_reason||null,updated_at:new Date().toISOString(),...(audioUrl?{audio_url:audioUrl}:{}),...(songId?{provider_song_id:songId}:{})};const updated=(await db.update('tracks',patch,`id=eq.${track.id}&user_id=eq.${user.id}`,'*',{single:false}))[0];await db.update('generation_jobs',{status:provider.status||track.status,response:provider,error:provider.failed_reason||null,updated_at:new Date().toISOString()},`track_id=eq.${track.id}&user_id=eq.${user.id}`);res.json({...updated,providerStatus:provider.status,done:TERMINAL.has(provider.status),streamUrl})}catch(e){res.status(e.status||500).json({error:e.message||'generation_status_failed'})}});

router.patch('/tracks/:id',async(req,res)=>{try{const{db,user}=await requireUser(req);const allowed={};if(typeof req.body.public==='boolean')allowed.public=req.body.public;if(typeof req.body.title==='string')allowed.title=req.body.title.slice(0,120);if(!Object.keys(allowed).length)return res.status(400).json({error:'no_changes'});const rows=await db.update('tracks',{...allowed,updated_at:new Date().toISOString()},`id=eq.${req.params.id}&user_id=eq.${user.id}`,'*');if(!rows?.[0])return res.status(404).json({error:'not_found'});res.json(rows[0])}catch(e){res.status(e.status||500).json({error:e.message||'update_failed'})}});
router.delete('/tracks/:id',async(req,res)=>{try{const{db,user}=await requireUser(req);await db.remove('tracks',`id=eq.${req.params.id}&user_id=eq.${user.id}`);res.json({ok:true})}catch(e){res.status(e.status||500).json({error:e.message||'delete_failed'})}});
router.get('/occasions',(_req,res)=>res.json({occasions:[['birthday','🎂','Anniversaire'],['wedding','💒','Mariage'],['love','💕','Déclaration'],['success','🎓','Réussite'],['party','🎉','Fête'],['tribute','🕯️','Hommage'],['encouragement','💪','Encouragement'],['other','✨','Autre']].map(([id,icon,name])=>({id,icon,name}))}));
router.get('/styles',(_req,res)=>res.json({styles:['Afrobeat','Amapiano','Zouk','Coupé Décalé','Highlife','Gospel','Rap','R&B','Pop','Acoustique','Lo-fi','Reggae','Dancehall','Drill','Cinematic']}));
export default router;
