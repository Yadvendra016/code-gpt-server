const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const User = require("./model/User");
const Chat = require("./model/Chat");
const app = express();
require("dotenv").config();

mongoose
  .connect(
    "mongodb+srv://yadvendrashukla919:QnqFftzmKjcM7KOu@cluster0.48zc4l7.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
  )
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

app.use(express.json());
app.use(cookieParser());

const allowedOrigins = [
  "http://localhost:3000",
  "https://dsa-gpt-client.onrender.com",
];

app.use(cors({ origin: allowedOrigins, credentials: true }));

const authMiddleware = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.sendStatus(401);

  jwt.verify(token, "secret", (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// register route
app.post("/api/register", async (req, res) => {
  try {
    const { name, gender, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, gender, email, password: hashedPassword });
    await user.save();

    // Generate token after successful registration
    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name, gender: user.gender },
      "secret",
      { expiresIn: "1h" }
    );

    // Set the token as a cookie and send success response
    res
      .cookie("token", token, {
        httpOnly: true,
        secure: true,
        sameSite: "None",
      })
      .sendStatus(201);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error creating account" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.sendStatus(401);
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.sendStatus(401);

  const token = jwt.sign(
    { id: user._id, email: user.email, name: user.name, gender: user.gender },
    "secret",
    { expiresIn: "1h" }
  );
  res
    .cookie("token", token, { httpOnly: true, secure: true, sameSite: "None" })
    .sendStatus(200);
});

app.get("/api/me", authMiddleware, (req, res) => {
  res.json(req.user);
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("token").sendStatus(200);
});

// Endpoint to save chat history
app.post("/api/chat", authMiddleware, async (req, res) => {
  const { userMessage, botMessage, userId, conversationId } = req.body;

  try {
    const chat = new Chat({
      userMessage,
      botMessage,
      userId,
      conversationId:
        conversationId || new mongoose.Types.ObjectId().toString(), // Generate if not provided
    });

    await chat.save();
    res.status(201).json(chat);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error saving chat");
  }
});

// get all chats infor
app.get("/api/chats", authMiddleware, async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.user.id })
      .sort({
        createdAt: 1,
      })
      .lean();
    res.json(chats);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

// Delete a chat pair (user message and corresponding bot message)
app.delete("/api/chat/:id", authMiddleware, async (req, res) => {
  try {
    // Validate the ID format first
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid chat ID format" });
    }

    const deletedChat = await Chat.findByIdAndDelete(req.params.id);
    if (!deletedChat) {
      return res.status(404).json({ error: "Chat not found" });
    }
    res.sendStatus(204);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error while deleting chat" });
  }
});

// Update a user message and replace subsequent conversation
app.put("/api/chat/:id", authMiddleware, async (req, res) => {
  try {
    const { userMessage, botMessage, conversationId } = req.body;

    // Find the chat first to make sure it exists
    const chatToUpdate = await Chat.findById(req.params.id);

    if (!chatToUpdate) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // Update the existing chat message
    await Chat.findByIdAndUpdate(req.params.id, {
      userMessage,
      botMessage,
      updatedAt: Date.now(),
    });

    // Delete all subsequent messages in this conversation
    if (chatToUpdate.conversationId) {
      await Chat.deleteMany({
        userId: req.user.id,
        conversationId: chatToUpdate.conversationId,
        _id: { $ne: req.params.id }, // Don't delete the message we just updated
        createdAt: { $gt: chatToUpdate.createdAt },
      });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Update chat error:", error);
    res.status(500).json({ error: "Server error while updating chat" });
  }
});

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log("Server is running on port 8000");
});
