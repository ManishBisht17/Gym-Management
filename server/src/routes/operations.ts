import type {Request,Response} from "express";import {Router} from 'express';import {z} from 'zod';import mongoose from 'mongoose';
import multer from 'multer';
import path from 'node:path';
import {Member} from '../models/Member.js';import {MembershipPlan} from '../models/MembershipPlan.js';import {Membership} from '../models/Membership.js';import {Payment} from '../models/Payment.js';import {Notification} from '../models/Notification.js';import {Gym} from '../models/Gym.js';import {requireAuth} from '../middleware/auth.js';
import { ensureLogoDirs, logosDir, logoDataUri, publicLogoPath, removeLogoFile } from '../utils/logo.js';
export const operationsRouter=Router();operationsRouter.use(requireAuth);
const logoUpload=multer({
  storage:multer.diskStorage({
    destination:async(_req,_file,cb)=>{try{await ensureLogoDirs();cb(null,logosDir);}catch(err){cb(err as Error,logosDir);}},
    filename:(req,file,cb)=>{
      const ext=path.extname(file.originalname).toLowerCase()||'.png';
      cb(null,`${req.auth!.gymId}-${Date.now()}${ext}`);
    },
  }),
  limits:{fileSize:2*1024*1024},
  fileFilter:(_req,file,cb)=>{
    const allowed=['image/png','image/jpeg','image/jpg','image/webp','image/gif'];
    if(!allowed.includes(file.mimetype)) return cb(new Error('Logo must be a PNG, JPG, WEBP, or GIF image. PDF is not supported for logos.'));
    cb(null,true);
  },
});

const gym=(req:any)=>new mongoose.Types.ObjectId(req.auth.gymId);const wrap=(fn:any)=>(req:any,res:any,next:any)=>Promise.resolve(fn(req,res)).catch(next);
const memberInput=z.object({fullName:z.string().trim().min(1).max(120),email:z.string().email().optional().or(z.literal('')),phone:z.string().min(4).max(40),gender:z.enum(['female','male','other','prefer_not_to_say']).optional(),dateOfBirth:z.coerce.date().optional(),address:z.string().max(500).optional(),memberId:z.string().trim().min(1).max(50),joiningDate:z.coerce.date().optional(),notes:z.string().max(2000).optional()});
const planInput=z.object({name:z.string().trim().min(1).max(80),duration:z.coerce.number().int().positive(),durationUnit:z.enum(['days','months','years']),price:z.coerce.number().nonnegative(),description:z.string().max(500).optional()});
const membershipInput=z.object({memberId:z.string(),planId:z.string(),startDate:z.coerce.date(),discount:z.coerce.number().nonnegative().default(0)});
operationsRouter.post('/members',wrap(async(req:Request,res:Response)=>{
  const x=memberInput.parse(req.body);
  if(!x.email) return res.status(400).json({error:'Member email is required so we can send a welcome message from your gym.'});
  const g=gym(req);
  const gymDoc=await Gym.findById(g).select('name email phone logoUrl notificationSettings');
  if(!gymDoc) return res.status(404).json({error:'Gym not found'});
  const m=await Member.create({...x,email:x.email,gymId:g});
  const emailResult:{sent:boolean;error?:string}={sent:false};
  if(gymDoc.notificationSettings?.welcome!==false){
    try{
      const {sendMemberWelcomeEmail}=await import('../services/email.js');
      await sendMemberWelcomeEmail({
        to:x.email,
        memberName:m.fullName,
        memberCode:m.memberId,
        gymName:gymDoc.name,
        gymEmail:gymDoc.email||undefined,
        gymPhone:gymDoc.phone||undefined,
        logoDataUri:await logoDataUri(gymDoc.logoUrl),
      });
      emailResult.sent=true;
      await Notification.create({
        gymId:g,
        memberId:m._id,
        type:'welcome',
        idempotencyKey:`welcome:${String(m._id)}`,
        recipient:x.email,
        subject:`Welcome to ${gymDoc.name}`,
        status:'sent',
        attempts:1,
        sentAt:new Date(),
      });
    }catch(err){
      emailResult.error=err instanceof Error?err.message:'Could not send welcome email';
      await Notification.create({
        gymId:g,
        memberId:m._id,
        type:'welcome',
        idempotencyKey:`welcome:${String(m._id)}`,
        recipient:x.email,
        subject:`Welcome to ${gymDoc.name}`,
        status:'failed',
        attempts:1,
        lastError:emailResult.error,
      }).catch(()=>undefined);
    }
  }
  return res.status(201).json({member:m,email:emailResult});
}));
operationsRouter.get('/members',wrap(async(req:Request,res:Response)=>{const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(100,Math.max(1,Number(req.query.limit)||20));const q=String(req.query.q||'').trim(),status=String(req.query.status||'all');const filter:any={gymId:gym(req)};if(status==='archived')filter.archivedAt={$ne:null};else filter.archivedAt=null;if(status==='active'||status==='expired'){const rows=await Membership.find({gymId:gym(req),status}).distinct('memberId');filter._id={$in:rows};}if(q){const safe=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const rx=new RegExp(safe,'i');filter.$or=[{fullName:rx},{email:rx},{phone:rx},{memberId:rx}];}const [items,total]=await Promise.all([Member.find(filter).sort({createdAt:-1}).skip((page-1)*limit).limit(limit),Member.countDocuments(filter)]);return res.json({items,total,page,limit});}));
operationsRouter.get('/members/:id',wrap(async(req:Request,res:Response)=>{const m=await Member.findOne({_id:req.params.id,gymId:gym(req)});if(!m)return res.status(404).json({error:'Member not found'});const [memberships,payments]=await Promise.all([Membership.find({gymId:gym(req),memberId:m._id}).populate('planId').sort({startDate:-1}),Payment.find({gymId:gym(req),memberId:m._id}).sort({paymentDate:-1})]);return res.json({member:m,memberships,payments});}));
operationsRouter.patch('/members/:id',wrap(async(req:Request,res:Response)=>{const data=memberInput.partial().parse(req.body);const m=await Member.findOneAndUpdate({_id:req.params.id,gymId:gym(req),archivedAt:null},data,{new:true,runValidators:true});if(!m)return res.status(404).json({error:'Member not found'});return res.json({member:m});}));
operationsRouter.post('/members/:id/archive',wrap(async(req:Request,res:Response)=>{const m=await Member.findOneAndUpdate({_id:req.params.id,gymId:gym(req),archivedAt:null},{archivedAt:new Date()},{new:true});if(!m)return res.status(404).json({error:'Member not found'});return res.json({member:m});}));
operationsRouter.post('/members/:id/restore',wrap(async(req:Request,res:Response)=>{const m=await Member.findOneAndUpdate({_id:req.params.id,gymId:gym(req),archivedAt:{$ne:null}},{$unset:{archivedAt:1}},{new:true});if(!m)return res.status(404).json({error:'Archived member not found'});return res.json({member:m});}));
operationsRouter.post('/plans',wrap(async(req:Request,res:Response)=>{const p=await MembershipPlan.create({...planInput.parse(req.body),gymId:gym(req)});return res.status(201).json({plan:p});}));operationsRouter.get('/plans',wrap(async(req:Request,res:Response)=>res.json({items:await MembershipPlan.find({gymId:gym(req),archivedAt:req.query.archived==='true'?{$ne:null}:null}).sort({price:1})})));operationsRouter.patch('/plans/:id',wrap(async(req:Request,res:Response)=>{const p=await MembershipPlan.findOneAndUpdate({_id:req.params.id,gymId:gym(req),archivedAt:null},planInput.partial().parse(req.body),{new:true,runValidators:true});if(!p)return res.status(404).json({error:'Plan not found'});return res.json({plan:p});}));operationsRouter.post('/plans/:id/archive',wrap(async(req:Request,res:Response)=>{const p=await MembershipPlan.findOneAndUpdate({_id:req.params.id,gymId:gym(req),archivedAt:null},{archivedAt:new Date()},{new:true});if(!p)return res.status(404).json({error:'Plan not found'});return res.json({plan:p});}));operationsRouter.post('/plans/:id/restore',wrap(async(req:Request,res:Response)=>{const p=await MembershipPlan.findOneAndUpdate({_id:req.params.id,gymId:gym(req),archivedAt:{$ne:null}},{$unset:{archivedAt:1}},{new:true});if(!p)return res.status(404).json({error:'Archived plan not found'});return res.json({plan:p});}));
function addDuration(date:Date,n:number,unit:string){const d=new Date(date);if(unit==='days')d.setDate(d.getDate()+n);if(unit==='months')d.setMonth(d.getMonth()+n);if(unit==='years')d.setFullYear(d.getFullYear()+n);return d;}
operationsRouter.post('/memberships',wrap(async(req:Request,res:Response)=>{const x=membershipInput.parse(req.body),g=gym(req);const [member,plan,active]=await Promise.all([Member.findOne({_id:x.memberId,gymId:g,archivedAt:null}),MembershipPlan.findOne({_id:x.planId,gymId:g,archivedAt:null}),Membership.findOne({gymId:g,memberId:x.memberId,status:{$in:['active','scheduled']},endDate:{$gte:x.startDate}})]);if(!member||!plan)return res.status(404).json({error:'Member or plan not found'});if(active)return res.status(409).json({error:'Member already has an active or scheduled membership'});if(x.discount>plan.price)return res.status(400).json({error:'Discount exceeds plan price'});const endDate=addDuration(x.startDate,plan.duration,plan.durationUnit);const m=await Membership.create({gymId:g,memberId:member._id,planId:plan._id,startDate:x.startDate,endDate,membershipPrice:plan.price,discount:x.discount,finalAmount:plan.price-x.discount,status:x.startDate<=new Date()?'active':'scheduled'});return res.status(201).json({membership:m});}));
operationsRouter.get('/memberships',wrap(async(req:Request,res:Response)=>{const f:any={gymId:gym(req)};if(req.query.status)f.status=String(req.query.status);const items=await Membership.find(f).populate('memberId','fullName memberId phone email').populate('planId','name duration durationUnit').sort({endDate:1});return res.json({items});}));
operationsRouter.post('/memberships/:id/cancel',wrap(async(req:Request,res:Response)=>{const m=await Membership.findOneAndUpdate({_id:req.params.id,gymId:gym(req),status:{$in:['active','scheduled']}},{status:'cancelled'},{new:true});if(!m)return res.status(404).json({error:'Active membership not found'});return res.json({membership:m});}));
operationsRouter.post('/memberships/:id/renew',wrap(async(req:Request,res:Response)=>{const old=await Membership.findOne({_id:req.params.id,gymId:gym(req)});if(!old)return res.status(404).json({error:'Membership not found'});const input=z.object({startDate:z.coerce.date().optional(),discount:z.coerce.number().nonnegative().default(0)}).parse(req.body);const plan=await MembershipPlan.findOne({_id:old.planId,gymId:gym(req)});if(!plan)return res.status(404).json({error:'Plan not found'});const start=input.startDate??new Date(Math.max(Date.now(),old.endDate.getTime()));const end=addDuration(start,plan.duration,plan.durationUnit);const m=await Membership.create({gymId:gym(req),memberId:old.memberId,planId:plan._id,startDate:start,endDate:end,membershipPrice:plan.price,discount:input.discount,finalAmount:plan.price-input.discount,status:start<=new Date()?'active':'scheduled',renewedFrom:old._id});return res.status(201).json({membership:m});}));
operationsRouter.post('/memberships/:id/remind',wrap(async(req:Request,res:Response)=>{
  const g=gym(req);
  const membership=await Membership.findOne({_id:req.params.id,gymId:g,status:{$in:['active','scheduled','expired']}}).populate('memberId','fullName email memberId').populate('planId','name');
  if(!membership) return res.status(404).json({error:'Membership not found'});
  const member:any=membership.memberId;
  const plan:any=membership.planId;
  if(!member?.email) return res.status(400).json({error:'This member has no email on file.'});
  const gymDoc=await Gym.findById(g).select('name email phone logoUrl notificationSettings');
  if(!gymDoc) return res.status(404).json({error:'Gym not found'});
  if(gymDoc.notificationSettings?.renewalReminder===false) return res.status(400).json({error:'Renewal reminders are turned off in gym settings.'});
  const {sendRenewalReminderEmail}=await import('../services/email.js');
  const balance=Number(membership.finalAmount)-Number(membership.paidAmount||0);
  try{
    await sendRenewalReminderEmail({
      to:member.email,
      memberName:member.fullName,
      planName:plan?.name||'Membership',
      endDate:membership.endDate,
      balance,
      gymName:gymDoc.name,
      gymEmail:gymDoc.email||undefined,
      gymPhone:gymDoc.phone||undefined,
      logoDataUri:await logoDataUri(gymDoc.logoUrl),
    });
    await Notification.create({
      gymId:g,
      memberId:member._id,
      type:'renewal_reminder',
      idempotencyKey:`renewal_reminder:${String(membership._id)}:${Date.now()}`,
      recipient:member.email,
      subject:`Renewal reminder from ${gymDoc.name}`,
      status:'sent',
      attempts:1,
      sentAt:new Date(),
      payload:{membershipId:String(membership._id)},
    });
    return res.json({message:`Renewal reminder sent to ${member.email}`});
  }catch(err){
    const message=err instanceof Error?err.message:'Could not send renewal reminder';
    await Notification.create({
      gymId:g,
      memberId:member._id,
      type:'renewal_reminder',
      idempotencyKey:`renewal_reminder_failed:${String(membership._id)}:${Date.now()}`,
      recipient:member.email,
      subject:`Renewal reminder from ${gymDoc.name}`,
      status:'failed',
      attempts:1,
      lastError:message,
      payload:{membershipId:String(membership._id)},
    }).catch(()=>undefined);
    return res.status(502).json({error:'Could not send reminder email. Check Brevo settings.'});
  }
}));
const paymentInput=z.object({memberId:z.string(),membershipId:z.string(),amount:z.coerce.number().positive(),method:z.enum(['cash','upi','card','bank_transfer']),paymentDate:z.coerce.date().optional(),transactionReference:z.string().max(120).optional(),notes:z.string().max(500).optional()});
operationsRouter.post('/payments',wrap(async(req:Request,res:Response)=>{
  const x=paymentInput.parse(req.body),g=gym(req);
  const m=await Membership.findOne({_id:x.membershipId,gymId:g,memberId:x.memberId}).populate('planId','name');
  if(!m)return res.status(404).json({error:'Membership not found'});
  const balance=m.finalAmount-m.paidAmount;
  if(x.amount>balance)return res.status(400).json({error:'Payment exceeds remaining balance'});
  const member=await Member.findOne({_id:x.memberId,gymId:g}).select('fullName email');
  if(!member)return res.status(404).json({error:'Member not found'});
  const gymDoc=await Gym.findById(g).select('name email phone logoUrl notificationSettings');
  if(!gymDoc)return res.status(404).json({error:'Gym not found'});
  const p=await Payment.create({...x,gymId:g,receiptNumber:`GF-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`});
  m.paidAmount+=x.amount;
  m.paymentStatus=m.paidAmount>=m.finalAmount?'paid':'partial';
  await m.save();
  const remainingBalance=m.finalAmount-m.paidAmount;
  const emailResult:{sent:boolean;error?:string}={sent:false};
  if(gymDoc.notificationSettings?.paymentReceipt!==false && member.email){
    try{
      const {sendPaymentReceiptEmail}=await import('../services/email.js');
      const plan:any=m.planId;
      await sendPaymentReceiptEmail({
        to:member.email,
        memberName:member.fullName,
        gymName:gymDoc.name,
        gymEmail:gymDoc.email||undefined,
        gymPhone:gymDoc.phone||undefined,
        amount:p.amount,
        method:p.method,
        receiptNumber:p.receiptNumber,
        paymentDate:p.paymentDate||new Date(),
        remainingBalance,
        planName:plan?.name,
        reference:p.transactionReference||undefined,
        logoDataUri:await logoDataUri(gymDoc.logoUrl),
      });
      emailResult.sent=true;
      await Notification.create({
        gymId:g,
        memberId:member._id,
        type:'payment_receipt',
        idempotencyKey:`payment_receipt:${String(p._id)}`,
        recipient:member.email,
        subject:`Payment receipt from ${gymDoc.name}`,
        status:'sent',
        attempts:1,
        sentAt:new Date(),
        payload:{paymentId:String(p._id),receiptNumber:p.receiptNumber},
      });
    }catch(err){
      emailResult.error=err instanceof Error?err.message:'Could not send payment receipt';
      await Notification.create({
        gymId:g,
        memberId:member._id,
        type:'payment_receipt',
        idempotencyKey:`payment_receipt_failed:${String(p._id)}`,
        recipient:member.email,
        subject:`Payment receipt from ${gymDoc.name}`,
        status:'failed',
        attempts:1,
        lastError:emailResult.error,
        payload:{paymentId:String(p._id),receiptNumber:p.receiptNumber},
      }).catch(()=>undefined);
    }
  }else if(!member.email){
    emailResult.error='Member has no email on file';
  }
  return res.status(201).json({payment:p,remainingBalance,email:emailResult});
}));
operationsRouter.get('/payments',wrap(async(req:Request,res:Response)=>{const items=await Payment.find({gymId:gym(req)}).populate('memberId','fullName memberId').sort({paymentDate:-1}).limit(200);return res.json({items});}));operationsRouter.get('/payments/:id',wrap(async(req:Request,res:Response)=>{const p=await Payment.findOne({_id:req.params.id,gymId:gym(req)}).populate('memberId').populate('membershipId');if(!p)return res.status(404).json({error:'Payment not found'});return res.json({payment:p});}));
operationsRouter.get('/dashboard',wrap(async(req:Request,res:Response)=>{const g=gym(req),now=new Date(),month=new Date(now.getFullYear(),now.getMonth(),1),in7=new Date(Date.now()+7*864e5),in30=new Date(Date.now()+30*864e5);await Membership.updateMany({gymId:g,status:{$in:['active','scheduled']},startDate:{$lte:now},endDate:{$lt:now}},{status:'expired'});await Membership.updateMany({gymId:g,status:'scheduled',startDate:{$lte:now}},{status:'active'});const [total,active,expired,exp7,exp30,pending,revenue,newMembers,recentPayments,renewals,recentMembers]=await Promise.all([Member.countDocuments({gymId:g,archivedAt:null}),Membership.distinct('memberId',{gymId:g,status:'active',endDate:{$gte:now}}).then(x=>x.length),Membership.distinct('memberId',{gymId:g,status:'expired'}).then(x=>x.length),Membership.countDocuments({gymId:g,endDate:{$gte:now,$lte:in7},status:'active'}),Membership.countDocuments({gymId:g,endDate:{$gte:now,$lte:in30},status:'active'}),Membership.aggregate([{$match:{gymId:g}},{$group:{_id:null,v:{$sum:{$subtract:['$finalAmount','$paidAmount']}}}}]),Payment.aggregate([{$match:{gymId:g,paymentDate:{$gte:month},status:'successful'}},{$group:{_id:null,v:{$sum:'$amount'}}}]),Member.countDocuments({gymId:g,createdAt:{$gte:month}}),Payment.find({gymId:g}).populate('memberId','fullName').sort({paymentDate:-1}).limit(6),Membership.find({gymId:g,status:'active',endDate:{$gte:now,$lte:in30}}).populate('memberId','fullName phone').populate('planId','name').sort({endDate:1}),Member.find({gymId:g,archivedAt:null}).sort({createdAt:-1}).limit(6)]);return res.json({stats:{totalMembers:total,activeMembers:active,expiredMembers:expired,expiringIn7Days:exp7,expiringIn30Days:exp30,pendingPayments:pending[0]?.v??0,revenueThisMonth:revenue[0]?.v??0,newMembersThisMonth:newMembers},recentPayments,upcomingRenewals:renewals,recentMembers});}));
operationsRouter.get('/reports/summary',wrap(async(req:Request,res:Response)=>{const g=gym(req),from=req.query.from?new Date(String(req.query.from)):new Date(new Date().getFullYear(),0,1),to=req.query.to?new Date(String(req.query.to)):new Date();const [payments,members,renewals]=await Promise.all([Payment.aggregate([{$match:{gymId:g,paymentDate:{$gte:from,$lte:to},status:'successful'}},{$group:{_id:{$dateToString:{format:'%Y-%m',date:'$paymentDate'}},revenue:{$sum:'$amount'},count:{$sum:1}}},{$sort:{_id:1}}]),Member.countDocuments({gymId:g,createdAt:{$gte:from,$lte:to}}),Membership.countDocuments({gymId:g,renewedFrom:{$ne:null},createdAt:{$gte:from,$lte:to}})]);return res.json({payments,newMembers:members,renewals});}));
operationsRouter.get('/notifications',wrap(async(req:Request,res:Response)=>res.json({items:await Notification.find({gymId:gym(req)}).sort({createdAt:-1}).limit(100)})));
operationsRouter.get('/settings',wrap(async(req:Request,res:Response)=>{const gymDoc=await Gym.findOne({_id:gym(req),ownerId:req.auth!.userId});return res.json({settings:gymDoc});}));
operationsRouter.patch('/settings',wrap(async(req:Request,res:Response)=>{const data=z.object({name:z.string().min(1).max(120),email:z.string().email().optional().or(z.literal('')),phone:z.string().max(40).optional(),address:z.string().max(500).optional(),logoUrl:z.string().max(500).optional().or(z.literal('')),timezone:z.string().max(60).optional(),notificationSettings:z.object({welcome:z.boolean(),membershipConfirmation:z.boolean(),paymentReceipt:z.boolean(),renewalReminder:z.boolean(),expiry:z.boolean(),renewalConfirmation:z.boolean()}).optional()}).strict().parse(req.body);const settings=await Gym.findOneAndUpdate({_id:gym(req),ownerId:req.auth!.userId},data,{new:true,runValidators:true});return res.json({settings});}));
operationsRouter.post('/settings/logo',(req:Request,res:Response,next)=>{
  logoUpload.single('logo')(req,res,(err)=>{
    if(err) return res.status(400).json({error:err.message||'Could not upload logo'});
    return wrap(async(innerReq:Request,innerRes:Response)=>{
      if(!innerReq.file) return innerRes.status(400).json({error:'Choose a PNG or JPG logo to upload.'});
      const g=gym(innerReq);
      const current=await Gym.findOne({_id:g,ownerId:innerReq.auth!.userId});
      if(!current) return innerRes.status(404).json({error:'Gym not found'});
      await removeLogoFile(current.logoUrl);
      const logoUrl=publicLogoPath(innerReq.file.filename);
      current.logoUrl=logoUrl;
      await current.save();
      return innerRes.json({settings:current,logoUrl});
    })(req,res,next);
  });
});
operationsRouter.delete('/settings/logo',wrap(async(req:Request,res:Response)=>{
  const current=await Gym.findOne({_id:gym(req),ownerId:req.auth!.userId});
  if(!current) return res.status(404).json({error:'Gym not found'});
  await removeLogoFile(current.logoUrl);
  current.logoUrl=undefined;
  await current.save();
  return res.json({settings:current});
}));
