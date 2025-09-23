import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

const dbUrl = new URL(process.env.CONNECTION_STRING)

const pool = new Pool({
    user:dbUrl.username,
    password:dbUrl.password,
    port:dbUrl.port,
    database:dbUrl.pathname.slice(1),
    ssl:{ rejectUnauthorized: false } 
});

export default pool;