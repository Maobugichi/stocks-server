import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

const jwtSecret =  process.env.SECRET_KEY


export function checkAuth(req,res,next) {
    const token = req.cookies.token;
    if (!token) return res.status(401).send("User unauthorized");

    try {
        const decoded = jwt.verify(token,jwtSecret);
        req.user = decoded;
        next();
    } catch(err) {
        res.status(500).json(err)
    }
}