import { Strategy } from 'passport-local'
import bcrypt from 'bcrypt'
import passport from 'passport'
import db from '../db/db.js'

//session yg dipanggil saat pertama kali login
passport.serializeUser((email, done) => {
    done(null, email) 
})

//session yg dipanggil setelahnya
passport.deserializeUser( async(email, done) => { 
    const query = await db.query("SELECT * FROM account WHERE email = $1", [email]);
    const user = query.rows[0]
    return done(null, user)
})

export default passport.use(
    new Strategy(
        { usernameField: 'email'}, //karena pada post form field, name = 'email'
        async(email, password, done) => {
            const query = await db.query("SELECT password FROM account WHERE email = $1", [email]);
            const result = query.rows[0];
            if (result && "password" in result && await bcrypt.compare(password, result.password)) done(null, email)
            else done(null, false, { message: "Invalid Credentials" })
        }
    )
)