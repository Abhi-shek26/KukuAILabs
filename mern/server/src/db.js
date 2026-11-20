import mongoose from "mongoose";
import { MONGODB_URI } from "./env.js";

export async function connectDb() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  return mongoose.connection;
}

export async function closeDb() {
  await mongoose.disconnect();
}
