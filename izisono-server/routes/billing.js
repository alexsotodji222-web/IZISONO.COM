import express from 'express';
import crypto from 'node:crypto';
import { requireUser } from '../supabase.js';

const router = express.Router();
const PAYDUNYA_LIVE_BASE = 'https://app.paydunya.com/api/v1';
const PAYDUNYA_TEST_BASE = 'https://app.paydunya.com/sandbox-api/v1';
const PAYMENT_CURRENCY = 'XOF';
const DISPLAY_CURRENCY = 'ZAR';
// UI-only conversion. PayDunya still charges XOF because its documented
// Togo payment channels (T-Money / Moov Togo) are XOF-based.
const DEFAULT_ZAR_PER_XOF = 0.02845;
const PLANS = [
  { id:'discovery', name:'Découverte', price:1990, credits:4, popular:false, description:'Pour découvrir izisono et créer 2 chansons' },
  { id:'popular', name:'Populaire', price:3490, credits:10, popular:true, description:'Le meilleur équilibre pour créer régulièrement' },
  { id:'premium', name:'Premium', price:9990, credits:24, popular:false, description:'Pour les créateurs intensifs et les événements' },
];
const PAYMENT_METHODS = [
  { code:'togocel', name:'Togocel Money', short:'T-Money', country:'TG', icon:'📱', channel:'t-money-togo' },
  { code:'moov_tg', name:'Moov Money Togo', short:'Moov Money', country:'TG', icon:'📲', channel:'moov-togo' },
  { code:'card_xof', name:'Carte bancaire', short:'Visa / Mastercard', country:'TG', icon:'💳', channel:'card' },
  { code:'all', name:'Toutes les options PayDunya', short:'PayDunya', country:'', icon:'🌍', channel:null },
];

function paydunyaMode(){return String(process.env.PAYDUNYA_MODE||'live').toLowerCase()==='test'?'test':'live';}
function paydunyaBase(){return paydunyaMode()==='test'?PAYDUNYA_TEST_BASE:PAYDUNYA_LIVE_BASE;}
function requirePayDunya(){
  const master=process.env.PAYDUNYA_MASTER_KEY;
  const privateKey=process.env.PAYDUNYA_PRIVATE_KEY;
  const token=process.env.PAYDUNYA_TOKEN;
  if(!master||!privateKey||!token) throw Object.assign(new Error('paydunya_credentials_missing'),{status:500});
  return {master,privateKey,token};
}
function displayRate(){const n=Number(process.env.DISPLAY_ZAR_PER_XOF||DEFAULT_ZAR_PER_XOF);return Number.isFinite(n)&&n>0?n:DEFAULT_ZAR_PER_XOF;}
function displayPrice(xof){return Math.round(Number(xof)*displayRate()*100)/100;}
function publicUrl(){return String(process.env.PUBLIC_APP_URL||process.env.CLIENT_URL||'http://localhost:3000').split(',')[0].trim().replace(/\/$/,'');}
function adminConfig(){
  const url=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw Object.assign(new Error('supabase_service_role_key_missing'),{status:500});
  return {url,key};
}
async function supabaseAdmin(path, options={}){
  const {url,key}=adminConfig();
  const r=await fetch(`${url}/rest/v1/${path}`,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:'application/json','Content-Type':'application/json',...(options.headers||{})}});
  const data=await r.json().catch(()=>null);
  if(!r.ok) throw Object.assign(new Error(data?.message||data?.hint||'supabase_admin_request_failed'),{status:r.status,payload:data});
  return data;
}
async function rpc(name,args){return supabaseAdmin(`rpc/${name}`,{method:'POST',body:JSON.stringify(args)});}
async function createPaymentTransaction({userId,paymentId,plan,method,rawPayload,status='initiated'}){
  return rpc('record_paydunya_transaction',{
    p_user_id:userId,p_payment_id:paymentId,p_plan_id:plan.id,p_amount:plan.price,
    p_currency:PAYMENT_CURRENCY,p_credits:plan.credits,p_status:status,p_method:method||null,
    p_gateway:'paydunya',p_raw_payload:rawPayload||{}
  });
}
async function paydunya(path, options={}){
  const {master,privateKey,token}=requirePayDunya();
  const r=await fetch(`${paydunyaBase()}${path}`,{
    ...options,
    headers:{
      'PAYDUNYA-MASTER-KEY':master,
      'PAYDUNYA-PRIVATE-KEY':privateKey,
      'PAYDUNYA-TOKEN':token,
      'Content-Type':'application/json',
      Accept:'application/json',
      ...(options.headers||{})
    }
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok || String(data?.response_code||'00')!=='00'){
    throw Object.assign(new Error(data?.response_text||data?.message||`PayDunya HTTP ${r.status}`),{status:r.status||502,payload:data});
  }
  return data;
}
function verifyCallbackHash(data){
  const master=process.env.PAYDUNYA_MASTER_KEY;
  if(!master||!data?.hash)return false;
  const expected=crypto.createHash('sha512').update(master).digest('hex');
  const a=Buffer.from(String(data.hash));
  const b=Buffer.from(expected);
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
async function fetchPayment(paymentId){
  return paydunya(`/checkout-invoice/confirm/${encodeURIComponent(paymentId)}`,{method:'GET'});
}
async function creditFromPayment(paymentId){
  if(!paymentId) throw new Error('payment_id_missing');
  const verified=await fetchPayment(paymentId);
  const p=verified?.data||verified||{};
  const custom=p.custom_data||p.customData||{};
  const userId=custom.user_id;
  const planId=custom.plan_id;
  const plan=PLANS.find(x=>x.id===planId);
  if(!userId||!plan) throw new Error('payment_metadata_invalid');
  const currency=String(p.currency||PAYMENT_CURRENCY).toUpperCase();
  if(currency!==PAYMENT_CURRENCY) throw new Error('payment_currency_invalid');
  const amount=Number(p.invoice?.total_amount||p.total_amount||0);
  if(amount < plan.price) throw new Error('payment_amount_invalid');
  const status=String(p.status||'').toLowerCase();
  if(status!=='completed') return {credited:false,status:p.status||'unknown',paymentId};
  const method=p.channel||p.method||p.customer?.phone||null;
  const transaction=await rpc('apply_paydunya_payment',{
    p_user_id:userId,p_payment_id:paymentId,p_plan_id:plan.id,p_amount:amount,
    p_currency:PAYMENT_CURRENCY,p_credits:plan.credits,p_status:'completed',p_method:method,
    p_gateway:'paydunya',p_raw_payload:p
  });
  return transaction||{credited:false,status:'completed',paymentId};
}

router.get('/plans',(_req,res)=>{
  res.json({
    currency:PAYMENT_CURRENCY,
    display_currency:DISPLAY_CURRENCY,
    display_rate:displayRate(),
    payment_provider:'PayDunya',
    plans:PLANS.map(p=>({...p,display_price:displayPrice(p.price)})),
    payment_methods:PAYMENT_METHODS
  });
});

router.get('/methods',(_req,res)=>res.json({currency:PAYMENT_CURRENCY,payment_provider:'PayDunya',methods:PAYMENT_METHODS}));

router.post('/checkout',async(req,res)=>{
  try{
    const {user}=await requireUser(req);
    const plan=PLANS.find(p=>p.id===req.body?.plan);
    const requestedMethod=String(req.body?.payment_method||'all');
    if(!PAYMENT_METHODS.some(m=>m.code===requestedMethod)) return res.status(400).json({error:'invalid_payment_method'});
    if(!plan) return res.status(400).json({error:'invalid_plan'});
    const url=publicUrl();
    const email=user.email||'';
    const customerName=(email.split('@')[0]||'Utilisateur').replace(/[^a-zA-ZÀ-ÿ0-9 _-]/g,' ').trim().slice(0,60)||'Utilisateur';
    const selected=PAYMENT_METHODS.find(m=>m.code===requestedMethod);
    const baseInvoice={
      total_amount:plan.price,
      description:`izisono — ${plan.name} — ${plan.credits} Notes`,
      customer:{name:customerName,email},
      items:{item_0:{name:`Pack ${plan.name}`,quantity:1,unit_price:String(plan.price),total_price:String(plan.price),description:`${plan.credits} Notes izisono`}}
    };
    const makePayload=(channels)=>({
      invoice:{...baseInvoice,...(channels?{channels}: {})},
      store:{name:'izisono',tagline:'Studio musical IA',website_url:url},
      custom_data:{user_id:user.id,plan_id:plan.id,credits:String(plan.credits),product:'izisono_notes'},
      actions:{
        cancel_url:`${url}/?payment=cancelled`,
        return_url:`${url}/?payment=return`,
        callback_url:`${url}/api/billing/paydunya-ipn`
      }
    });
    const attempts=[];
    if(selected?.channel) attempts.push(makePayload([selected.channel]));
    attempts.push(makePayload(null));
    let data=null,lastError=null;
    for(let i=0;i<attempts.length;i++){
      try{data=await paydunya('/checkout-invoice/create',{method:'POST',body:JSON.stringify(attempts[i])});break;}
      catch(error){lastError=error;console.warn(`PayDunya checkout attempt ${i+1} failed`,error.payload||error.message);}
    }
    if(!data) throw lastError||new Error('paydunya_checkout_failed');
    const checkoutUrl=data?.response_text||data?.checkout_url||data?.data?.response_text||data?.data?.checkout_url;
    const paymentId=data?.token||data?.data?.token||null;
    if(!checkoutUrl) throw new Error('paydunya_checkout_url_missing');
    if(paymentId){
      try{await createPaymentTransaction({userId:user.id,paymentId,plan,method:requestedMethod==='all'?null:requestedMethod,rawPayload:data,status:'initiated'});}
      catch(recordError){console.error('PayDunya initialized but local transaction recording failed',recordError);}
    }
    res.json({ok:true,checkout_url:checkoutUrl,payment_id:paymentId,plan:{...plan,display_price:displayPrice(plan.price)},display_currency:DISPLAY_CURRENCY,payment_currency:PAYMENT_CURRENCY,payment_provider:'PayDunya'});
  }catch(e){console.error('PayDunya checkout failed',e);res.status(e.status||500).json({error:e.message||'checkout_failed',details:e.payload});}
});

router.get('/verify/:paymentId',async(req,res)=>{
  try{
    const {user}=await requireUser(req);
    const verified=await fetchPayment(req.params.paymentId);
    const p=verified?.data||verified||{};
    const meta=p.custom_data||{};
    if(meta.user_id&&meta.user_id!==user.id) return res.status(403).json({error:'payment_forbidden'});
    const result=await creditFromPayment(req.params.paymentId);
    res.json({status:p.status||'unknown',...result});
  }catch(e){res.status(e.status||500).json({error:e.message||'payment_verification_failed'});}
});

router.post('/paydunya-ipn',async(req,res)=>{
  try{
    const data=req.body?.data||{};
    if(!verifyCallbackHash(data)) return res.status(403).send('invalid_signature');
    const token=data?.invoice?.token||data?.token;
    const custom=data?.custom_data||{};
    const plan=PLANS.find(x=>x.id===custom.plan_id);
    if(token&&custom.user_id&&plan){
      const status=String(data.status||'').toLowerCase();
      if(status==='completed') await creditFromPayment(token);
      else await createPaymentTransaction({userId:custom.user_id,paymentId:token,plan,method:null,rawPayload:data,status:status||'pending'});
    }
    return res.status(200).send('ok');
  }catch(e){console.error('PayDunya IPN failed',e);return res.status(e.status||500).send('ipn_processing_failed');}
});

export { PLANS, PAYMENT_METHODS, creditFromPayment, DISPLAY_CURRENCY, PAYMENT_CURRENCY, displayPrice };


export default router;
