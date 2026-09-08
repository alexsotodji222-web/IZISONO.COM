import express from 'express';
import crypto from 'node:crypto';
import { requireUser } from '../supabase.js';

const router = express.Router();
const MONEROO_BASE = 'https://api.moneroo.io';
const PLANS = [
  { id:'discovery', name:'Découverte', price:1990, credits:4, popular:false, description:'Pour découvrir izisono et créer 2 chansons' },
  { id:'popular', name:'Populaire', price:3490, credits:10, popular:true, description:'Le meilleur équilibre pour créer régulièrement' },
  { id:'premium', name:'Premium', price:9990, credits:24, popular:false, description:'Pour les créateurs intensifs et les événements' },
];
const PAYMENT_METHODS = [
  { code:'togocel', name:'Togocel Money', short:'T-Money', country:'TG', icon:'📱' },
  { code:'moov_tg', name:'Moov Money Togo', short:'Moov Money', country:'TG', icon:'📲' },
  { code:'card_xof', name:'Carte bancaire', short:'Visa / Mastercard', country:'TG', icon:'💳' },
  { code:'all', name:'Autres méthodes disponibles', short:'Moneroo', country:'', icon:'🌍' },
];
const XOF_MOBILE_METHODS = ['togocel','moov_tg'];

function requireMoneroo(){ if(!process.env.MONEROO_SECRET_KEY) throw Object.assign(new Error('moneroo_secret_key_missing'),{status:500}); return process.env.MONEROO_SECRET_KEY; }
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

async function rpc(name, args){
  return supabaseAdmin(`rpc/${name}`,{method:'POST',body:JSON.stringify(args)});
}

async function createPaymentTransaction({userId,paymentId,plan,method,rawPayload,status='initiated'}){
  return rpc('record_payment_transaction',{
    p_user_id:userId,p_moneroo_payment_id:paymentId,p_plan_id:plan.id,p_amount:plan.price,
    p_currency:'XOF',p_credits:plan.credits,p_status:status,p_method:method||null,p_gateway:'moneroo',p_raw_payload:rawPayload||{}
  });
}

async function moneroo(path, options={}){
  const secret=requireMoneroo();
  const r=await fetch(`${MONEROO_BASE}${path}`,{...options,headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json',Accept:'application/json',...(options.headers||{})}});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw Object.assign(new Error(data?.message||data?.error?.message||`Moneroo HTTP ${r.status}`),{status:r.status,payload:data});
  return data;
}
async function creditFromPayment(paymentId){
  if(!paymentId) throw new Error('payment_id_missing');
  const verified=await moneroo(`/v1/payments/${encodeURIComponent(paymentId)}/verify`);
  const p=verified?.data||{};
  const meta=p.metadata||p.context?.metadata||{};
  const userId=meta.user_id||meta.customer_id;
  const planId=meta.plan_id;
  const plan=PLANS.find(x=>x.id===planId);
  const method=p.method?.code||p.method||p.payment_method?.code||p.payment_method||null;
  if(!userId||!plan) throw new Error('payment_metadata_invalid');
  if(String(p.currency?.code||p.currency||'XOF').toUpperCase()!=='XOF') throw new Error('payment_currency_invalid');
  const amount=Number(p.amount||p.amount_paid||0);
  if(amount < plan.price) throw new Error('payment_amount_invalid');
  const transaction=await rpc('apply_moneroo_payment',{
    p_user_id:userId,p_moneroo_payment_id:paymentId,p_plan_id:plan.id,p_amount:amount,
    p_currency:'XOF',p_credits:plan.credits,p_status:String(p.status||'unknown'),
    p_method:method,p_gateway:'moneroo',p_raw_payload:p
  });
  return transaction||{credited:false,status:p.status||'unknown'};
}

router.get('/plans',(_req,res)=>res.json({currency:'XOF',plans:PLANS,payment_methods:PAYMENT_METHODS}));

router.get('/methods',async(_req,res)=>{
  try{
    const data=await moneroo('/utils/payment/methods',{method:'GET'});
    const methods=Array.isArray(data?.data)?data.data:(Array.isArray(data)?data:[]);
    const xof=methods.filter(m=>String(m.currency||m.currency_code||'').toUpperCase()==='XOF');
    res.json({currency:'XOF',methods:xof});
  }catch(e){
    res.json({currency:'XOF',methods:PAYMENT_METHODS.filter(m=>m.code!=='all')});
  }
});

router.post('/checkout',async(req,res)=>{
  try{
    const {user}=await requireUser(req);
    const plan=PLANS.find(p=>p.id===req.body?.plan);
    const requestedMethod=String(req.body?.payment_method||'all');
    const supportedMethods=PAYMENT_METHODS.map(m=>m.code);
    if(requestedMethod!=='all'&&!supportedMethods.includes(requestedMethod)) return res.status(400).json({error:'invalid_payment_method'});
    if(!plan) return res.status(400).json({error:'invalid_plan'});
    const publicUrl=process.env.PUBLIC_APP_URL||process.env.CLIENT_URL||'http://localhost:3000';
    const email=user.email||'';
    const data=await moneroo('/v1/payments/initialize',{method:'POST',body:JSON.stringify({
      amount:plan.price,
      currency:'XOF',
      description:`izisono — ${plan.name} — ${plan.credits} Notes`,
      customer:{email,first_name:(email.split('@')[0]||'Utilisateur')},
      return_url:`${publicUrl}/?payment=return`,
      metadata:{user_id:user.id,plan_id:plan.id,credits:String(plan.credits),product:'izisono_notes'},
      ...(requestedMethod!=='all'?{methods:[requestedMethod]}:{})
    })});
    const checkoutUrl=data?.data?.checkout_url||data?.checkout_url;
    if(!checkoutUrl) throw new Error('moneroo_checkout_url_missing');
    const paymentId=data?.data?.id||data?.id||null;
    if(paymentId) await createPaymentTransaction({userId:user.id,paymentId,plan,method:requestedMethod==='all'?null:requestedMethod,rawPayload:data,status:'initiated'});
    res.json({ok:true,checkout_url:checkoutUrl,payment_id:paymentId,plan});
  }catch(e){console.error('Moneroo checkout failed',e);res.status(e.status||500).json({error:e.message||'checkout_failed',details:e.payload})}
});

router.get('/verify/:paymentId',async(req,res)=>{
  try{
    const {user}=await requireUser(req);
    const verified=await moneroo(`/v1/payments/${encodeURIComponent(req.params.paymentId)}/verify`);
    const p=verified?.data||{}; const meta=p.metadata||p.context?.metadata||{};
    if(meta.user_id && meta.user_id!==user.id) return res.status(403).json({error:'payment_forbidden'});
    const result=await creditFromPayment(req.params.paymentId);
    res.json({status:p.status||'unknown',...result});
  }catch(e){res.status(e.status||500).json({error:e.message||'payment_verification_failed'})}
});

router.post('/webhook',async(req,res)=>{
  try{
    const secret=process.env.MONEROO_WEBHOOK_SECRET;
    if(!secret) return res.status(500).send('webhook_secret_missing');
    const raw=Buffer.isBuffer(req.body)?req.body:Buffer.from(JSON.stringify(req.body||{}));
    const signature=req.get('X-Moneroo-Signature')||'';
    const expected=crypto.createHmac('sha256',secret).update(raw).digest('hex');
    if(!signature || signature.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) return res.status(403).send('invalid_signature');
    const payload=JSON.parse(raw.toString('utf8'));
    const paymentId=payload?.data?.id||payload?.data?.payment_id||payload?.id;
    if(paymentId){
      const event=String(payload.event||'');
      if(event==='payment.success') await creditFromPayment(paymentId);
      else {
        const meta=payload?.data?.metadata||payload?.data?.context?.metadata||{};
        const plan=PLANS.find(x=>x.id===meta.plan_id);
        if(meta.user_id&&plan) await createPaymentTransaction({userId:meta.user_id,paymentId,plan,method:payload?.data?.method?.code||payload?.data?.method,rawPayload:payload,status:event.replace('payment.','')||'initiated'});
      }
    }
    return res.status(200).send('ok');
  }catch(e){console.error('Moneroo webhook failed',e);return res.status(200).send('received');}
});

export { PLANS, PAYMENT_METHODS, creditFromPayment };
export default router;
