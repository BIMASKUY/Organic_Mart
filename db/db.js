import pg from "pg"
import "dotenv/config"

const db = new pg.Pool() //connect database

export default db