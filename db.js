import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

console.log("CONNECTION_STRING from env:", process.env.CONNECTION_STRING);
console.log("All env vars:", Object.keys(process.env));

const connectionString = process.env.CONNECTION_STRING;

if (!connectionString) {
    console.error("❌ CONNECTION_STRING environment variable is not set!");
    process.exit(1);
}


const dbUrl = new URL(process.env.CONNECTION_STRING)

const pool = new Pool({
    user:dbUrl.username,
    password:dbUrl.password,
    host:dbUrl.hostname,
    port:dbUrl.port,
    database:dbUrl.pathname.slice(1),
    ssl:{ rejectUnauthorized: false } 
});

export default pool;