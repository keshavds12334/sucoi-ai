import mongoose from 'mongoose';
   import dotenv from 'dotenv';

   dotenv.config();

   const MONGO_URI = process.env.MONGO_URI;

   mongoose.connect(MONGO_URI)
     .then(async () => {
       console.log('✅ Connected to MongoDB');
       
       const goalSchema = new mongoose.Schema({
         username: String,
         day: String,
         taskId: Number,
         taskText: String,
         taskDone: Boolean,
         createdAt: { type: Date, default: Date.now },
       });
       
       const Goal = mongoose.model('Goal', goalSchema);
       
       await Goal.deleteMany({});
       console.log('✅ All goals deleted!');
       
       mongoose.connection.close();
     })
     .catch(err => console.error('❌ Error:', err));