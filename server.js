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

// Updated CORS configuration
app.use(
  cors({
    origin: "https://dsa-gpt-client.onrender.com",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

// Diagnose authentication issues
app.use((req, res, next) => {
  console.log("Request cookies:", req.cookies);
  console.log("Auth header:", req.headers.authorization);
  next();
});

const authMiddleware = (req, res, next) => {
  const token = req.cookies.token;

  console.log("Auth middleware - token:", token ? "present" : "missing");

  if (!token) return res.status(401).json({ error: "No authentication token" });

  jwt.verify(token, "secret", (err, user) => {
    if (err) {
      console.log("Token verification error:", err.message);
      return res.status(403).json({ error: "Invalid or expired token" });
    }
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
        maxAge: 3600000,
        path: "/",
      })
      .status(201)
      .json({
        message: "Account created successfully",
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          gender: user.gender,
        },
      });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error creating account" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name, gender: user.gender },
      "secret",
      { expiresIn: "1h" }
    );

    res
      .cookie("token", token, {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        maxAge: 3600000,
        path: "/",
      })
      .status(200)
      .json({
        message: "Login successful",
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          gender: user.gender,
        },
      });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error during login" });
  }
});

app.get("/api/me", authMiddleware, (req, res) => {
  res.json(req.user);
});

app.post("/api/logout", (req, res) => {
  res
    .clearCookie("token", {
      httpOnly: true,
      secure: true,
      sameSite: "None",
    })
    .status(200)
    .json({ message: "Logged out successfully" });
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

// get all chats info
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
    res.status(500).json({ error: "Error fetching chats" });
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

// Test endpoint to verify server is running
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "Server is running" });
});

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
