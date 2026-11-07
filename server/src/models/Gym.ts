import mongoose, { Schema } from 'mongoose';

const gymSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  address: { type: String, trim: true, maxlength: 500 },
  logoUrl: { type: String, trim: true },
  timezone: { type: String, default: 'Asia/Kolkata' },
}, { timestamps: true });
export const Gym = mongoose.model('Gym', gymSchema);
