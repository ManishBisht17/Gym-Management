import mongoose, { Schema } from 'mongoose';

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['owner', 'staff'], default: 'owner', required: true },
  gymId: { type: Schema.Types.ObjectId, ref: 'Gym', required: true, index: true },
}, { timestamps: true });
export const User = mongoose.model('User', userSchema);
