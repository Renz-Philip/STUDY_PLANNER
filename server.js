require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const app = express();

// ======= Middleware =======
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ======= Home Route =======
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ======= MongoDB Connection =======
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Atlas Connected"))
  .catch(err => console.error("❌ DB Error:", err));

// ======= Task Schema =======
const taskSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  task: { type: String, required: true },
  deadline: { type: Date, required: true },
  priority: { type: String, default: "Normal" },
  status: { type: String, default: "Pending" }
}, { timestamps: true });

const Task = mongoose.model("Task", taskSchema);

// ======= Task Routes =======
app.post("/add", async (req, res) => {
  try {
    const newTask = new Task(req.body);
    await newTask.save();
    res.status(201).json({ message: "Task added successfully" });
  } catch (err) {
    res.status(500).json({ error: "Error adding task", details: err.message });
  }
});

app.get("/tasks", async (req, res) => {
  try {
    const tasks = await Task.find().sort({ deadline: 1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: "Error fetching tasks" });
  }
});

app.put("/update/:id", async (req, res) => {
  try {
    const updatedTask = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedTask) return res.status(404).json({ error: "Task not found" });
    res.json({ message: "Task updated", updatedTask });
  } catch (err) {
    res.status(500).json({ error: "Error updating task" });
  }
});

app.delete("/delete/:id", async (req, res) => {
  try {
    const deletedTask = await Task.findByIdAndDelete(req.params.id);
    if (!deletedTask) return res.status(404).json({ error: "Task not found" });
    res.json({ message: "Task deleted" });
  } catch (err) {
    res.status(500).json({ error: "Error deleting task" });
  }
});

// ======= Gemini Chatbot API =======
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post("/api/chat", async (req, res) => {
  try {
    const { history, message } = req.body;
    
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash-lite",
      systemInstruction: "You are a helpful AI Study Assistant built into a Study Planner app. Your goal is to help a BCA student organize their studies, explain concepts like web development, C++, Python, and computational mathematics simply, and keep them motivated. Keep responses concise.",
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    });

    const chat = model.startChat({ history: history || [] });
    const result = await chat.sendMessage(message);
    
    res.json({ reply: result.response.text() });
  } catch (error) {
    console.error("Gemini API Error:", error.message);
    res.status(500).json({ error: error.message || "Unknown API Error" });
  }
});

// ======= Start Server =======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});