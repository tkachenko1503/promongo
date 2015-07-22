var pmongo = require('promised-mongo');
var db = pmongo('mongodb://127.0.0.1:27017/original', ['users']);

db.users
    .find()
    .then(function(){
        console.log(arguments);
        db.close();
    });
