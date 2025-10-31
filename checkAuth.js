import dotenv from "dotenv";
import jwt from "jsonwebtoken";


dotenv.config();

const jwtSecret = process.env.SECRET_KEY;

export function checkAuth(req, res, next) {
    let token = null;
  
    if (req.cookies.token) {
        token = req.cookies.token;
        console.log("🍪 Token from cookie");
    }
    
   
    if (!token && req.headers.authorization) {
        const authHeader = req.headers.authorization;
        if (authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7); 
            console.log("📱 Token from Authorization header");
        }
    }
    
    
    if (!token) {
        console.log("❌ No token found:", {
            hasCookie: !!req.cookies.token,
            hasAuthHeader: !!req.headers.authorization,
            cookies: Object.keys(req.cookies)
        });
        return res.status(401).json({ 
            message: "User unauthorized",
            reason: "No token provided"
        });
    }
    
    
    try {
        const decoded = jwt.verify(token, jwtSecret);
        req.user = decoded;
       
        next();
    } catch(err) {
        console.error("❌ Token verification failed:", err.message);
        return res.status(401).json({ 
            message: "Invalid or expired token",
            error: err.name // TokenExpiredError, JsonWebTokenError, etc.
        });
    }
}