import mongoose, { Document, Model, Schema } from "mongoose"

export interface IUser extends Document {
  username: string
  hash: string
  followers: string[]
  following: string[]
  createdAt: Date
  updatedAt: Date
}

interface IUserModel extends Model<IUser> {
  findByUsername(username: string): Promise<IUser | null>
}

const UserSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 4,
      maxlength: 20,
      match: /^[a-z0-9_]+$/,
    },
    hash: {
      type: String,
      required: true,
    },
    followers: {
      type: [String],
      default: [],
    },
    following: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
)

UserSchema.index({ username: "text" })

UserSchema.statics.findByUsername = function (username: string) {
  return this.findOne({ username: username.toLowerCase().trim() })
}

const User: IUserModel =
  (mongoose.models.User as IUserModel) ||
  mongoose.model<IUser, IUserModel>("User", UserSchema)

export default User
