import { Router } from "express";
import pool from "../db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv"

dotenv.config();

const jwtSecret = process.env.SECRET_KEY

const loginRouter = Router();

loginRouter.post("/",async (req,res) => {
    try {
        const { email , password } = req.body;
        const result = await  pool.query('SELECT * FROM users WHERE email = $1',[email]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ message: "user doesnt exist" });
        }
       
        const user = result.rows[0]
        const dbPassword = user.password
        const userId = user.id
        const isPass = await bcrypt.compare(password,dbPassword);
        if (!isPass) {
          return res.status(401).json({ message: "invalid credentials" });
        }

        const token = jwt.sign({id: userId, username: user.username, email: user.email},jwtSecret,{ expiresIn:'7d'});

        res.cookie("token", token, {
            httpOnly: true,
            secure: true,           
            sameSite: "none",     
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: "/"
        })
        res.status(200).json({username:user.username, userId , email , onboarded:user.onboarded})

    } catch(err) {
        console.log(err)
        res.status(500).json(err)
    }
})

export default loginRouter