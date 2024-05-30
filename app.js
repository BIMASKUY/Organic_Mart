import express from "express"
import "dotenv/config"
import expressLayouts from "express-ejs-layouts"
import bcrypt from "bcrypt"
import flash from "express-flash"
import { body, validationResult } from "express-validator"
import session from "express-session"
import passport from "passport"
import db from './db/db.js'
import pgSession from 'connect-pg-simple'
import { v4 as uuidv4 } from 'uuid'
import { format, min, parseISO } from 'date-fns'
import multer from 'multer'
import fs from 'fs'

import "./session/passport-config.js"

const app = express()

app.set("view engine", "ejs") 

app.use(
    session({
        store: new (pgSession(session)), //agar session disimpan di database ketika down (tidak perlu login ulang)
        secret: process.env.SECRET, //kode encrypt session (kalau bisa panjang)
        saveUninitialized: false, //kalau ga login, ga usah disimpen
        resave: false, //kalau ga ada perubahan, ga usah diupdate 
        cookie: {
            maxAge: 60 * 60 * 1000 //1 jam
        }
    })
);
app.use(passport.initialize())
app.use(passport.session())
app.use(flash()) //flash message 

app.use(express.static("public")) //agar dapat mengakses image dan css di folder "public"
app.use(express.urlencoded( {extended : true } )) //agar dapat "post" data pada form
app.use(expressLayouts) //menggunakan express-ejs-layouts
app.use(express.json()) //dapat post json

const layout = "layouts/template"

//dari "storage" sampai "upload" berisi mekanisme simpen file
const storage = multer.diskStorage({
    destination: function (req, file, cb){
        cb(null, "./public/img")
    },
    filename: function (req, file, cb){
        const fileName = Date.now() + '_' + file.originalname
        cb(null, fileName)
    }
})
const upload = multer({ storage: storage })


//Middleware untuk Header (Global)
app.use( async(req, res, next) => {

    //default (sebelum login)
    let totalCart = '0'
    let totalTransaction = '0'
    let userIcon = 'exclamation'
        
    //kalau login
    if(req.isAuthenticated()){
        userIcon = 'check'

        const idAccount = req.user.email
        const queryCart = await db.query("SELECT COUNT(*) FROM cart WHERE id_account = $1", [idAccount])
        const resultCart = queryCart.rows[0]
        totalCart = resultCart.count

        const currentTime = Date.now()
        const queryTransaction = await db.query("SELECT COUNT(*) FROM transaction WHERE id_account = $1 AND date_cod > $2", [idAccount, currentTime])
        const resultTransaction = queryTransaction.rows[0]
        totalTransaction = resultTransaction.count
    }

    //global_totalCart = cuma variabel, knp dikasih 'global_' ? untuk readibility jadi kalau ada bug gampang dicari
    res.locals.global_totalCart = totalCart
    res.locals.global_totalTransaction = totalTransaction
    res.locals.global_userIcon = userIcon
    res.locals.global_activeHeader = req.url
    next()
})

const isLogin = (req, res, next) => {
    if(req.isAuthenticated()) return next()
    res.redirect('/login')
}

const isValidProduct = async(req, res, next) => {
    const productID = req.params.id
    const query = await db.query("SELECT seller FROM product WHERE id = $1 ", [productID])
    const correctSeller = query.rows[0].seller
    const userEmailNow = req.user.email
    if(userEmailNow == correctSeller) return next()
    res.redirect('/')
}

const isValidCart = async(req, res, next) => {
    const cartID = req.params.id
    const query = await db.query("SELECT id_account FROM cart WHERE id = $1", [cartID])
    const correctUserCart = query.rows[0].id_account
    const userNow = req.user.email
    if(userNow === correctUserCart) return next()
    res.redirect('/')
}

app.get("/", async (req, res) => {
    //console.log(req.session)
    console.log(`Session ID: ${req.session.id}`)
    console.log(`Status: ${req.isAuthenticated()}`);
    console.log(req.user)
    //console.log(req.user.email)

    const currentTime = Date.now()

    const queryOur = await db.query("SELECT * FROM product WHERE quantity>0 AND exp>$1 LIMIT 8", [currentTime])
    const resultOur = queryOur.rows

    const queryBest = await db.query("SELECT * FROM product WHERE quantity>0 AND exp>$1 ORDER BY sold DESC LIMIT 3", [currentTime])
    const resultBest = queryBest.rows
    
    res.render("index", {layout, resultOur, resultBest});
})

app.get("/contact", (req, res) => {
    res.render("contact", {layout})
})

//buat lihat database account
app.get("/test", async (req, res) => {
    const query = await db.query("SELECT * FROM accoun", (err, result) => {
        if(err) res.send(err.message)
        else res.send(result.rows)
    })
})

app.get("/shop", async (req, res) => {
    const currentTime = Date.now()
    let {category, search, page} = req.query
    const currentUser = req.isAuthenticated() ? req.user.email : '' //login -> user, guest -> ''
    page = page ? parseInt(page) : 1
    const resultsPerPage = 4 //banyaknya barang yg muncul per page
    let query, result
    console.log({category, search, page})
    console.log({category: Boolean(category), search: Boolean(search), page: Boolean(page)})
    
    //query keseluruhan
    if(category && search) query = await db.query("SELECT product.*, account.name AS sellername FROM product JOIN account ON account.email = product.seller WHERE quantity>0 AND exp>$1 AND seller!=$2 AND category=$3 AND product.name ILIKE $4", [currentTime, currentUser, category.toLowerCase(), `%${search}%`])
    else if(category) query = await db.query("SELECT product.*, account.name AS sellername FROM product JOIN account ON account.email = product.seller WHERE quantity>0 AND exp>$1 AND seller!=$2 AND category=$3", [currentTime, currentUser, category.toLowerCase()])
    else if(search) query = await db.query("SELECT product.*, account.name AS sellername FROM product JOIN account ON account.email = product.seller WHERE quantity>0 AND exp>$1 AND seller!=$2 AND product.name ILIKE $3", [currentTime, currentUser, `%${search}%`])
    else query = await db.query("SELECT product.*, account.name AS sellername FROM product JOIN account ON account.email = product.seller WHERE quantity>0 AND exp>$1 AND seller!=$2", [currentTime, currentUser])
    result = query.rows

    const numOfResults = result.length
    const numberOfPages = Math.ceil(numOfResults/resultsPerPage) //banyaknya keseluruhan page
    const start = (page-1)*resultsPerPage
    console.log({page, numOfResults, numberOfPages, start})

    //query per pages
    if(category && search) query = await db.query("SELECT product.*, account.name AS sellername FROM product JOIN account ON account.email = product.seller WHERE quantity>0 AND exp>$1 AND seller!=$2 AND category=$3 AND product.name ILIKE $4 OFFSET $5 LIMIT $6", [currentTime, currentUser, category.toLowerCase(), `%${search}%`, start, resultsPerPage])
    else if(category) query = await db.query("SELECT product.*, account.name AS sellername FROM product JOIN account ON account.email = product.seller WHERE quantity>0 AND exp>$1 AND seller!=$2 AND category=$3 OFFSET $4 LIMIT $5", [currentTime, currentUser, category.toLowerCase(), start, resultsPerPage])
    else if(search) query = await db.query("SELECT product.*, account.name AS sellername FROM product JOIN account ON account.email = product.seller WHERE quantity>0 AND exp>$1 AND seller!=$2 AND product.name ILIKE $3 OFFSET $4 LIMIT $5", [currentTime, currentUser, `%${search}%`, start, resultsPerPage])
    else query = await db.query("SELECT product.*, account.name AS sellername FROM product JOIN account ON account.email = product.seller WHERE quantity>0 AND exp>$1 AND seller!=$2 OFFSET $3 LIMIT $4", [currentTime, currentUser, start, resultsPerPage])
    result = query.rows

    for(let i=0; i<result.length; i++){
        if(result[i].description.length > 80) result[i].description = result[i].description.slice(0,80) + "..."
        result[i].price = result[i].price.toLocaleString('de-DE')
    }

    //logic pagination bottom
    let size = 2 //banyaknya kotak, 2 kotak kiri + 1 kotak tengah + 2 kotak kanan
    let left = (page <= size) ? 1 : page - size
    let right = (page + size <= numberOfPages) ? page + size : numberOfPages
    if(page + size > right && left - size - (numberOfPages-page) > 0) left -= size - (numberOfPages-page)
    if(page <= size && right + (size-page+1) <= numberOfPages) right += (size-page+1)

    console.log({left, page, right})

    res.render("shop", {layout, result, category, search, page, left, right, numberOfPages})
})

app.get("/login", (req, res) => {
    if(req.isAuthenticated()) res.redirect('/profile') //kalau udh login lempar ke profile
    
    else{
        const invalidMessage = req.flash("invalidMessage")
        res.render("login", {layout: false, invalidMessage}) //kasus khusus tanpa template
    }
})

app.post("/login", passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login',
    failureFlash: true
}))

app.post(
    "/signUp",
    [
        body("email").custom(async (email) => {
            const query = await db.query("SELECT COUNT(*) FROM account WHERE email = $1", [email])
            const doubleEmail = Number(query.rows[0].count)
            if (doubleEmail) throw new Error("Email Already In Use")
            return true
        }),
        body("email", "Invalid Email").notEmpty().isEmail().normalizeEmail(),
        body("password", "Password At Least 3 Characters").isLength({min: 3})
    ],
    async(req, res) => {
        const validationError = validationResult(req).errors

        if(validationError.length > 0){
            const listError = ["Sign Up Failed"]
            validationError.forEach(error => listError.push(error.msg))
            req.flash("invalidMessage", listError)
        }
        else{
            const {email, name, phone, password} = req.body
            const hashPassword = await bcrypt.hash(password, 10); //salt = 10 artinya plaintext akan di hash sebanyak 2^10
            await db.query("INSERT INTO account(email, password, name, phone) VALUES ($1, $2, $3, $4)", [email, hashPassword, name, phone])
        }
        res.redirect("/login")
    }
)

app.get("/cart", isLogin, async (req, res) => {
    const invalidMessage = req.flash('invalidMessage')
    console.log(invalidMessage)

    const idAccount = req.user.email
    const query = await db.query("SELECT cart.*, product.name, product.price, product.exp, product.filename FROM cart JOIN product ON cart.id_product = product.id WHERE id_account = $1", [idAccount])
    let result = query.rows
    let cartTotal = 0
    for(let i=0; i<result.length; i++){
        result[i].exp = format((new Date(parseInt(result[i].exp))).toLocaleString(), 'dd MMMM yyyy')
        cartTotal += result[i].price * result[i].quantity
    }
    
    res.render("cart", {layout, result, cartTotal, invalidMessage})
})

app.route("/cart/:id")
    .get(isLogin, isValidCart, async (req, res) => {
        const idCart = req.params.id
        const query = await db.query("SELECT product.*, cart.quantity AS orderquantity, cart.id AS idcart, account.name AS sellername FROM cart JOIN product ON cart.id_product = product.id JOIN account ON account.email =  product.seller WHERE cart.id = $1", [idCart])
        let result = query.rows[0]
        result.exp = format((new Date(parseInt(result.exp))).toLocaleString(), 'dd MMMM yyyy')
        result.price = result.price.toLocaleString('de-DE')
        console.log(result)
        const invalidMessage = req.flash('invalidMessage')
        res.render("cart-detail", {layout, result, invalidMessage})
    })
    .post(
        isLogin, isValidCart,
        [
            body("quantity", "Input Not Valid").notEmpty().bail().toInt().isInt({min: 1}),
            body("quantity").custom((quantity, { req }) => {
                const stock = parseInt(req.body.stock)
                quantity = parseInt(quantity)
                if(quantity > stock) throw new Error("Insufficient Quantity")
                return true
            })
        ],
        async (req, res) => {
            const validationError = validationResult(req).errors
            const {idcart, quantity} = req.body
            if(validationError.length > 0){
                const listError = []
                validationError.forEach(error => listError.push(error.msg))
                req.flash("invalidMessage", listError)
                res.redirect(`/cart/${idcart}`)
            }
            else{
                await db.query("UPDATE cart SET quantity = $1 WHERE id = $2", [quantity, idcart])
                res.redirect('/cart')
            }
        }
    )

app.post("/deleteCart/:id", isLogin, isValidCart, async (req, res) => {
    const idCart = req.params.id
    await db.query("DELETE FROM cart WHERE id = $1", [idCart])
    res.redirect("/cart")
})

app.get("/transaction", isLogin, async (req, res) => {
    const userNow = req.user.email
    const query = await db.query("SELECT * FROM transaction WHERE id_account = $1", [userNow])
    const result = query.rows
    for(let i=0; i<result.length; i++){
        result[i].date_cod = format((new Date(parseInt(result[i].date_cod))).toLocaleString(), 'dd MMMM yyyy \'at\' HH:mm')
        result[i].date_transaction = format((new Date(parseInt(result[i].date_transaction))).toLocaleString(), 'dd MMMM yyyy')
    }
    res.render("transaction", {layout, result})
})

app.get("/myProduct", isLogin, async(req, res) => {
    const query = await db.query("SELECT * FROM product WHERE seller = $1", [req.user.email])
    const result = query.rows
    for(let i=0; i<result.length; i++) result[i].exp = format((new Date(parseInt(result[i].exp))).toLocaleString(), 'dd MMMM yyyy')
    //res.send(result)
    res.render("myProduct", {layout, result})
})

app.route("/myProduct/:id")
    .get(isLogin, isValidProduct, async(req, res) => {
        const id = req.params.id
        const query = await db.query("SELECT * FROM product WHERE id = $1", [id])
        const result = query.rows[0]
        result.exp = format((new Date(parseInt(result.exp))).toLocaleString(), 'yyyy-MM-dd')
        // res.send(result)
        res.render("detailMyProduct", {layout, result})
    })
    .post(isLogin, isValidProduct, async(req, res) => {
        let {price, quantity, weight, exp, location, description} = req.body
        const id = req.params.id
        exp = parseISO(exp).getTime()
        await db.query("UPDATE product SET price=$1, quantity=$2, weight=$3, exp=$4, location=$5, description=$6 WHERE id=$7", [price, quantity, weight, exp, location, description, id])
        res.redirect('/myProduct')
    })

app.post("/deleteProduct/:id", isLogin, isValidProduct, async(req, res) =>{
    const productID = req.params.id
    const query = await db.query("SELECT filename FROM product WHERE id=$1", [productID])
    const fileName = query.rows[0].filename

    await db.query("DELETE FROM product WHERE id=$1", [productID])

    if(fileName !== null) fs.unlinkSync(`./public/img/${fileName}`)
    res.redirect('/myProduct')
})

app.route("/shop/:id")
    .get(async (req, res) => {
        const {id} = req.params
        const query = await db.query("SELECT product.*, account.name AS sellername FROM product JOIN account ON product.seller = account.email WHERE id=$1", [id])
        let result = query.rows[0]
        result.exp = format((new Date(parseInt(result.exp))).toLocaleString(), 'dd MMMM yyyy')
        result.price = result.price.toLocaleString('de-DE')
        const invalidMessage = req.flash('invalidMessage')
        res.render("shop-detail", {layout, result, invalidMessage})
    })
    .post(
        isLogin, 
        [
            body("quantity", "Input Not Valid").notEmpty().bail().toInt().isInt({min: 1}),
            body("quantity").custom((quantity, { req }) => {
                const stock = parseInt(req.body.stock)
                quantity = parseInt(quantity)
                if(quantity > stock) throw new Error("Insufficient Quantity")
                return true
            })
        ],
        async (req, res) => {
            const validationError = validationResult(req).errors
            const idProduct = req.params.id
            if(validationError.length > 0){
                const listError = []
                validationError.forEach(error => listError.push(error.msg))
                req.flash("invalidMessage", listError)
                res.redirect(`/shop/${idProduct}`)
            }
            else{
                const idUser = req.user.email
                const id = uuidv4()
                const {quantity} = req.body
                await db.query("INSERT INTO cart(id, id_account, id_product, quantity) VALUES ($1, $2, $3, $4)", [id, idUser, idProduct, quantity])
                res.redirect('/cart')
            }
        }
    )

app.get("/profile", isLogin, async(req,res) => {
    const {email, name, phone} = req.user
    const invalidMessage = req.flash('invalidMessage')
    res.render("profile", {layout: false, email, name, phone, invalidMessage})
})

app.get("/chackout", isLogin, (req, res) => {
    res.render("chackout", {layout})
})

app.route("/addProduct")
    .get(isLogin, (req, res) => {
        res.render("addProduct", {layout})
    })
    .post(isLogin, (upload.single("namaFile")), async(req, res) => {
        let {name, category, price, quantity, weight, unit, exp, location, description} = req.body
        const {email} = req.user
        const id = uuidv4()
        exp = parseISO(exp).getTime()
        const {filename} = req.file
        //res.send({name, category, price, quantity, weight, unit, exp, location, description, })
        await db.query("INSERT INTO product(id, name, category, price, quantity, weight, unit, exp, location, description, seller, filename) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);", [id, name, category, price, quantity, weight, unit, exp, location, description, email, filename])
        res.redirect("/myProduct")
    })


app.post(
    "/editProfile", 
    [
        body("password", "Password At Least 3 Characters").isLength({min: 3})
    ],
    async(req, res) => {
        const validationError = validationResult(req).errors
        //res.send(validationError.length.toString())

        if(validationError.length > 0){
            req.flash("invalidMessage", validationError[0].msg)
        }
        else{
            const email = req.user.email
            const {name, phone, password} = req.body
            const hashPassword = await bcrypt.hash(password, 10); //salt = 10 artinya plaintext akan di hash sebanyak 2^10
            await db.query("UPDATE account SET password=$1, name=$2, phone=$3 WHERE email=$4", [hashPassword, name, phone, email])
        }
        res.redirect("/profile")
    })

app.post('/logout', isLogin, (req, res, next) => {
    req.logout( (err) => {
        if (err) { 
            return next(err)
        }
        res.redirect('/')
    })
})

app.route('/checkout')
    .get(isLogin, async (req, res) => {
        const idAccount = req.user.email
        const query = await db.query("SELECT product.*, cart.quantity AS orderquantity FROM cart JOIN product ON cart.id_product = product.id WHERE cart.id_account = $1", [idAccount])
        const result = query.rows
        
        let totalPrice = 0
        for(let i=0; i<result.length; i++) totalPrice += result[i].price * result[i].orderquantity
        
        //console.log(result)
        res.render('checkout', {layout, result, totalPrice})
    })
    .post(isLogin, async (req, res) => {
        //res.send(req.body)
        let { province, city, street, notes, id_product, orderquantity, dateCOD } = req.body
        const userNowEmail = req.user.email
        const userNowName = req.user.name
        dateCOD = parseISO(dateCOD).getTime()
        const dateTransaction = Date.now()
 
        let idCollection = []

        if ( Array.isArray(id_product) ) idCollection = id_product
        else idCollection.push(id_product)

        console.log(idCollection)

        //Start Transaction
        const client = await db.connect()
        
        try{
            await client.query('BEGIN')
            for(let i=0; i<idCollection.length; i++){
                const idProduct = idCollection[i]
                const queryProduct = await client.query("SELECT product.*, account.name AS nameother, account.email AS idother FROM product JOIN account ON account.email = product.seller WHERE id = $1", [idProduct])
                const resultProduct = queryProduct.rows[0]
                const { name, price, quantity, filename, nameother, idother } = resultProduct

                //validasi apakah jumlah barang mencukupi
                if (quantity - orderquantity[i] < 0) throw new Error(`${name} Insufficient Quantity`)

                //goes to buyer
                const idTransaction = uuidv4()
                await client.query("INSERT INTO transaction(id, id_product, id_account, nameother,action, nameproduct, filename, date_transaction, date_cod, price, quantity, province, city, street, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)", 
                                            [idTransaction, idProduct, userNowEmail, nameother, 'Buy', name, filename, dateTransaction, dateCOD, price, orderquantity[i], province, city, street, notes])

                //goes go seller
                await client.query("INSERT INTO transaction(id, id_product, id_account, nameother,action, nameproduct, filename, date_transaction, date_cod, price, quantity, province, city, street, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)", 
                                                [idTransaction, idProduct, idother, userNowName, 'Sell', name, filename, dateTransaction, dateCOD, price, orderquantity[i], province, city, street, notes])

                //pengurangan product setelah dibeli
                await client.query("UPDATE product SET quantity = quantity - $1, sold = sold + $1 WHERE id = $2", [orderquantity[i], idProduct])
            }

            //hapus cart ketika berhasil semua transaction
            await client.query("DELETE FROM cart WHERE id_account = $1", [userNowEmail])

            //setelah semua dipastikan berhasil
            await client.query('COMMIT')
            client.release()
            res.redirect('/transaction')

        } catch(error){
            await client.query('ROLLBACK')
            client.release()
            console.log(error.message)
            req.flash('invalidMessage', error.message)
            res.redirect('/cart')
        }
    })

//404 Not Found
app.use((req, res) => {
    res.render("404", {layout})
})

app.listen(process.env.PORT, () => {
    console.log(`Server Is Listening In Port ${process.env.PORT}`)
})