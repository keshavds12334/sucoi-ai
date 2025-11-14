import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import mongoose from "mongoose";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY = process.env.API_KEY;
const MONGO_URI = process.env.MONGO_URI;

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection failed:", err));

// Updated Goal Schema - prevents duplicates
const goalSchema = new mongoose.Schema({
  username: String,
  day: String,
  taskId: Number,
  taskText: String,
  taskDone: Boolean,
  createdAt: { type: Date, default: Date.now },
});

goalSchema.index({ username: 1, taskId: 1 }, { unique: true });

const chatSchema = new mongoose.Schema({
  username: String,
  userMessage: String,
  botReply: String,
  createdAt: { type: Date, default: Date.now },
});

// Add User Schema with security question
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  securityQuestion: String,
  securityAnswer: String,
  createdAt: { type: Date, default: Date.now },
});

const Goal = mongoose.model("Goal", goalSchema);
const Chat = mongoose.model("Chat", chatSchema);
const User = mongoose.model("User", userSchema);

// User signup
app.post("/signup", async (req, res) => {
  try {
    const { name, email, password, securityQuestion, securityAnswer } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists!" });
    }
    
    // Create new user
    const newUser = new User({ 
      name, 
      email, 
      password,
      securityQuestion,
      securityAnswer: securityAnswer.toLowerCase().trim() // Store lowercase for comparison
    });
    await newUser.save();
    
    res.json({ success: true, message: "User created successfully!" });
  } catch (err) {
    console.error("❌ Error signing up:", err);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// User signin
app.post("/signin", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email, password });
    
    if (user) {
      res.json({ success: true, user: { name: user.name, email: user.email } });
    } else {
      res.status(401).json({ error: "Invalid credentials!" });
    }
  } catch (err) {
    console.error("❌ Error signing in:", err);
    res.status(500).json({ error: "Failed to sign in" });
  }
});

// Verify security question
app.post("/verify-security", async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await User.findOne({ email });
    
    if (user) {
      res.json({ 
        success: true, 
        securityQuestion: user.securityQuestion 
      });
    } else {
      res.status(404).json({ error: "User not found!" });
    }
  } catch (err) {
    console.error("❌ Error verifying security:", err);
    res.status(500).json({ error: "Failed to verify security question" });
  }
});

// Reset password
app.post("/reset-password", async (req, res) => {
  try {
    const { email, securityAnswer, newPassword } = req.body;
    
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ error: "User not found!" });
    }
    
    // Compare security answers (case-insensitive)
    if (user.securityAnswer === securityAnswer.toLowerCase().trim()) {
      user.password = newPassword;
      await user.save();
      res.json({ success: true, message: "Password reset successfully!" });
    } else {
      res.status(401).json({ error: "Incorrect security answer!" });
    }
  } catch (err) {
    console.error("❌ Error resetting password:", err);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// Chat endpoint
app.post("/chat", async (req, res) => {
  const { message: userMsg, username } = req.body;
  console.log("📩 Received:", userMsg);

  if (!userMsg) return res.json({ reply: "Please type something first." });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `You are Sucoi, a warm, kind, and empathetic virtual mental health companion. Be positive and understanding. The user says: "${userMsg}"`,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.8, maxOutputTokens: 500 },
        }),
      }
    );

    const data = await response.json();
    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      "Sorry, I didn't understand that. 💜";

    if (username) {
      await Chat.create({ username, userMessage: userMsg, botReply: reply });
    }

    res.json({ reply });
  } catch (err) {
    console.error("❌ Gemini API Error:", err);
    res.status(500).json({ reply: "Server error. Please try again later. 💜" });
  }
});

// Add or update goal (prevents duplicates)
app.post("/add-goal", async (req, res) => {
  try {
    const { username, goal } = req.body;
    const parsed = JSON.parse(goal);
    const { day, task } = parsed;

    await Goal.findOneAndUpdate(
      { username, taskId: task.id },
      {
        username,
        day,
        taskId: task.id,
        taskText: task.text,
        taskDone: task.done,
      },
      { upsert: true, new: true }
    );

    res.json({ message: "Goal saved successfully!" });
  } catch (err) {
    console.error("❌ Error saving goal:", err);
    res.status(500).json({ error: "Failed to save goal" });
  }
});

// Get user goals
app.get("/get-goals/:username", async (req, res) => {
  try {
    const goals = await Goal.find({ username: req.params.username }).sort({ createdAt: 1 });
    
    const formattedGoals = goals.map(g => ({
      _id: g._id,
      goal: JSON.stringify({
        day: g.day,
        task: {
          id: g.taskId,
          text: g.taskText,
          done: g.taskDone
        }
      })
    }));
    
    res.json(formattedGoals);
  } catch (err) {
    console.error("❌ Error fetching goals:", err);
    res.status(500).json({ error: "Failed to fetch goals" });
  }
});

// Update goal
app.post("/update-goal", async (req, res) => {
  try {
    const { username, goal } = req.body;
    const parsed = JSON.parse(goal);
    const { day, task } = parsed;

    const result = await Goal.findOneAndUpdate(
      { username, taskId: task.id },
      {
        day,
        taskText: task.text,
        taskDone: task.done,
      },
      { new: true }
    );

    if (result) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Goal not found" });
    }
  } catch (err) {
    console.error("❌ Error updating goal:", err);
    res.status(500).json({ error: "Failed to update goal" });
  }
});

// Delete goal
app.post("/delete-goal", async (req, res) => {
  try {
    const { username, taskId } = req.body;

    const result = await Goal.findOneAndDelete({
      username,
      taskId,
    });

    if (result) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Goal not found" });
    }
  } catch (err) {
    console.error("❌ Error deleting goal:", err);
    res.status(500).json({ error: "Failed to delete goal" });
  }
});

// Get chat history
app.get("/get-chats/:username", async (req, res) => {
  try {
    const chats = await Chat.find({ username: req.params.username }).sort({ createdAt: 1 });
    res.json(chats);
  } catch (err) {
    console.error("❌ Error fetching chats:", err);
    res.status(500).json({ error: "Failed to fetch chats" });
  }
});

// Delete chat
app.post("/delete-chat", async (req, res) => {
  try {
    const { chatId } = req.body;
    
    const result = await Chat.findByIdAndDelete(chatId);
    
    if (result) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Chat not found" });
    }
  } catch (err) {
    console.error("❌ Error deleting chat:", err);
    res.status(500).json({ error: "Failed to delete chat" });
  }
});

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.resolve(__dirname, "dashboard.html"));
});

app.listen(3000, () =>
  console.log("✅ Sucoi Bot running at http://localhost:3000")
);