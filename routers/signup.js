import { Router} from "express";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit"

const signupRouter = Router();


const JWT_SECRET_KEY = process.env.SECRET_KEY

if (!JWT_SECRET_KEY) {
  throw new Error("SECRET_KEY environment variable is not set");
}


const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:5,
  message: {
    error:'Too many signup attempts, Please try again after 15mins'
  },
  standardHeaders: true, 
  legacyHeaders: false, 
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
})


signupRouter.post("/", signupLimiter, async (req,res) => {
   const username = req.body.username?.trim();
   const email = req.body.email?.trim().toLowerCase();
   const { password  } = req.body;
   if (!username || !password || !email) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
   try {
     const encryptedPassword = await bcrypt.hash(password ,10)
     const result = await pool.query("INSERT INTO users(username , email , password) VALUES($1 , $2 , $3) RETURNING id, username, email",[username , email , encryptedPassword]);
     const user = result.rows[0];
     
     const token = jwt.sign({ id:user.id, username: user.username, email: user.email } , JWT_SECRET_KEY , { expiresIn: '1d'});
     res.cookie("token", token, {
      httpOnly:true,
      sameSite:"lax",
      secure:process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000 
    });
    res.json({ message: "Signup successful & logged in!", 
      user: {
      id:user.id,
      username:user.username,
      email:user.email
     }});

   } catch(err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: "Unable to create account with provided details" });
    }
    return res.status(500).json({ error: "Signup failed" });
   }
})

export default signupRouter