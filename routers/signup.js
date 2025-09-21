import { Router} from "express";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import bcrypt from "bcrypt"

const router = Router();

function checkError(err , req, res, next) {
    console.log(err.stack);
    res.status(500).send('Something went wrong')
}

const JWT_SECRET_KEY = process.env.SECRET_KEY

router.use(checkError);

router.post("/", async (req,res) => {
   const { username , password , email } = req.body;
   try {
     const encryptedPassword = await bcrypt.hash(password ,10)
     const result = await pool.query("INSERT INTO users(username , email , password) VALUES($1 , $2 , $3) RETURNING *",[username , email , encryptedPassword]);
     const user = result.rows[0];
     
     const token = jwt.sign({ id:user.id, username: user.username, email: user.email } , JWT_SECRET_KEY ,{ expiresIn: '1d'});
     res.cookie("token", token, {
      httpOnly:true,
      sameSite:"lax",
      secure:process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000 
    });
    res.json({ message: "Signup successful & logged in!", user });

   } catch(err) {
    console.log(err)
   }

  
})

export default router