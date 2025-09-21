import passport from "passport";
import { Strategy as GoogleStrategy  } from "passport-google-oauth20";
import { Strategy as GitHubStrategy} from "passport-github2";
import pool from "./db.js";
import jwt from "jsonwebtoken";

const JWT_SECRET_KEY = process.env.SECRET_KEY;

passport.use(
    new GoogleStrategy(
     {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/oauth/google/callback",
     }, 
     async (accessToken , refreshToken,profile,done) => {
        try {
            let user;
            const result = await pool.query(
                "SELECT * FROM users WHERE provider=$1 AND provider_id=$2",
                ["google", profile.id]
            );

           if (result.rows.length) {
              user = result.rows[0];
            } else {
           
            const emailCheck = await pool.query(
                "SELECT * FROM users WHERE email=$1",
                [profile.emails?.[0].value]
            );

            if (emailCheck.rows.length) {
               
                user = emailCheck.rows[0];
                await pool.query(
                "UPDATE users SET provider=$1, provider_id=$2 WHERE id=$3",
                ["google", profile.id, user.id]
                );
            } else {
               
                const insert = await pool.query(
                `INSERT INTO users(username, email, provider, provider_id, name)
                VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                [
                    profile.displayName.replace(/\s+/g, "").toLowerCase(),
                    profile.emails?.[0].value,
                    "google",
                    profile.id,
                    profile.displayName,
                ]
                );
                user = insert.rows[0];
             }
            }

            const token = jwt.sign(
                { id: user.id , username:user.username, email:user.email },
                JWT_SECRET_KEY,
                { expiresIn: "1d" }
            );
            done(null, { user, token });
        } catch(err) {
            done(err , null)
        }
     }
    )
)

export default passport 