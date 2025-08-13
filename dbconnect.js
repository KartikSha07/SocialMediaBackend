const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config("./.env");


module.exports = async() =>{
    const mongo_url = process.env.MONGO_URI;
    try{
        const connect = await mongoose.connect(mongo_url,{
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log(`MongoDB Connected to ${connect.connection.host}`);
    }catch(err){
        console.log(err);
    }
    
}
