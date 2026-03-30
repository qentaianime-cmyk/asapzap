import mongoose from "mongoose"

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable")
}

interface MongooseCache {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined
}

const cached: MongooseCache = global.mongooseCache ?? { conn: null, promise: null }
global.mongooseCache = cached

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI!, {
        bufferCommands: false,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      })
      .then((m) => {
        console.log("[MongoDB] Connected")

        m.connection.on("disconnected", () => {
          console.warn("[MongoDB] Disconnected — will attempt reconnect")
          cached.conn = null
          cached.promise = null
        })
        m.connection.on("reconnected", () => {
          console.log("[MongoDB] Reconnected")
        })
        m.connection.on("error", (err) => {
          console.error("[MongoDB] Connection error:", err)
        })

        return m
      })
      .catch((err) => {
        cached.promise = null
        console.error("[MongoDB] Initial connection error:", err)
        throw err
      })
  }

  cached.conn = await cached.promise
  return cached.conn
}
