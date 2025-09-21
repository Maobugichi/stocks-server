import { Router } from "express";
import passport from "passport";


const oauthRouter = Router();

oauthRouter.get("/google" , passport.authenticate("google", {scope:[ "profile", "email"]}));

oauthRouter.get('/google/callback' , 
 passport.authenticate("google",{ session:false,failureRedirect:"/login"}),
 (req,res) => {
    const { token } = req.user;

    res.cookie("token" , token , {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, 
    });
    res.redirect("http://localhost:5173/dashboard");
 }
)

export default oauthRouter