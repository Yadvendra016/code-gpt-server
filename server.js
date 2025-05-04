const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const User = require("./model/User");
const Chat = require("./model/Chat");
const app = express();

mongoose
  .connect(
    "mongodb+srv://yadvendrashukla919:QnqFftzmKjcM7KOu@cluster0.48zc4l7.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
  )
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: "http://localhost:3000", credentials: true }));

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
    res.cookie("token", token, { httpOnly: true }).sendStatus(201);
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
  res.cookie("token", token, { httpOnly: true }).sendStatus(200);
});

app.get("/api/me", authMiddleware, (req, res) => {
  res.json(req.user);
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("token").sendStatus(200);
});

// Endpoint to save chat history
app.post("/api/chat", authMiddleware, async (req, res) => {
  const { userMessage, botMessage, userId } = req.body;
  const chat = new Chat({ userMessage, botMessage, userId });
  await chat.save();
  res.sendStatus(201);
});

app.get("/api/chats", authMiddleware, async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.user.id }).sort({
      createdAt: 1,
    });
    res.json(chats);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.listen(8000, () => {
  console.log("Server is running on port 8000");
});
