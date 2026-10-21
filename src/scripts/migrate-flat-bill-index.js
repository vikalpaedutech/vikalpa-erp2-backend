import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const run = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing from backend environment");
  }

  await mongoose.connect(process.env.MONGO_URI);
  const collection = mongoose.connection.collection("bills");
  const indexes = await collection.indexes();
  const oldUniqueBillNumberIndex = indexes.find(
    (index) => index.name === "billNumber_1" && index.unique === true
  );

  if (oldUniqueBillNumberIndex) {
    await collection.dropIndex("billNumber_1");
    console.log("Dropped old unique billNumber_1 index.");
  } else {
    console.log("No old unique billNumber_1 index found; nothing to migrate.");
  }

  await collection.createIndex({ billNumber: 1 });
  await collection.createIndex({ billGroupId: 1, createdAt: 1 });
  console.log("Flat bill indexes are ready.");
};

run()
  .catch((error) => {
    console.error("Flat bill index migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
