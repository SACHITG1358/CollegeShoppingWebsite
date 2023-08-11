
require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require("mongoose-findorcreate");
const cloudinary = require("./utils/cloudinary");
const upload = require("./utils/multer");

const app=express();

app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({
  extended: true
}));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useFindAndModify: false
});
mongoose.set("useCreateIndex", true);

const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  description: String,
  type: String,
  seller: [mongoose.Schema.Types.ObjectId],
  sellerName: String,
  image: String,
  cloudinary_id: String
});

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  contact: String,
  googleId: String,
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = new mongoose.model("User", userSchema);
const Product = new mongoose.model("Product", productSchema);

passport.use(User.createStrategy());

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL: "https://cryptic-plains-20900.herokuapp.com/auth/google/home",
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    function(accessToken, refreshToken, profile, cb) {
      //console.log(profile);
      //console.log(profile.photos[0].value);
      User.findOrCreate(
        { googleId: profile.id },
        { name: profile.displayName,email:profile.emails[0].value},
        function(err, user) {
          return cb(err, user);
        }
      );
    }
  )
);


app.get("/auth/google",
  passport.authenticate("google", { scope: ['profile','email'] }));

  app.get("/auth/google/home",
    passport.authenticate('google', { failureRedirect: '/login' }),
    function(req, res) {
      // Successful authentication, redirect home.
      res.redirect('/home');
    });


app.get("/login",function(req,res){
  res.render("login");
});

app.get("/signup",function(req,res){
  res.render("signup");
});

app.get("/",function(req,res){
  if (req.isAuthenticated()) {
        res.redirect("/home");
      } else {
    res.redirect("/login");
  }
});

app.get("/home",function(req,res){
  if (req.isAuthenticated()) {
        res.render("home",{user:req.user});
      } else {
    res.redirect("/login");
  }
});

app.get("/working",function(req,res){
  if (req.isAuthenticated()) {
        res.render("working",{user:req.user});
      } else {
    res.redirect("/login");
  }
});

app.get("/about",function(req,res){
  if (req.isAuthenticated()) {
        res.render("about",{user:req.user});
      } else {
    res.redirect("/login");
  }
});

app.get("/add",function(req,res){
  if (req.isAuthenticated()) {
        res.render("add",{user:req.user});
      } else {
    res.redirect("/login");
  }
});

app.get("/profile",function(req,res){
  if (req.isAuthenticated()) {
        Product.find({seller:req.user._id},function(err,foundProducts){
          if(err)
          console.log(err);
          else {
            res.render("profile",{user:req.user,product:foundProducts});
          }
        });
      } else {
    res.redirect("/login");
  }
});

app.get("/category/:type",function(req,res){
  if (req.isAuthenticated()) {
  const type=req.params.type;
  if(type==="All")
  {
    Product.find({},function(err,foundProducts){
      if(err)
      console.log(err);
      else {
        res.render("category",{user:req.user,product:foundProducts});
      }
    });
  }
  else {
    Product.find({type:type},function(err,foundProducts){
      if(err)
      console.log(err);
      else {
        res.render("category",{user:req.user,product:foundProducts});
      }
    });
  }
} else {
  res.redirect("/login");
}
});

app.get("/seller/:sellerId",function(req,res){
  if (req.isAuthenticated()) {
    const sellerId=req.params.sellerId;
    //console.log(sellerId);
      User.findById(sellerId,function(err,foundUser){
        if(err)
        console.log(err);
        else {
          Product.find({seller:foundUser._id},function(err,foundProducts){
            if(err)
            console.log(err);
            else {
              res.render("seller",{user:req.user,seller:foundUser,product:foundProducts});
            }
          });
        }
      });
    } else {
    res.redirect("/login");
  }
});

app.get("/delete/:productId",async function(req,res){
try{
  const foundproduct=await Product.findById(req.params.productId);
  await cloudinary.uploader.destroy(foundproduct.cloudinary_id);

  await foundproduct.remove();
  res.redirect("/profile");
} catch (err) {
    console.log(err);
  }
});

app.get("/edit",function(req,res){
  if (req.isAuthenticated()) {
        res.render("edit",{user:req.user});
      } else {
    res.redirect("/login");
  }
});

app.get("/logout",function(req,res){
  req.logout();
  res.redirect("/");
});

app.post("/signup", function(req, res) {
  User.register({username: req.body.username,name:req.body.fullname}, req.body.password, function(err, user) {
    if (err) {
      console.log(err);
      res.redirect("/login");
    } else {
      passport.authenticate("local")(req, res, function() {
        //console.log(req.user);
        const userEmail=req.user.username;
        User.findOneAndUpdate({_id:req.user._id},{$set:{email:userEmail}},{upsert: true},function(err, doc){
          if(err)
          console.log(err);
          else
          console.log("updated");
        });
        res.redirect("/home");
      });
    }
  });
});

app.post("/login", function(req, res) {
  const user = new User({
    username: req.body.username,
    password: req.body.password
  });

  req.login(user, function(err) {
    if (err)
      console.log(err);
    else {
      passport.authenticate("local")(req, res, function() {
        res.redirect("/home");
      });
    }
  });
});

// app.post("/add",function(req,res){
//   //console.log(req.file);
//   let product = new Product({
//     name:req.body.name,
//     price:req.body.price,
//     description:req.body.description,
//     type:req.body.radio,
//     seller:req.user._id,
//     sellerName:req.user.username,
//   });
//
//   product.save();
//
//   res.redirect("/category/All");
// });

app.post("/add", upload.single("image"), async (req, res) => {
  try {
    //Upload image to cloudinary
    //console.log(req.file);
    const result = await cloudinary.uploader.upload(req.file.path);

    // Create new user
    let product = new Product({
      name:req.body.name,
      price:req.body.price,
      description:req.body.description,
      type:req.body.radio,
      seller:req.user._id,
      sellerName:req.user.name,
      image: result.secure_url,
      cloudinary_id: result.public_id,
    });
    // Save user
    await product.save();
    //res.json(product);
    res.redirect("/category/All");
  } catch (err) {
    console.log(err);
  }
});

app.post("/edit",function(req,res){
  User.findOneAndUpdate({_id:req.user._id},{$set:{name:req.body.name,email:req.body.email,contact:req.body.contact}},{upsert: true},function(err, doc){
    if(err)
    console.log(err);
    else
    console.log("updated");
  });
  res.redirect("/profile");
});

app.listen(process.env.PORT || 3000,function(){
  console.log("server is listening to port 3000.");
});
