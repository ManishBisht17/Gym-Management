import mongoose,{Schema} from 'mongoose';
const schema=new Schema({gymId:{type:Schema.Types.ObjectId,ref:'Gym',required:true},name:{type:String,required:true,trim:true,maxlength:80},duration:{type:Number,required:true,min:1},durationUnit:{type:String,enum:['days','months','years'],required:true},price:{type:Number,required:true,min:0},description:{type:String,maxlength:500},archivedAt:Date},{timestamps:true}); schema.index({gymId:1,archivedAt:1,name:1});
export const MembershipPlan=mongoose.model('MembershipPlan',schema);
