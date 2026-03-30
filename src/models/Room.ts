import mongoose, { Document, Model, Schema } from "mongoose"

export interface IRoom extends Document {
  roomId: string
  creatorUsername: string
  participants: string[]
  expiresAt: Date | null
  isPrivate: boolean
  createdAt: Date
  updatedAt: Date
}

interface IRoomModel extends Model<IRoom> {
  findByRoomId(roomId: string): Promise<IRoom | null>
}

const RoomSchema = new Schema<IRoom>(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
    },
    creatorUsername: {
      type: String,
      required: true,
    },
    participants: {
      type: [String],
      default: [],
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    isPrivate: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
)

RoomSchema.index({ roomId: 1 }, { unique: true })
RoomSchema.index({ participants: 1 })
RoomSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true })

RoomSchema.statics.findByRoomId = function (roomId: string) {
  return this.findOne({ roomId })
}

const Room: IRoomModel =
  (mongoose.models.Room as IRoomModel) ||
  mongoose.model<IRoom, IRoomModel>("Room", RoomSchema)

export default Room
